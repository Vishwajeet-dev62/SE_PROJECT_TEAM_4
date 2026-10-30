
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  NotificationService,
} = require("../src/services/notificationService");

const user = { id: "7", role: "MEMBER" };

function createService(overrides = {}) {
  const calls = [];

  const notificationRepository = {
    create: async (input) => {
      calls.push(["create", input]);
      return { id: "21", ...input };
    },

    findByUser: async (userId, pagination) => {
      calls.push(["findByUser", userId, pagination]);

      return {
        rows: [{ id: "21", user_id: userId, type: "TASK_ASSIGNED" }],
        total: 1,
      };
    },

    markAsRead: async (userId, notificationId) => {
      calls.push(["markAsRead", userId, notificationId]);

      return {
        id: notificationId,
        user_id: userId,
        is_read: 1,
      };
    },

    markAllAsRead: async (userId) => {
      calls.push(["markAllAsRead", userId]);
      return 3;
    },

    countUnread: async (userId) => {
      calls.push(["countUnread", userId]);
      return 4;
    },

    ...overrides,
  };

  return {
    service: new NotificationService({ notificationRepository }),
    calls,
  };
}

test("creates a valid notification", async () => {
  const { service, calls } = createService();

  const result = await service.create({
    userId: "7",
    type: "TASK_ASSIGNED",
    title: "New task",
    message: "A task has been assigned to you",
    data: { taskId: "42" },
  });

  assert.equal(result.id, "21");
  assert.equal(result.type, "TASK_ASSIGNED");
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], "create");
  assert.deepEqual(calls[0][1].data, { taskId: "42" });
});

test("rejects invalid notification input", async () => {
  const { service, calls } = createService();

  await assert.rejects(
    service.create({
      userId: "7",
      type: "invalid type",
      title: "New task",
      message: "Task assigned",
    }),
    { status: 400, code: "VALIDATION_ERROR" },
  );

  assert.equal(calls.length, 0);
});

test("rejects a title longer than 150 characters", async () => {
  const { service } = createService();

  await assert.rejects(
    service.create({
      userId: "7",
      type: "TASK_ASSIGNED",
      title: "A".repeat(151),
      message: "Task assigned",
    }),
    { status: 400, code: "VALIDATION_ERROR" },
  );
});

test("rejects non-object notification data", async () => {
  const { service } = createService();

  await assert.rejects(
    service.create({
      userId: "7",
      type: "TASK_ASSIGNED",
      title: "New task",
      message: "Task assigned",
      data: ["invalid"],
    }),
    { status: 400, code: "VALIDATION_ERROR" },
  );
});

test("lists notifications for the authenticated user", async () => {
  const { service, calls } = createService();

  const result = await service.list(user, {
    page: "1",
    limit: "20",
  });

  assert.equal(result.data.length, 1);
  assert.equal(result.pagination.page, 1);
  assert.equal(result.pagination.limit, 20);
  assert.equal(result.pagination.total, 1);

  assert.equal(calls[0][0], "findByUser");
  assert.equal(calls[0][1], "7");
});

test("rejects invalid pagination parameters", async () => {
  const { service, calls } = createService();

  await assert.rejects(
    service.list(user, { page: "0" }),
    { status: 400, code: "VALIDATION_ERROR" },
  );

  assert.equal(calls.length, 0);
});

test("marks a notification as read", async () => {
  const { service, calls } = createService();

  const result = await service.markAsRead("21", user);

  assert.equal(result.id, "21");
  assert.equal(result.is_read, 1);
  assert.deepEqual(calls[0], ["markAsRead", "7", "21"]);
});

test("rejects an invalid notification ID", async () => {
  const { service, calls } = createService();

  await assert.rejects(
    service.markAsRead("invalid", user),
    { status: 400, code: "VALIDATION_ERROR" },
  );

  assert.equal(calls.length, 0);
});

test("returns not found when notification does not belong to the user", async () => {
  const { service } = createService({
    markAsRead: async () => null,
  });

  await assert.rejects(
    service.markAsRead("99", user),
    { status: 404, code: "NOTIFICATION_NOT_FOUND" },
  );
});

test("marks all notifications as read", async () => {
  const { service, calls } = createService();

  const result = await service.markAllAsRead(user);

  assert.deepEqual(result, { updatedCount: 3 });
  assert.deepEqual(calls[0], ["markAllAsRead", "7"]);
});

test("returns the unread notification count", async () => {
  const { service, calls } = createService();

  const result = await service.countUnread(user);

  assert.deepEqual(result, { count: 4 });
  assert.deepEqual(calls[0], ["countUnread", "7"]);
});
