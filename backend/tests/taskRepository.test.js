
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { TaskRepository } = require("../src/repositories/taskRepository");

function createPoolMock({ rows = [], result = {} } = {}) {
  const calls = [];

  return {
    calls,
    async execute(sql, params = []) {
      calls.push({ sql, params });

      if (sql.includes("COUNT(*)")) {
        return [[{ total: "2" }]];
      }

      if (sql.trimStart().startsWith("SELECT")) {
        return [rows];
      }

      return [{
        affectedRows: result.affectedRows ?? 1,
        insertId: result.insertId ?? 42,
      }];
    },
  };
}

const sampleTask = {
  id: 42,
  project_id: 7,
  created_by: 10,
  assigned_to: 20,
  category_id: null,
  title: "Prepare report",
  description: "Quarterly report",
  status: "TODO",
  priority: "HIGH",
  due_date: null,
  deleted_at: null,
  created_at: new Date("2026-10-26T10:00:00.000Z"),
  updated_at: new Date("2026-10-26T10:00:00.000Z"),
};

test("create uses parameterized SQL and derives task fields from arguments", async () => {
  const pool = createPoolMock({ result: { insertId: 42 } });
  const repository = new TaskRepository(pool);

  const id = await repository.create({
    projectId: "7",
    createdBy: "10",
    title: "Prepare report",
  });

  assert.equal(id, "42");
  assert.match(pool.calls[0].sql, /INSERT INTO tasks/);
  assert.match(
    pool.calls[0].sql,
    /WHERE p\.id = \? AND p\.is_archived = 0/,
  );
  assert.deepEqual(pool.calls[0].params, [
    "10", null, null, "Prepare report", null, "TODO", "MEDIUM", null, "7",
  ]);
});

test("create returns null when the project is archived or unavailable", async () => {
  const pool = createPoolMock({ result: { affectedRows: 0 } });
  const repository = new TaskRepository(pool);

  const id = await repository.create({
    projectId: "7",
    createdBy: "10",
    title: "Prepare report",
  });

  assert.equal(id, null);
});

test("findById excludes deleted tasks by default", async () => {
  const pool = createPoolMock({ rows: [sampleTask] });
  const repository = new TaskRepository(pool);

  const task = await repository.findById("42");

  assert.equal(task.id, "42");
  assert.equal(task.projectId, "7");
  assert.match(pool.calls[0].sql, /t\.deleted_at IS NULL/);
  assert.deepEqual(pool.calls[0].params, ["42"]);
});

test("listForProject scopes results and parameterizes filters", async () => {
  const pool = createPoolMock({ rows: [sampleTask] });
  const repository = new TaskRepository(pool);

  await repository.listForProject("7", {
    limit: 20,
    offset: 0,
    status: "TODO",
    priority: "HIGH",
    assignedTo: "20",
    search: "report",
    dueBefore: "2026-12-01",
  });

  const call = pool.calls[0];

  assert.match(call.sql, /t\.project_id = \?/);
  assert.match(call.sql, /t\.deleted_at IS NULL/);
  assert.match(call.sql, /t\.status = \?/);
  assert.match(call.sql, /t\.priority = \?/);
  assert.match(call.sql, /t\.assigned_to = \?/);
  assert.match(call.sql, /t\.title LIKE \?/);
  assert.match(
    call.sql,
    /t\.due_date IS NOT NULL AND t\.due_date <= \?/,
  );
  assert.deepEqual(call.params, [
    "7", "TODO", "HIGH", "20", "%report%", "2026-12-01", 20, 0,
  ]);
});

test("listForProject escapes SQL LIKE wildcard characters", async () => {
  const pool = createPoolMock();
  const repository = new TaskRepository(pool);

  await repository.listForProject("7", {
    limit: 20,
    offset: 0,
    search: "100%_done",
  });

  assert.equal(pool.calls[0].params[1], "%100\\%\\_done%");
});

test("countForProject returns the filtered task count", async () => {
  const pool = createPoolMock();
  const repository = new TaskRepository(pool);

  const total = await repository.countForProject("7", {
    status: "DONE",
  });

  assert.equal(total, 2);
  assert.match(pool.calls[0].sql, /t\.project_id = \?/);
  assert.match(pool.calls[0].sql, /t\.deleted_at IS NULL/);
  assert.deepEqual(pool.calls[0].params, ["7", "DONE"]);
});

test("update only updates supported supplied fields", async () => {
  const pool = createPoolMock();
  const repository = new TaskRepository(pool);

  const updated = await repository.update(
    "42",
    {
      title: "Updated report",
      status: "IN_PROGRESS",
    },
    "20",
  );

  assert.equal(updated, true);
  assert.match(pool.calls[0].sql, /INNER JOIN projects p/);
  assert.match(pool.calls[0].sql, /t\.deleted_at IS NULL/);
  assert.match(pool.calls[0].sql, /p\.is_archived = 0/);
  assert.match(
    pool.calls[0].sql,
    /t\.created_by = \? OR t\.assigned_to = \?/,
  );
  assert.deepEqual(pool.calls[0].params, [
    "Updated report", "IN_PROGRESS", "42", "20", "20",
  ]);
});

test("update refuses an empty changes object", async () => {
  const pool = createPoolMock();
  const repository = new TaskRepository(pool);

  assert.equal(await repository.update("42", {}), false);
  assert.equal(pool.calls.length, 0);
});

test("softDelete only deletes active tasks in writable projects", async () => {
  const pool = createPoolMock();
  const repository = new TaskRepository(pool);

  assert.equal(await repository.softDelete("42"), true);
  assert.match(pool.calls[0].sql, /t\.deleted_at IS NULL/);
  assert.match(pool.calls[0].sql, /p\.is_archived = 0/);
  assert.deepEqual(pool.calls[0].params, ["42"]);
});

test("trash listing is scoped to a project and the 30-day window", async () => {
  const pool = createPoolMock({ rows: [sampleTask] });
  const repository = new TaskRepository(pool);

  await repository.listTrashForProject("7", { limit: 20, offset: 0 });

  assert.match(pool.calls[0].sql, /t\.project_id = \?/);
  assert.match(pool.calls[0].sql, /t\.deleted_at IS NOT NULL/);
  assert.match(pool.calls[0].sql, /INTERVAL 30 DAY/);
  assert.deepEqual(pool.calls[0].params, ["7", 20, 0]);
});

test("restore requires an unexpired deleted task and a writable project", async () => {
  const pool = createPoolMock();
  const repository = new TaskRepository(pool);

  assert.equal(await repository.restore("42"), true);
  assert.match(pool.calls[0].sql, /t\.deleted_at IS NOT NULL/);
  assert.match(pool.calls[0].sql, /INTERVAL 30 DAY/);
  assert.match(pool.calls[0].sql, /p\.is_archived = 0/);
  assert.deepEqual(pool.calls[0].params, ["42"]);
});

test("trash count uses the same project and retention constraints", async () => {
  const pool = createPoolMock();
  const repository = new TaskRepository(pool);

  assert.equal(await repository.countTrashForProject("7"), 2);
  assert.match(pool.calls[0].sql, /project_id = \?/);
  assert.match(pool.calls[0].sql, /deleted_at IS NOT NULL/);
  assert.match(pool.calls[0].sql, /INTERVAL 30 DAY/);
  assert.deepEqual(pool.calls[0].params, ["7"]);
});
