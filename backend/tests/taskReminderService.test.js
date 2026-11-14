"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  TaskReminderService,
} = require("../src/services/taskReminderService");

test("delegates sending due reminders to the repository", async () => {
  let called = false;

  const taskReminderRepository = {
    sendDueReminders: async () => {
      called = true;
      return 3;
    },
  };

  const service = new TaskReminderService({ taskReminderRepository });
  const sentCount = await service.sendDueReminders();

  assert.equal(called, true);
  assert.equal(sentCount, 3);
});
