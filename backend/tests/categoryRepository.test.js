
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  CategoryRepository,
} = require("../src/repositories/categoryRepository");

const sampleCategory = {
  id: 12,
  project_id: 7,
  name: "Development",
  created_at: new Date("2026-11-07T10:00:00.000Z"),
  updated_at: new Date("2026-11-07T10:00:00.000Z"),
};

function createPoolMock({ rows = [], result = {} } = {}) {
  const calls = [];

  return {
    calls,

    async execute(sql, params = []) {
      calls.push({ sql, params });

      if (sql.trimStart().startsWith("SELECT")) {
        return [rows];
      }

      return [{
        affectedRows: result.affectedRows ?? 1,
        insertId: result.insertId ?? 12,
      }];
    },
  };
}

function createDeletePoolMock({
  categoryRows = [{ id: 12 }],
  deleteAffectedRows = 1,
  shouldThrow = false,
} = {}) {
  const calls = [];
  const transaction = [];

  const connection = {
    async beginTransaction() {
      transaction.push("begin");
    },

    async execute(sql, params = []) {
      calls.push({ sql, params });

      if (shouldThrow && sql.includes("UPDATE tasks")) {
        throw new Error("Database failure");
      }

      if (sql.includes("SELECT c.id")) {
        return [categoryRows];
      }

      if (sql.includes("DELETE FROM categories")) {
        return [{ affectedRows: deleteAffectedRows }];
      }

      return [{ affectedRows: 1 }];
    },

    async commit() {
      transaction.push("commit");
    },

    async rollback() {
      transaction.push("rollback");
    },

    release() {
      transaction.push("release");
    },
  };

  const pool = {
    calls,
    transaction,

    async getConnection() {
      return connection;
    },
  };

  return pool;
}

test("listForProject returns categories scoped to a project", async () => {
  const pool = createPoolMock({ rows: [sampleCategory] });
  const repository = new CategoryRepository(pool);

  const categories = await repository.listForProject("7");

  assert.equal(categories.length, 1);
  assert.equal(categories[0].id, "12");
  assert.equal(categories[0].projectId, "7");
  assert.equal(categories[0].name, "Development");

  assert.match(pool.calls[0].sql, /FROM categories/);
  assert.match(pool.calls[0].sql, /WHERE project_id = \?/);
  assert.match(pool.calls[0].sql, /ORDER BY name ASC/);
  assert.deepEqual(pool.calls[0].params, ["7"]);
});

test("findById returns a category belonging to the specified project", async () => {
  const pool = createPoolMock({ rows: [sampleCategory] });
  const repository = new CategoryRepository(pool);

  const category = await repository.findById("7", "12");

  assert.equal(category.id, "12");
  assert.equal(category.name, "Development");
  assert.match(pool.calls[0].sql, /WHERE project_id = \? AND id = \?/);
  assert.deepEqual(pool.calls[0].params, ["7", "12"]);
});

test("findById returns null when the category does not exist in the project", async () => {
  const pool = createPoolMock({ rows: [] });
  const repository = new CategoryRepository(pool);

  const category = await repository.findById("7", "99");

  assert.equal(category, null);
});

test("existsForProject returns true when the category belongs to the project", async () => {
  const pool = createPoolMock({ rows: [{ id: 12 }] });
  const repository = new CategoryRepository(pool);

  const exists = await repository.existsForProject("7", "12");

  assert.equal(exists, true);
  assert.match(pool.calls[0].sql, /WHERE project_id = \? AND id = \?/);
  assert.deepEqual(pool.calls[0].params, ["7", "12"]);
});

test("existsForProject returns false when the category does not belong to the project", async () => {
  const pool = createPoolMock({ rows: [] });
  const repository = new CategoryRepository(pool);

  const exists = await repository.existsForProject("7", "99");

  assert.equal(exists, false);
});

test("create inserts a category only into an existing writable project", async () => {
  const pool = createPoolMock({
    result: { affectedRows: 1, insertId: 12 },
  });
  const repository = new CategoryRepository(pool);

  const categoryId = await repository.create("7", "Development");

  assert.equal(categoryId, "12");
  assert.match(pool.calls[0].sql, /INSERT INTO categories/);
  assert.match(pool.calls[0].sql, /SELECT id, \?/);
  assert.match(pool.calls[0].sql, /WHERE id = \? AND is_archived = 0/);
  assert.deepEqual(pool.calls[0].params, ["Development", "7"]);
});

test("create returns null when the project is unavailable or archived", async () => {
  const pool = createPoolMock({
    result: { affectedRows: 0 },
  });
  const repository = new CategoryRepository(pool);

  const categoryId = await repository.create("7", "Development");

  assert.equal(categoryId, null);
});

test("create propagates duplicate category database errors", async () => {
  const pool = {
    async execute() {
      const error = new Error("Duplicate category");
      error.code = "ER_DUP_ENTRY";
      throw error;
    },
  };
  const repository = new CategoryRepository(pool);

  await assert.rejects(
    repository.create("7", "Development"),
    { code: "ER_DUP_ENTRY" },
  );
});

test("update changes a category only in its writable project", async () => {
  const pool = createPoolMock({ rows: [sampleCategory] });
  const repository = new CategoryRepository(pool);

  const category = await repository.update("7", "12", "Testing");

  assert.equal(category.id, "12");
  assert.match(pool.calls[0].sql, /UPDATE categories c/);
  assert.match(pool.calls[0].sql, /INNER JOIN projects p/);
  assert.match(pool.calls[0].sql, /p\.is_archived = 0/);
  assert.deepEqual(pool.calls[0].params, ["Testing", "7", "12"]);

  assert.match(pool.calls[1].sql, /SELECT id, project_id, name/);
  assert.deepEqual(pool.calls[1].params, ["7", "12"]);
});

test("delete clears task category references before deleting the category", async () => {
  const pool = createDeletePoolMock();
  const repository = new CategoryRepository(pool);

  const deleted = await repository.delete("7", "12");

  assert.equal(deleted, true);
  assert.equal(pool.calls.length, 3);

  assert.match(pool.calls[0].sql, /SELECT c\.id/);
  assert.match(pool.calls[0].sql, /FOR UPDATE/);

  assert.match(pool.calls[1].sql, /UPDATE tasks/);
  assert.match(pool.calls[1].sql, /SET category_id = NULL/);
  assert.deepEqual(pool.calls[1].params, ["7", "12"]);

  assert.match(pool.calls[2].sql, /DELETE FROM categories/);
  assert.deepEqual(pool.calls[2].params, ["7", "12"]);

  assert.deepEqual(pool.transaction, ["begin", "commit", "release"]);
});

test("delete rolls back when the category does not exist", async () => {
  const pool = createDeletePoolMock({ categoryRows: [] });
  const repository = new CategoryRepository(pool);

  const deleted = await repository.delete("7", "99");

  assert.equal(deleted, false);
  assert.equal(pool.calls.length, 1);
  assert.deepEqual(pool.transaction, ["begin", "rollback", "release"]);
});

test("delete rolls back when the category deletion fails", async () => {
  const pool = createDeletePoolMock({ deleteAffectedRows: 0 });
  const repository = new CategoryRepository(pool);

  const deleted = await repository.delete("7", "12");

  assert.equal(deleted, false);
  assert.deepEqual(pool.transaction, ["begin", "rollback", "release"]);
});

test("delete rolls back and releases the connection after a database error", async () => {
  const pool = createDeletePoolMock({ shouldThrow: true });
  const repository = new CategoryRepository(pool);

  await assert.rejects(
    repository.delete("7", "12"),
    /Database failure/,
  );

  assert.deepEqual(pool.transaction, ["begin", "rollback", "release"]);
});
