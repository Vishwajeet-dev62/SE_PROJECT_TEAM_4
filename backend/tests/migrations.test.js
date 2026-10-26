
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const {
  MIGRATION_DEPENDENCIES,
  runMigrations,
} = require("../scripts/migrate");

const migrationDirectory = path.join(__dirname, "..", "migrations");

test("Member 2 migrations have stable order and explicit external dependencies", () => {
  const filenames = fs.readdirSync(migrationDirectory).sort();

  assert.deepEqual(filenames, [
    "001_users.sql",
    "002_projects.sql",
    "003_project_members.sql",
    "004_tasks.sql",
    "005_comments.sql",
    "006_audit_logs.sql",
    "007_password_reset_tokens.sql",
  ]);

  assert.equal(MIGRATION_DEPENDENCIES["001_users.sql"], undefined);
  assert.deepEqual(MIGRATION_DEPENDENCIES["002_projects.sql"], ["users"]);
  assert.deepEqual(MIGRATION_DEPENDENCIES["003_project_members.sql"], [
    "users",
    "projects",
  ]);
  assert.deepEqual(MIGRATION_DEPENDENCIES["004_tasks.sql"], [
    "users",
    "projects",
  ]);
  assert.deepEqual(MIGRATION_DEPENDENCIES["005_comments.sql"], [
    "users",
    "tasks",
  ]);
  assert.deepEqual(MIGRATION_DEPENDENCIES["006_audit_logs.sql"], ["users"]);
  assert.deepEqual(MIGRATION_DEPENDENCIES["007_password_reset_tokens.sql"], [
    "users",
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

test("task schema uses InnoDB, project ownership keys, and task query indexes", () => {
  const tasks = readMigration("004_tasks.sql");

  assert.match(tasks, /id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT/);
  assert.match(tasks, /project_id BIGINT UNSIGNED NOT NULL/);
  assert.match(tasks, /created_by BIGINT UNSIGNED NOT NULL/);
  assert.match(tasks, /FOREIGN KEY \(project_id\)/);
  assert.match(tasks, /REFERENCES projects\(id\)/);
  assert.match(tasks, /FOREIGN KEY \(created_by\)/);
  assert.match(tasks, /REFERENCES users\(id\)/);
  assert.match(tasks, /FOREIGN KEY \(assigned_to\)/);
  assert.match(tasks, /ENUM\('TODO', 'IN_PROGRESS', 'DONE'\)/);
  assert.match(tasks, /ENUM\('LOW', 'MEDIUM', 'HIGH'\)/);
  assert.match(tasks, /KEY idx_tasks_project_status \(project_id, status\)/);
  assert.match(tasks, /KEY idx_tasks_deleted_at \(deleted_at\)/);
  assert.match(tasks, /ENGINE=InnoDB/);
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
        return [
          [...state.applied].map((migration) => ({ migration })),
        ];
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
    "001_users.sql",
    "002_projects.sql",
    "003_project_members.sql",
    "004_tasks.sql",
    "005_comments.sql",
    "006_audit_logs.sql",
    "007_password_reset_tokens.sql",
  ]);

  assert.equal(state.applied.size, 7);
  assert.equal(state.executed.length, 7);
  assert.equal(state.lockReleased, true);
});

test("users schema uses InnoDB, unique email and lockout columns", () => {
  const users = readMigration("001_users.sql");

  assert.match(users, /id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT/);
  assert.match(users, /UNIQUE KEY uq_users_email \(email\)/);
  assert.match(users, /ENUM\('ADMIN', 'MEMBER'\)/);
  assert.match(users, /failed_attempts/);
  assert.match(users, /locked_until/);
  assert.match(users, /ENGINE=InnoDB/);
});

test("audit log and reset token schemas use InnoDB and required keys", () => {
  const audit = readMigration("006_audit_logs.sql");
  const reset = readMigration("007_password_reset_tokens.sql");

  assert.match(audit, /FOREIGN KEY \(user_id\) REFERENCES users \(id\)/);
  assert.match(audit, /event_type/);
  assert.match(audit, /ENGINE=InnoDB/);

  assert.match(reset, /UNIQUE KEY uq_password_reset_token_hash \(token_hash\)/);
  assert.match(reset, /used_at/);
  assert.match(reset, /expires_at/);
  assert.match(reset, /ENGINE=InnoDB/);
});




test("migration runner reports missing member-owned tables without applying schema", async () => {
  const state = {
    tables: new Set(["users", "projects", "project_members"]),
    applied: new Set([
      "001_users.sql",
      "002_projects.sql",
      "003_project_members.sql",
      "004_tasks.sql",
    ]),
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
        return [
          [...state.applied].map((migration) => ({ migration })),
        ];
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

  await assert.rejects(
    runMigrations(pool, migrationDirectory),
    /005_comments\.sql requires existing table\(s\): tasks/,
  );

  assert.deepEqual(state.executed, []);
  assert.equal(state.lockReleased, true);
});




function readMigration(filename) {
  return fs.readFileSync(path.join(migrationDirectory, filename), "utf8");
}
