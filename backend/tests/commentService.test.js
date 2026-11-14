const assert = require("node:assert/strict");
const test = require("node:test");
const { ApiError } = require("../src/errors/apiError");
const {
  CommentService,
  validateCommentBody,
} = require("../src/services/commentService");

function fixture({
  archived = false,
  createdBy = "10",
  assignedTo = "30",
  notificationFailsFor = [],
} = {}) {
  const state = {
    archived,
    notifications: [],
    comment: {
      id: "5",
      taskId: "50",
      authorId: "20",
      authorName: "Member",
      projectId: "1",
      ownerId: "10",
      body: "original",
      archived,
      createdAt: "2026-10-22T00:00:00.000Z",
      updatedAt: "2026-10-22T00:00:00.000Z",
    },
  };

  const task = {
    id: "50",
    projectId: "1",
    createdBy,
    assignedTo,
    title: "Example task",
  };

  const projectService = {
    authorizeTask: async (taskId, user, { write = false } = {}) => {
      if (
        user.role !== "ADMIN" &&
        user.id !== "10" &&
        user.id !== "20"
      ) {
        throw new ApiError(403, "FORBIDDEN", "No project access");
      }

      if (write && state.archived) {
        throw new ApiError(
          409,
          "ARCHIVED_PROJECT_READ_ONLY",
          "Archived projects cannot be changed",
        );
      }

      return {
        task: { ...task, id: taskId },
        project: { id: "1", archived: state.archived },
      };
    },

    assertProjectAccess: async (project, user) => {
      if (
        user.role !== "ADMIN" &&
        user.id !== project.ownerId &&
        user.id !== "20"
      ) {
        throw new ApiError(403, "FORBIDDEN", "No project access");
      }
    },

    assertWritable: (project) => {
      if (project.archived) {
        throw new ApiError(
          409,
          "ARCHIVED_PROJECT_READ_ONLY",
          "Archived projects cannot be changed",
        );
      }
    },
  };

  const commentRepository = {
    listForTask: async () => [state.comment],
    countForTask: async () => 1,
    findById: async (id) => (id === "5" ? { ...state.comment } : null),

    create: async ({ body, authorId }) => {
      state.comment = { ...state.comment, body, authorId };
      return "5";
    },

    update: async (_id, body) => {
      if (state.archived) {
        return false;
      }
      state.comment.body = body;
      return true;
    },

    delete: async () => !state.archived,
  };

  const notificationService = {
    create: async (notification) => {
      state.notifications.push(notification);

      if (notificationFailsFor.includes(notification.userId)) {
        throw new Error("Notification creation failed");
      }

      return notification;
    },
  };

  return {
    state,
    service: new CommentService({
      commentRepository,
      projectService,
      notificationService,
    }),
  };
}

const author = { id: "20", role: "MEMBER" };
const owner = { id: "10", role: "MEMBER" };
const admin = { id: "99", role: "ADMIN" };
const other = { id: "30", role: "MEMBER" };

test("comments are listed in the shared collection envelope", async () => {
  const { service } = fixture();
  const response = await service.list("50", author, {});
  assert.equal(response.data.length, 1);
  assert.deepEqual(response.pagination, { page: 1, limit: 20, total: 1 });
});

test("comment body validation trims text and rejects blank or oversized input", () => {
  assert.equal(validateCommentBody("  hello  "), "hello");
  assert.throws(() => validateCommentBody(" "), (error) => error.status === 400);
  assert.throws(
    () => validateCommentBody("x".repeat(5001)),
    (error) => error.status === 400,
  );
});

test("authors can edit their own comments but others cannot", async () => {
  const { service } = fixture();

  assert.equal((await service.update("5", "updated", author)).body, "updated");

  await assert.rejects(
    service.update("5", "not allowed", owner),
    (error) => error.status === 403,
  );

  await assert.rejects(
    service.update("5", "not allowed", admin),
    (error) => error.status === 403,
  );
});

test("authors, project owners, and administrators may delete comments", async () => {
  const { service } = fixture();

  await service.delete("5", author);
  await service.delete("5", owner);
  await service.delete("5", admin);

  await assert.rejects(
    service.delete("5", other),
    (error) => error.status === 403,
  );
});

test("comment access rejects nonmembers and archived projects reject all writes", async () => {
  const { service } = fixture({ archived: true });

  const read = await service.list("50", author, {});
  assert.equal(read.data.length, 1);

  await assert.rejects(
    service.update("5", "edited", author),
    (error) => error.code === "ARCHIVED_PROJECT_READ_ONLY",
  );

  await assert.rejects(
    service.delete("5", owner),
    (error) => error.code === "ARCHIVED_PROJECT_READ_ONLY",
  );

  await assert.rejects(
    fixture().service.list("50", other, {}),
    (error) => error.status === 403,
  );
});

test("adding a comment notifies the task creator and assignee but not the author", async () => {
  const { service, state } = fixture();

  const comment = await service.create("50", "A new comment", author);

  assert.equal(comment.body, "A new comment");
  assert.deepEqual(
    state.notifications.map((notification) => notification.userId),
    ["10", "30"],
  );

  for (const notification of state.notifications) {
    assert.equal(notification.type, "COMMENT_ADDED");
    assert.equal(notification.title, "New comment on your task");
    assert.equal(
      notification.message,
      'A new comment was added to the task "Example task".',
    );
    assert.deepEqual(notification.data, {
      taskId: "50",
      projectId: "1",
      commentId: "5",
      changedBy: "20",
    });
    assert.equal(
      Object.hasOwn(notification.data, "commentBody"),
      false,
    );
  }
});

test("adding a comment does not send duplicate notifications to the same participant", async () => {
  const { service, state } = fixture({
    createdBy: "10",
    assignedTo: "10",
  });

  await service.create("50", "A new comment", author);

  assert.deepEqual(
    state.notifications.map((notification) => notification.userId),
    ["10"],
  );
});

test("the comment author is excluded from comment notifications", async () => {
  const { service, state } = fixture({
    createdBy: "20",
    assignedTo: "30",
  });

  await service.create("50", "A new comment", author);

  assert.deepEqual(
    state.notifications.map((notification) => notification.userId),
    ["30"],
  );
});

test("notification failures do not prevent comment creation or other notifications", async () => {
  const { service, state } = fixture({
    notificationFailsFor: ["10"],
  });

  const comment = await service.create("50", "A new comment", author);

  assert.equal(comment.body, "A new comment");
  assert.deepEqual(
    state.notifications.map((notification) => notification.userId),
    ["10", "30"],
  );
});