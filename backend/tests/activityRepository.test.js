
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  ActivityRepository,
} = require("../src/repositories/activityRepository");

test("creates an activity record using parameterized SQL", async () => {
  let captured;

  const repository = new ActivityRepository({
    execute: async (sql, values) => {
      captured = { sql, values };
      return [{ insertId: 51 }];
    },
  });

  const id = await repository.create({
    projectId: "7",
    userId: "10",
    eventType: "TASK_CREATED",
    details: {
      taskId: "42",
      title: "Prepare report",
    },
  });

  assert.equal(id, "51");
  assert.match(captured.sql, /INSERT INTO audit_logs/);
  assert.match(captured.sql, /user_id, project_id, event_type, details/);
  assert.doesNotMatch(captured.sql, /TASK_CREATED/);

  assert.deepEqual(captured.values, [
    "10",
    "7",
    "TASK_CREATED",
    JSON.stringify({
      taskId: "42",
      title: "Prepare report",
    }),
  ]);
});

test("lists project activity and maps database fields correctly", async () => {
  let captured;

  const repository = new ActivityRepository({
    execute: async (sql, values) => {
      captured = { sql, values };

      return [[
        {
          id: 51,
          project_id: 7,
          user_id: 10,
          actor_name: "Test User",
          event_type: "TASK_CREATED",
          details: JSON.stringify({
            taskId: "42",
            title: "Prepare report",
          }),
          created_at: new Date("2026-10-29T10:00:00.000Z"),
        },
        {
          id: 52,
          project_id: 7,
          user_id: null,
          actor_name: null,
          event_type: "TASK_DELETED",
          details: { taskId: "43" },
          created_at: new Date("2026-10-29T10:01:00.000Z"),
        },
      ]];
    },
  });

  const result = await repository.listForProject("7", {
    limit: 20,
    offset: 0,
  });

  assert.match(captured.sql, /WHERE al\.project_id = \?/);
  assert.match(captured.sql, /ORDER BY al\.created_at DESC, al\.id DESC/);
  assert.match(captured.sql, /LIMIT \? OFFSET \?/);
  assert.deepEqual(captured.values, ["7", 20, 0]);

  assert.equal(result.length, 2);

  assert.deepEqual(result[0], {
    id: "51",
    projectId: "7",
    userId: "10",
    actorName: "Test User",
    eventType: "TASK_CREATED",
    details: {
      taskId: "42",
      title: "Prepare report",
    },
    createdAt: new Date("2026-10-29T10:00:00.000Z"),
  });

  assert.deepEqual(result[1], {
    id: "52",
    projectId: "7",
    userId: null,
    actorName: "Former user",
    eventType: "TASK_DELETED",
    details: { taskId: "43" },
    createdAt: new Date("2026-10-29T10:01:00.000Z"),
  });
});

test("counts activity records for a project", async () => {
  let captured;

  const repository = new ActivityRepository({
    execute: async (sql, values) => {
      captured = { sql, values };
      return [[{ total: 3 }]];
    },
  });

  const total = await repository.countForProject("7");

  assert.equal(total, 3);
  assert.match(captured.sql, /SELECT COUNT\(\*\) AS total/);
  assert.match(captured.sql, /WHERE project_id = \?/);
  assert.deepEqual(captured.values, ["7"]);
});

test("handles malformed activity details safely", async () => {
  const repository = new ActivityRepository({
    execute: async () => [[
      {
        id: 60,
        project_id: 7,
        user_id: 10,
        actor_name: "Test User",
        event_type: "TASK_UPDATED",
        details: "{invalid json",
        created_at: new Date("2026-10-29T10:00:00.000Z"),
      },
      {
        id: 61,
        project_id: 7,
        user_id: 10,
        actor_name: "Test User",
        event_type: "TASK_UPDATED",
        details: ["unexpected", "array"],
        created_at: new Date("2026-10-29T10:01:00.000Z"),
      },
    ]],
  });

  const result = await repository.listForProject("7", {
    limit: 20,
    offset: 0,
  });

  assert.deepEqual(result[0].details, {});
  assert.deepEqual(result[1].details, {});
});
