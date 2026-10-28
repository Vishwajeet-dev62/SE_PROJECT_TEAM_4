"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { CommentRepository } = require("../src/repositories/commentRepository");
const { ProjectRepository } = require("../src/repositories/projectRepository");

test("project repository parameterizes user and project identifiers", async () => {
  const calls = [];
  const repository = new ProjectRepository({
    execute: async (sql, values) => {
      calls.push({ sql, values });
      return [[{ total: 0 }]];
    },
  });

  await repository.listVisible(
    { id: "1 OR 1=1", role: "MEMBER" },
    { limit: 20, offset: 0 },
  );

  await repository.countVisible({ id: "1 OR 1=1", role: "MEMBER" });

  assert.equal(calls.length, 2);
  assert.equal(calls[0].sql.includes("1 OR 1=1"), false);
  assert.deepEqual(calls[0].values, ["1 OR 1=1", "1 OR 1=1", 20, 0]);
  assert.equal(calls[1].sql.includes("1 OR 1=1"), false);
});

test("project membership insert and delete reject writes after archive", async () => {
  const calls = [];
  const repository = new ProjectRepository({
    execute: async (sql, values) => {
      calls.push({ sql, values });
      return [{ affectedRows: 1 }];
    },
  });

  await repository.addMember("1", "2");
  await repository.removeMember("1", "2");

  assert.ok(
    calls.every(({ sql }) => sql.includes("p.is_archived = 0")),
  );
});

test("dashboard query excludes soft-deleted tasks and counts overdue unfinished work", async () => {
  let query;

  const repository = new ProjectRepository({
    execute: async (sql, values) => {
      query = { sql, values };
      return [[{
        todo: 1,
        in_progress: 1,
        done: 2,
        total: 4,
        unknown_status: 0,
        overdue: 1,
      }]];
    },
  });

  assert.deepEqual(await repository.getDashboardCounts("7"), {
    TODO: 1,
    IN_PROGRESS: 1,
    DONE: 2,
    total: 4,
    unknownStatus: 0,
    overdue: 1,
  });

  assert.match(query.sql, /deleted_at IS NULL/);
  assert.match(query.sql, /due_date < UTC_DATE\(\)/);
  assert.match(query.sql, /status <> 'DONE'/);
  assert.deepEqual(query.values, ["7"]);
});

test("board task reads are paginated and exclude soft-deleted tasks", async () => {
  let captured;

  const repository = new ProjectRepository({
    execute: async (sql, values) => {
      captured = { sql, values };
      return [[{ id: "1", project_id: "7" }]];
    },
  });

  await repository.listActiveTasks("7", { limit: 20, offset: 40 });

  assert.match(captured.sql, /deleted_at IS NULL/);
  assert.match(captured.sql, /LIMIT \? OFFSET \?/);
  assert.deepEqual(captured.values, ["7", 20, 40]);
});

test("comment mutations include project archive and active-task predicates", async () => {
  const calls = [];
  const repository = new CommentRepository({
    execute: async (sql, values) => {
      calls.push({ sql, values });
      return [{ affectedRows: 1, insertId: 9 }];
    },
  });

  await repository.create({ taskId: "4", authorId: "2", body: "hello" });
  await repository.update("9", "edited");
  await repository.delete("9");

  assert.ok(
    calls.every(({ sql }) => sql.includes("p.is_archived = 0")),
  );
  assert.ok(
    calls.every(({ sql }) => sql.includes("t.deleted_at IS NULL")),
  );
  assert.deepEqual(calls[0].values, ["2", "hello", "4"]);
});
