
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  NotificationRepository,
} = require("../src/repositories/notificationRepository");

test("creates a notification using parameterized SQL", async () => {
  const calls = [];

  const pool = {
    execute: async (sql, values) => {
      calls.push({ sql, values });

      if (sql.includes("INSERT INTO notifications")) {
        return [{ insertId: 51 }];
      }

      if (sql.includes("WHERE user_id = ? AND id = ?")) {
        return [[{
          id: 51,
          user_id: 7,
          type: "TASK_ASSIGNED",
          title: "New task",
          message: "A task was assigned",
          data: { taskId: "42" },
        }]];
      }

      throw new Error("Unexpected SQL query");
    },
  };

  const repository = new NotificationRepository(pool);

  const result = await repository.create({
    userId: "7",
    type: "TASK_ASSIGNED",
    title: "New task",
    message: "A task was assigned",
    data: { taskId: "42" },
  });

  assert.equal(calls.length, 2);

  assert.match(calls[0].sql, /INSERT INTO notifications/);
  assert.match(calls[0].sql, /VALUES \(\?, \?, \?, \?, \?\)/);

  assert.deepEqual(calls[0].values, [
    "7",
    "TASK_ASSIGNED",
    "New task",
    "A task was assigned",
    JSON.stringify({ taskId: "42" }),
  ]);

  assert.equal(result.id, 51);
  assert.equal(result.type, "TASK_ASSIGNED");
});

test("stores null when notification data is not supplied", async () => {
  let insertValues;

  const pool = {
    execute: async (sql, values) => {
      if (sql.includes("INSERT INTO notifications")) {
        insertValues = values;
        return [{ insertId: 52 }];
      }

      return [[{ id: 52, user_id: 7 }]];
    },
  };

  const repository = new NotificationRepository(pool);

  await repository.create({
    userId: "7",
    type: "TASK_REMINDER",
    title: "Reminder",
    message: "Task is due",
  });

  assert.equal(insertValues[4], null);
});

test("lists notifications with user filtering and pagination", async () => {
  const calls = [];

  const pool = {
    execute: async (sql, values) => {
      calls.push({ sql, values });

      if (sql.includes("COUNT(*)")) {
        return [[{ total: 25 }]];
      }

      return [[
        {
          id: 21,
          user_id: 7,
          type: "TASK_ASSIGNED",
          title: "New task",
          message: "A task was assigned",
          is_read: 0,
        },
      ]];
    },
  };

  const repository = new NotificationRepository(pool);

  const result = await repository.findByUser("7", {
    page: 2,
    limit: 10,
  });

  assert.equal(calls.length, 2);

  assert.match(calls[0].sql, /WHERE user_id = \?/);
  assert.match(calls[0].sql, /ORDER BY created_at DESC, id DESC/);
  assert.match(calls[0].sql, /LIMIT \? OFFSET \?/);
  assert.deepEqual(calls[0].values, ["7", 10, 10]);

  assert.match(calls[1].sql, /COUNT\(\*\)/);
  assert.deepEqual(calls[1].values, ["7"]);

  assert.equal(result.rows.length, 1);
  assert.equal(result.total, 25);
});

test("marks only the specified user's notification as read", async () => {
  const calls = [];

  const pool = {
    execute: async (sql, values) => {
      calls.push({ sql, values });

      if (sql.includes("UPDATE notifications")) {
        return [{ affectedRows: 1 }];
      }

      return [[{
        id: 21,
        user_id: 7,
        is_read: 1,
        read_at: new Date(),
      }]];
    },
  };

  const repository = new NotificationRepository(pool);

  const result = await repository.markAsRead("7", "21");

  assert.match(calls[0].sql, /WHERE user_id = \? AND id = \?/);
  assert.deepEqual(calls[0].values, ["7", "21"]);

  assert.equal(result.id, 21);
  assert.equal(result.is_read, 1);
});

test("does not modify another user's notification", async () => {
  const pool = {
    execute: async (sql) => {
      if (sql.includes("UPDATE notifications")) {
        return [{ affectedRows: 0 }];
      }

      return [[]];
    },
  };

  const repository = new NotificationRepository(pool);

  const result = await repository.markAsRead("7", "99");

  assert.equal(result, null);
});

test("marks all unread notifications as read for one user", async () => {
  let captured;

  const pool = {
    execute: async (sql, values) => {
      captured = { sql, values };
      return [{ affectedRows: 3 }];
    },
  };

  const repository = new NotificationRepository(pool);

  const result = await repository.markAllAsRead("7");

  assert.match(captured.sql, /is_read = 1/);
  assert.match(captured.sql, /WHERE user_id = \? AND is_read = 0/);
  assert.deepEqual(captured.values, ["7"]);
  assert.equal(result, 3);
});

test("counts unread notifications for one user", async () => {
  let captured;

  const pool = {
    execute: async (sql, values) => {
      captured = { sql, values };
      return [[{ total: 4 }]];
    },
  };

  const repository = new NotificationRepository(pool);

  const result = await repository.countUnread("7");

  assert.match(captured.sql, /COUNT\(\*\)/);
  assert.match(captured.sql, /user_id = \? AND is_read = 0/);
  assert.deepEqual(captured.values, ["7"]);
  assert.equal(result, 4);
});
