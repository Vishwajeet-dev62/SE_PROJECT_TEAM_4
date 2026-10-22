const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { MIGRATION_DEPENDENCIES, runMigrations } = require("../scripts/migrate");

const migrationDirectory = path.join(__dirname, "..", "migrations");

test("Member 2 migrations have stable order and explicit external dependencies", () => {
  const filenames = fs.readdirSync(migrationDirectory).sort();
  assert.deepEqual(filenames, [
    "002_projects.sql",
    "003_project_members.sql",
    "005_comments.sql",
  ]);
  assert.deepEqual(MIGRATION_DEPENDENCIES["002_projects.sql"], ["users"]);
  assert.deepEqual(MIGRATION_DEPENDENCIES["003_project_members.sql"], [
    "users",
    "projects",
  ]);
  assert.deepEqual(MIGRATION_DEPENDENCIES["005_comments.sql"], [
    "users",
    "tasks",
  ]);
});

test("project, membership, and comment schemas use InnoDB and contract keys", () => {
  const projects = readMigration("002_projects.sql");
  const members = readMigration("003_project_members.sql");
  const comments = readMigration("005_comments.sql");

  assert.match(projects, /id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT/);
  assert.match(projects, /FOREIGN KEY \(owner_id\) REFERENCES users \(id\)/);
  assert.match(projects, /ENGINE=InnoDB/);
  assert.match(members, /PRIMARY KEY \(project_id, user_id\)/);
  assert.match(members, /ENUM\('OWNER', 'MEMBER'\)/);
  assert.match(members, /ENGINE=InnoDB/);
  assert.match(comments, /FOREIGN KEY \(task_id\) REFERENCES tasks \(id\)/);
  assert.match(comments, /FOREIGN KEY \(author_id\) REFERENCES users \(id\)/);
  assert.match(comments, /ENGINE=InnoDB/);
});

test("migration runner applies sorted files once under a database lock", async () => {
  const state = {
    tables: new Set(["users", "projects", "tasks"]),
    applied: new Set(),
    executed: [],
    lockReleased: false,
  };
  const connection = {
    execute: async (sql, values = []) => {
      if (sql.includes("GET_LOCK")) {
        return [[{ lock_acquired: 1 }]];
      }
      if (sql.includes("RELEASE_LOCK")) {
        state.lockReleased = true;
        return [[{ released: 1 }]];
      }
      if (sql.includes("information_schema.tables")) {
        return [[{ table_count: Number(state.tables.has(values[0])) }]];
      }
      if (sql.includes("SELECT migration")) {
        return [[...state.applied].map((migration) => ({ migration }))];
      }
      if (sql.includes("INSERT INTO schema_migrations")) {
        state.applied.add(values[0]);
        return [{ affectedRows: 1 }];
      }
      throw new Error(`Unexpected migration query: ${sql}`);
    },
    query: async (sql) => {
      state.executed.push(sql);
      return [{ affectedRows: 0 }];
    },
    release: () => {},
  };
  const pool = {
    query: async () => [{ affectedRows: 0 }],
    getConnection: async () => connection,
  };

  const completed = await runMigrations(pool, migrationDirectory);
  assert.deepEqual(completed, [
    "002_projects.sql",
    "003_project_members.sql",
    "005_comments.sql",
  ]);
  assert.equal(state.applied.size, 3);
  assert.equal(state.executed.length, 3);
  assert.equal(state.lockReleased, true);
});

test("migration runner reports missing member-owned tables without applying schema", async () => {
  let migrationExecuted = false;
  const connection = {
    execute: async (sql, values = []) => {
      if (sql.includes("GET_LOCK")) {
        return [[{ lock_acquired: 1 }]];
      }
      if (sql.includes("RELEASE_LOCK")) {
        return [[{ released: 1 }]];
      }
      if (sql.includes("information_schema.tables")) {
        return [[{ table_count: 0 }]];
      }
      if (sql.includes("SELECT migration")) {
        return [[]];
      }
      throw new Error(`Unexpected migration query: ${sql}`);
    },
    query: async () => {
      migrationExecuted = true;
    },
    release: () => {},
  };
  const pool = {
    query: async () => [{ affectedRows: 0 }],
    getConnection: async () => connection,
  };

  await assert.rejects(
    runMigrations(pool, migrationDirectory),
    /002_projects\.sql requires existing table\(s\): users/,
  );
  assert.equal(migrationExecuted, false);
});

function readMigration(filename) {
  return fs.readFileSync(path.join(migrationDirectory, filename), "utf8");
}
