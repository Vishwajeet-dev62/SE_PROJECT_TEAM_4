"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  startTaskReminderScheduler,
} = require("../src/services/taskReminderScheduler");

test("runs reminders immediately and logs the number sent", async () => {
  const logs = [];
  let called = false;

  const stop = startTaskReminderScheduler({
    taskReminderService: {
      sendDueReminders: async () => {
        called = true;
        return 2;
      },
    },
    intervalMs: 60000,
    logger: {
      info: (message) => logs.push(message),
      error: () => {},
    },
  });

  await new Promise((resolve) => setImmediate(resolve));
  stop();

  assert.equal(called, true);
  assert.deepEqual(logs, ["Sent 2 task reminder(s)"]);
});

test("logs errors when sending reminders fails", async () => {
  const errors = [];
  const failure = new Error("Database unavailable");

  const stop = startTaskReminderScheduler({
    taskReminderService: {
      sendDueReminders: async () => {
        throw failure;
      },
    },
    intervalMs: 60000,
    logger: {
      info: () => {},
      error: (...args) => errors.push(args),
    },
  });

  await new Promise((resolve) => setImmediate(resolve));
  stop();

  assert.equal(errors.length, 1);
  assert.equal(errors[0][0], "Task reminder scheduler failed:");
  assert.equal(errors[0][1], failure);
});
