const assert = require("node:assert/strict");
const test = require("node:test");
const request = require("supertest");
const { createApp } = require("../src/app");
const { ApiError } = require("../src/errors/apiError");
const { AssignmentRepository } = require("../src/repositories/assignmentRepository");
const { AssignmentService } = require("../src/services/assignmentService");

// Project 10 is owned by user 1. Users 1-4 are members; user 9 is outside.
function setup({ task = {}, project = {}, setAssigneeResult = true, notifyError } = {}) {
  const state = {
    task: { id: "5", projectId: "10", createdBy: "2", assignedTo: "3", title: "Write report", ...task },
  };
  const calls = { set: [], activity: [], notifications: [], logged: [] };
  const projectRecord = { id: "10", ownerId: "1", archived: false, ...project };
  const members = new Set(["1", "2", "3", "4"]);
  const knownUsers = new Set(["1", "2", "3", "4", "9"]);

  const projectService = {
    authorizeTask: async () => {
      if (projectRecord.archived) {
        throw new ApiError(409, "PROJECT_ARCHIVED", "Archived projects are read-only");
      }
      return { task: { id: state.task.id }, project: projectRecord };
    },
  };
  const service = new AssignmentService({
    projectService,
    projectRepository: {
      userExists: async (id) => knownUsers.has(id),
      isMember: async (_projectId, id) => members.has(id),
    },
    taskRepository: { findById: async () => ({ ...state.task }) },
    taskService: { get: async () => ({ ...state.task, permissions: { canEdit: true } }) },
    assignmentRepository: {
      setAssignee: async (args) => {
        calls.set.push(args);
        if (setAssigneeResult) state.task.assignedTo = args.assigneeId;
        return setAssigneeResult;
      },
    },
    notificationService: {
      create: async (input) => {
        if (notifyError) throw notifyError;
        calls.notifications.push(input);
      },
    },
    activityService: { record: async (event) => { calls.activity.push(event); } },
    logger: { error: (message) => calls.logged.push(message) },
  });

  const requireAuth = (req, _res, next) => {
    const header = req.get("x-test-user");
    if (!header) return next(new ApiError(401, "UNAUTHENTICATED", "Authentication is required"));
    const [id, role] = header.split(":");
    req.user = { id, role };
    return next();
  };
  return { app: createApp({ assignmentService: service, requireAuth }), calls, state };
}

const as = (id, role = "MEMBER") => ({ "x-test-user": `${id}:${role}` });
const patch = (app, body, user = as("2")) =>
  request(app).patch("/api/v1/tasks/5/assignment").set(user).send(body);

test("the creator can assign a project member, which is recorded and notified", async () => {
  const { app, calls } = setup();
  const response = await patch(app, { assigned_to: 4 });

  assert.equal(response.status, 200);
  assert.equal(response.body.data.assignedTo, "4");
  assert.deepEqual(calls.set, [{ taskId: "5", assigneeId: "4", expectedAssigneeId: "3" }]);
  assert.equal(calls.activity[0].eventType, "TASK_ASSIGNED");
  assert.deepEqual(calls.activity[0].details, { taskId: "5", from: "3", to: "4" });

  const assigned = calls.notifications.find((n) => n.type === "TASK_ASSIGNED");
  assert.equal(assigned.userId, "4");
  assert.match(assigned.message, /Write report/);
  assert.deepEqual(assigned.data, { taskId: "5", projectId: "10", changedBy: "2" });
});

test("reassigning also tells the previous assignee, but never the person acting", async () => {
  const { app, calls } = setup();
  await patch(app, { assigned_to: 4 });
  assert.deepEqual(
    calls.notifications.map((n) => [n.type, n.userId]).sort(),
    [["TASK_ASSIGNED", "4"], ["TASK_UNASSIGNED", "3"]],
  );

  const own = setup({ task: { assignedTo: null } });
  await patch(own.app, { assigned_to: 2 }, as("2"));
  assert.equal(own.calls.notifications.length, 0);
  assert.equal(own.calls.activity[0].eventType, "TASK_ASSIGNED");
});

test("assigned_to null removes the assignee and tells the previous one", async () => {
  const { app, calls } = setup();
  const response = await patch(app, { assigned_to: null });
  assert.equal(response.status, 200);
  assert.equal(calls.set[0].assigneeId, null);
  assert.equal(calls.activity[0].eventType, "TASK_UNASSIGNED");
  assert.deepEqual(calls.notifications.map((n) => [n.type, n.userId]), [["TASK_UNASSIGNED", "3"]]);
});

test("assigning the current assignee changes and notifies nothing", async () => {
  const { app, calls } = setup();
  const response = await patch(app, { assigned_to: 3 });
  assert.equal(response.status, 200);
  assert.equal(calls.set.length, 0);
  assert.equal(calls.activity.length, 0);
  assert.equal(calls.notifications.length, 0);
});

test("only the creator, assignee, project owner or an administrator may assign", async () => {
  for (const [user, expected] of [
    [as("2"), 200],
    [as("3"), 200],
    [as("1"), 200],
    [as("4", "ADMIN"), 200],
    [as("4"), 403],
  ]) {
    const { app, calls } = setup();
    const response = await patch(app, { assigned_to: 1 }, user);
    assert.equal(response.status, expected, JSON.stringify(user));
    if (expected === 403) {
      assert.equal(response.body.error.code, "FORBIDDEN");
      assert.equal(calls.set.length, 0);
    }
  }
  const { app } = setup();
  const anonymous = await request(app).patch("/api/v1/tasks/5/assignment").send({ assigned_to: 1 });
  assert.equal(anonymous.status, 401);
});

test("the assignee must exist and belong to the project", async () => {
  const { app, calls } = setup();
  const missing = await patch(app, { assigned_to: 77 });
  assert.equal(missing.status, 404);
  assert.equal(missing.body.error.code, "USER_NOT_FOUND");

  const outsider = await patch(app, { assigned_to: 9 });
  assert.equal(outsider.status, 400);
  assert.equal(outsider.body.error.code, "ASSIGNEE_NOT_PROJECT_MEMBER");
  assert.equal(calls.set.length, 0);
});

test("the project owner counts as a valid assignee", async () => {
  const { app } = setup({ task: { assignedTo: null } });
  const response = await patch(app, { assigned_to: 1 });
  assert.equal(response.status, 200);
});

test("bodies are validated", async () => {
  const { app } = setup();
  for (const body of [{}, { assigned_to: "abc" }, { assigned_to: 0 }, { assigned_to: 4, status: "DONE" }, []]) {
    const response = await patch(app, body);
    assert.equal(response.status, 400, JSON.stringify(body));
  }
});

test("archived projects reject assignment and lost races return 409", async () => {
  const archived = setup({ project: { archived: true } });
  const blocked = await patch(archived.app, { assigned_to: 4 });
  assert.equal(blocked.status, 409);
  assert.equal(archived.calls.set.length, 0);

  const raced = setup({ setAssigneeResult: false });
  const response = await patch(raced.app, { assigned_to: 4 });
  assert.equal(response.status, 409);
  assert.equal(response.body.error.code, "TASK_CHANGED");
  assert.equal(raced.calls.notifications.length, 0);
});

test("notification or activity failures do not fail a successful assignment", async () => {
  const { app, calls } = setup({ notifyError: new Error("db down: secret detail") });
  const response = await patch(app, { assigned_to: 4 });
  assert.equal(response.status, 200);
  assert.deepEqual(calls.logged, [
    "Failed to create assignment notification",
    "Failed to create assignment notification",
  ]);
});

test("repository update is parameterized and guards deleted, archived and changed tasks", async () => {
  const seen = [];
  const pool = {
    execute: async (sql, params) => {
      seen.push([sql.replace(/\s+/g, " ").trim(), params]);
      return [{ affectedRows: 1 }];
    },
  };
  const repository = new AssignmentRepository(pool);
  assert.equal(await repository.setAssignee({ taskId: "5", assigneeId: null, expectedAssigneeId: "3" }), true);
  const [sql, params] = seen[0];
  assert.match(sql, /t\.deleted_at IS NULL/);
  assert.match(sql, /p\.is_archived = 0/);
  assert.match(sql, /t\.assigned_to <=> \?/);
  assert.deepEqual(params, [null, "5", "3"]);

  const none = new AssignmentRepository({ execute: async () => [{ affectedRows: 0 }] });
  assert.equal(await none.setAssignee({ taskId: "5", assigneeId: "4", expectedAssigneeId: null }), false);
});
