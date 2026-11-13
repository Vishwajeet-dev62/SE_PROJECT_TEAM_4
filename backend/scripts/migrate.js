"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const { createPool } = require("../src/config/database");
const { getConfig } = require("../src/config/env");

const MIGRATION_DEPENDENCIES = {
  "002_projects.sql": ["users"],
  "003_project_members.sql": ["users", "projects"],
  "004_tasks.sql": ["users", "projects"],
  "005_comments.sql": ["users", "tasks"],
  "006_audit_logs.sql": ["users"],
  "007_password_reset_tokens.sql": ["users"],
  "008_revoked_tokens.sql": ["users"],
  "009_align_schema_column_names.sql": ["projects"],
  "010_align_project_member_column_name.sql": ["project_members"],
  "011_add_project_to_audit_logs.sql": ["users", "projects"],
  "012_create_notifications.sql": ["users"],
  "013_create_categories.sql": ["projects", "tasks"],
  "014_create_tags.sql": ["projects", "tasks"],
  "015_align_user_security_column_names.sql": ["users"],
};

async function tableExists(connection, tableName) {
  const [rows] = await connection.execute(
    `SELECT COUNT(*) AS table_count
     FROM information_schema.tables
     WHERE table_schema = DATABASE()
       AND table_name = ?`,
    [tableName],
  );

  return Number(rows[0].table_count) > 0;
}

async function assertDependencies(connection, filename) {
  const dependencies = MIGRATION_DEPENDENCIES[filename] || [];
  const missing = [];

  for (const tableName of dependencies) {
    if (!(await tableExists(connection, tableName))) {
      missing.push(tableName);
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `${filename} requires existing table(s): ${missing.join(", ")}. ` +
      "Apply the owning member's migrations first.",
    );
  }
}

async function getMigrationHistoryColumn(connection) {
  try {
    await connection.execute(
      "SELECT migration FROM schema_migrations LIMIT 0",
    );
    return "migration";
  } catch (error) {
    if (error.code !== "ER_BAD_FIELD_ERROR" && error.errno !== 1054) {
      throw error;
    }
  }

  try {
    await connection.execute(
      "SELECT version FROM schema_migrations LIMIT 0",
    );
    return "version";
  } catch (error) {
    if (error.code === "ER_BAD_FIELD_ERROR" || error.errno === 1054) {
      throw new Error(
        "schema_migrations must contain either a migration or version column.",
      );
    }

    throw error;
  }
}

async function runMigrations(pool, migrationsDirectory) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      migration VARCHAR(255) NOT NULL,
      applied_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      PRIMARY KEY (migration)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  const filenames = (await fs.readdir(migrationsDirectory))
    .filter((filename) => /^\d{3}_[a-z0-9_]+\.sql$/.test(filename))
    .sort();

  const connection = await pool.getConnection();
  const completed = [];
  let lockAcquired = false;

  try {
    const [lockRows] = await connection.execute(
      "SELECT GET_LOCK(?, 30) AS lock_acquired",
      ["task_manager_schema_migrations"],
    );

    lockAcquired = Number(lockRows[0].lock_acquired) === 1;

    if (!lockAcquired) {
      throw new Error("Could not acquire the database migration lock");
    }

    const historyColumn = await getMigrationHistoryColumn(connection);

    const [appliedRows] = await connection.execute(
      `SELECT ${historyColumn} AS migration FROM schema_migrations`,
    );

    const applied = new Set(
      appliedRows.map((row) => row.migration),
    );

    for (const filename of filenames) {
      if (applied.has(filename)) {
        continue;
      }

      await assertDependencies(connection, filename);

      const sql = await fs.readFile(
        path.join(migrationsDirectory, filename),
        "utf8",
      );

      const statements = sql
        .split(";")
        .map((statement) => statement.trim())
        .filter((statement) => statement.length > 0);

      for (const statement of statements) {
        await connection.query(statement);
      }

      await connection.execute(
        `INSERT INTO schema_migrations (${historyColumn}) VALUES (?)`,
        [filename],
      );

      completed.push(filename);
    }
  } finally {
    try {
      if (lockAcquired) {
        await connection.execute(
          "SELECT RELEASE_LOCK(?)",
          ["task_manager_schema_migrations"],
        );
      }
    } finally {
      connection.release();
    }
  }

  return completed;
}

async function main() {
  const config = getConfig();
  const pool = createPool(config.db);

  try {
    const completed = await runMigrations(
      pool,
      path.join(__dirname, "..", "migrations"),
    );

    if (completed.length === 0) {
      console.info("Database schema is up to date");
    } else {
      console.info(`Applied migrations: ${completed.join(", ")}`);
    }
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`Database migration failed: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  assertDependencies,
  runMigrations,
  MIGRATION_DEPENDENCIES,
  getMigrationHistoryColumn,
};
