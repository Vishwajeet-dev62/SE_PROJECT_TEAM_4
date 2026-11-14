
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  TaskReminderRepository,
} = require("../src/repositories/taskReminderRepository");

test("finds eligible tasks using UTC and excludes completed, deleted and archived tasks", async () => {
  let query;

  const pool = {
    execute: async (sql) => {
      query = sql;
      return [[{ task_id: 12, recipient_id: 7 }]];
    },
  };

  const repository = new TaskReminderRepository(pool);
  const tasks = await repository.findDueTasks();

  assert.equal(tasks.length, 1);
  assert.match(query, /UTC_TIMESTAMP/);
  assert.match(query, /COALESCE\(t\.assigned_to, t\.created_by\)/);
  assert.match(query, /t\.status <> 'DONE'/);
  assert.match(query, /t\.deleted_at IS NULL/);
  assert.match(query, /p\.is_archived = 0/);
});

test("creates a reminder and notification in one transaction", async () => {
  const calls = [];

  const connection = {
    beginTransaction: async () => calls.push("begin"),
    execute: async (sql, values) => {
      calls.push({ sql, values });

      if (sql.includes("INSERT INTO task_reminders")) {
        return [{ affectedRows: 1 }];
      }

      if (sql.includes("INSERT INTO notifications")) {
        return [{ affectedRows: 1 }];
      }

      throw new Error("Unexpected SQL query");
    },
    commit: async () => calls.push("commit"),
    rollback: async () => calls.push("rollback"),
    release: () => calls.push("release"),
  };

  const repository = new TaskReminderRepository({
    getConnection: async () => connection,
  });

  const sent = await repository.createReminder({
    task_id: 12,
    project_id: 4,
    recipient_id: 7,
    title: "Finish report",
    due_date: "2026-11-15 10:00:00",
  });

  assert.equal(sent, true);
  assert.equal(calls[0], "begin");
  assert.match(calls[1].sql, /INSERT INTO task_reminders/);
  assert.match(calls[2].sql, /INSERT INTO notifications/);
  assert.equal(calls[2].values[1], "TASK_REMINDER");
  assert.equal(calls[3], "commit");
  assert.equal(calls[4], "release");
});

test("does not create a notification when the reminder already exists", async () => {
  const calls = [];

  const connection = {
    beginTransaction: async () => calls.push("begin"),
    execute: async (sql) => {
      calls.push(sql);

      if (sql.includes("INSERT INTO task_reminders")) {
        const error = new Error("Duplicate reminder");
        error.code = "ER_DUP_ENTRY";
        throw error;
      }

      throw new Error("Unexpected SQL query");
    },
    commit: async () => calls.push("commit"),
    rollback: async () => calls.push("rollback"),
    release: () => calls.push("release"),
  };

  const repository = new TaskReminderRepository({
    getConnection: async () => connection,
  });

  const sent = await repository.createReminder({
    task_id: 12,
    recipient_id: 7,
    due_date: "2026-11-15 10:00:00",
  });

  assert.equal(sent, false);
  assert.equal(
    calls.some(
      (call) =>
        typeof call === "string" &&
        call.includes("INSERT INTO notifications"),
    ),
    false,
  );
  assert.ok(calls.includes("commit"));
  assert.ok(calls.includes("release"));
  assert.ok(!calls.includes("rollback"));
});

test("rolls back when reminder insertion fails with a non-duplicate error", async () => {
  const calls = [];

  const connection = {
    beginTransaction: async () => calls.push("begin"),
    execute: async (sql) => {
      calls.push(sql);
      throw new Error("Database insert failed");
    },
    commit: async () => calls.push("commit"),
    rollback: async () => calls.push("rollback"),
    release: () => calls.push("release"),
  };

  const repository = new TaskReminderRepository({
    getConnection: async () => connection,
  });

  await assert.rejects(
    repository.createReminder({
      task_id: 12,
      recipient_id: 7,
      due_date: "2026-11-15 10:00:00",
    }),
    /Database insert failed/,
  );

  assert.ok(calls.includes("rollback"));
  assert.ok(calls.includes("release"));
  assert.ok(!calls.includes("commit"));
});

test("rolls back when notification creation fails", async () => {
  const calls = [];

  const connection = {
    beginTransaction: async () => calls.push("begin"),
    execute: async (sql) => {
      calls.push(sql);

      if (sql.includes("INSERT INTO task_reminders")) {
        return [{ affectedRows: 1 }];
      }

      throw new Error("Notification insert failed");
    },
    commit: async () => calls.push("commit"),
    rollback: async () => calls.push("rollback"),
    release: () => calls.push("release"),
  };

  const repository = new TaskReminderRepository({
    getConnection: async () => connection,
  });

  await assert.rejects(
    repository.createReminder({
      task_id: 12,
      recipient_id: 7,
      due_date: "2026-11-15 10:00:00",
    }),
    /Notification insert failed/,
  );

  assert.ok(calls.includes("rollback"));
  assert.ok(calls.includes("release"));
  assert.ok(!calls.includes("commit"));
});
