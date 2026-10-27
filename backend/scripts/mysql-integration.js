"use strict";

// This runner is deliberately named outside Node's automatic test discovery.
require("dotenv").config({ quiet: true });

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const jwt = require("jsonwebtoken");
const { createPool } = require("../src/config/database");
const { getConfig } = require("../src/config/env");
const { createApp } = require("../src/app");
const { createServices } = require("../src/services/createServices");

const REQUIRED_OPT_IN = "M2_MYSQL_INTEGRATION=1";
const MIGRATIONS = [
  "001_users.sql",
  "002_projects.sql",
  "003_project_members.sql",
  "004_tasks.sql",
  "005_comments.sql",
  "006_audit_logs.sql",
  "007_password_reset_tokens.sql",
  "008_revoked_tokens.sql",
];
const APPLICATION_TABLES = [
  "users",
  "projects",
  "project_members",
  "tasks",
  "comments",
  "audit_logs",
  "password_reset_tokens",
  "revoked_tokens",
];

function isDisposableDatabase(name) {
  return (
    /(^|[_-])(test|testing|disposable)([_-]|$)/i.test(name) &&
    !/(^|[_-])(prod|production|live|shared|staging)([_-]|$)/i.test(name)
  );
}

function requireExplicitOptIn(config) {
  if (process.env.M2_MYSQL_INTEGRATION !== "1") {
    throw new Error(
      `Refusing database writes. Set ${REQUIRED_OPT_IN} only for an isolated test database.`,
    );
  }
  if (!isDisposableDatabase(config.db.database)) {
    throw new Error(
      "Refusing database writes: DB_NAME must clearly contain a test, testing, or disposable component.",
    );
  }
  if (
    typeof config.jwtSecret !== "string" ||
    config.jwtSecret.length < 32 ||
    /replace_with_a_long_random_secret/i.test(config.jwtSecret)
  ) {
    throw new Error("JWT_SECRET must be a non-placeholder value of at least 32 characters.");
  }
}

async function assertDatabaseReady(pool, expectedDatabase) {
  const [databaseRows] = await pool.query("SELECT DATABASE() AS selected_database");
  assert.equal(
    databaseRows[0].selected_database,
    expectedDatabase,
    "Connected database does not match DB_NAME",
  );

  const [tableRows] = await pool.execute(
    `SELECT TABLE_NAME, ENGINE
     FROM information_schema.tables
     WHERE table_schema = DATABASE()`,
  );
  const tables = new Map(tableRows.map((row) => [row.TABLE_NAME, row.ENGINE]));
  for (const table of ["schema_migrations", ...APPLICATION_TABLES]) {
    assert.equal(tables.has(table), true, `Required table is missing: ${table}`);
    assert.equal(tables.get(table), "InnoDB", `${table} must use InnoDB`);
  }

  const [migrationRows] = await pool.query(
    "SELECT migration FROM schema_migrations ORDER BY migration",
  );
  assert.deepEqual(
    migrationRows.map((row) => row.migration),
    MIGRATIONS,
    "Apply all documented migrations before running this script; this script never migrates",
  );
}

function makeFixture(runId) {
  const roles = ["owner", "member", "collaborator", "outsider", "admin"];
  const emails = Object.fromEntries(
    roles.map((role) => [role, `m2-live-${runId}-${role}@example.invalid`]),
  );
  const projectNames = {
    primary: `M2 live ${runId} primary`,
    renamed: `M2 live ${runId} renamed`,
    outsider: `M2 live ${runId} outsider`,
    adminArchive: `M2 live ${runId} admin archive`,
  };
  return { roles, emails, projectNames };
}

async function assertNoFixtureCollision(pool, fixture) {
  const emailValues = Object.values(fixture.emails);
  const projectValues = Object.values(fixture.projectNames);
  const [userRows] = await pool.execute(
    `SELECT id FROM users WHERE email IN (${emailValues.map(() => "?").join(",")})`,
    emailValues,
  );
  const [projectRows] = await pool.execute(
    `SELECT id FROM projects WHERE name IN (${projectValues.map(() => "?").join(",")})`,
    projectValues,
  );
  assert.equal(userRows.length, 0, "Generated test user marker already exists; refusing to run");
  assert.equal(projectRows.length, 0, "Generated test project marker already exists; refusing to run");
}

async function runApiChecks(pool, config, fixture) {
  const services = createServices(pool, {
    jwtSecret: config.jwtSecret,
    jwtExpiresIn: config.jwtExpiresIn,
  });
  const app = createApp({ ...services, corsOrigins: config.corsOrigins });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });

  const baseUrl = `http://127.0.0.1:${server.address().port}/api/v1`;
  const users = {};
  const tokens = {};

  async function request(path, { method = "GET", token, body, status } = {}) {
    const headers = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    if (body !== undefined) headers["Content-Type"] = "application/json";
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const payload = response.status === 204 ? null : await response.json();
    assert.equal(
      response.status,
      status,
      `${method} ${path}: expected ${status}, received ${response.status} (${payload?.error?.code || "no error code"})`,
    );
    return payload;
  }

  try {
    for (const role of fixture.roles) {
      const result = await request("/auth/register", {
        method: "POST",
        status: 201,
        body: {
          name: `M2 live ${role} ${fixture.runId.slice(0, 8)}`,
          email: fixture.emails[role],
          password: fixture.password,
        },
      });
      users[role] = result.data.user;
    }

    await pool.execute("UPDATE users SET role = 'ADMIN' WHERE id = ?", [users.admin.id]);

    for (const role of fixture.roles) {
      const result = await request("/auth/login", {
        method: "POST",
        status: 200,
        body: { email: fixture.emails[role], password: fixture.password },
      });
      tokens[role] = result.data.accessToken;
    }

    const me = await request("/auth/me", { token: tokens.owner, status: 200 });
    assert.equal(me.data.user.id, users.owner.id);
    await request("/projects", { status: 401 });

    const invalidProject = await request("/projects", {
      method: "POST",
      token: tokens.owner,
      body: { name: " " },
      status: 400,
    });
    assert.equal(invalidProject.error.code, "VALIDATION_ERROR");

    const primary = (await request("/projects", {
      method: "POST",
      token: tokens.owner,
      body: { name: fixture.projectNames.primary, description: "mysql integration" },
      status: 201,
    })).data;
    assert.equal(primary.ownerId, users.owner.id);

    const listing = await request("/projects?page=1&limit=1", {
      token: tokens.owner,
      status: 200,
    });
    assert.equal(listing.pagination.total, 1);
    const retrieved = await request(`/projects/${primary.id}`, {
      token: tokens.owner,
      status: 200,
    });
    assert.equal(retrieved.data.name, fixture.projectNames.primary);
    const updated = await request(`/projects/${primary.id}`, {
      method: "PATCH",
      token: tokens.owner,
      body: { name: fixture.projectNames.renamed },
      status: 200,
    });
    assert.equal(updated.data.name, fixture.projectNames.renamed);
    const persistedProject = await request(`/projects/${primary.id}`, {
      token: tokens.owner,
      status: 200,
    });
    assert.equal(persistedProject.data.name, fixture.projectNames.renamed);

    await request(`/projects/${primary.id}`, { token: tokens.outsider, status: 403 });
    await request(`/projects/${primary.id}/members`, {
      method: "POST",
      token: tokens.member,
      body: { userId: users.collaborator.id },
      status: 403,
    });
    await request(`/projects/${primary.id}/members`, {
      method: "POST",
      token: tokens.admin,
      body: { userId: users.collaborator.id },
      status: 403,
    });

    for (const role of ["member", "collaborator"]) {
      await request(`/projects/${primary.id}/members`, {
        method: "POST",
        token: tokens.owner,
        body: { userId: users[role].id },
        status: 201,
      });
    }
    const members = await request(`/projects/${primary.id}/members?page=1&limit=2`, {
      token: tokens.member,
      status: 200,
    });
    assert.equal(members.pagination.total, 3);
    assert.equal(members.data.length, 2);
    await request(`/projects/${primary.id}`, { token: tokens.member, status: 200 });
    await request(`/projects/${primary.id}`, { token: tokens.admin, status: 200 });
    await request(`/projects/${primary.id}/members/${users.member.id}`, {
      method: "DELETE",
      token: tokens.owner,
      status: 204,
    });
    await request(`/projects/${primary.id}`, { token: tokens.member, status: 403 });
    await request(`/projects/${primary.id}/members`, {
      method: "POST",
      token: tokens.owner,
      body: { userId: users.member.id },
      status: 201,
    });

    async function createTask(body) {
      const task = (await request(`/projects/${primary.id}/tasks`, {
        method: "POST",
        token: tokens.owner,
        body,
        status: 201,
      })).data;
      return task;
    }
    const assigned = await createTask({
      title: `M2 live assigned ${fixture.runId}`,
      status: "TODO",
      priority: "HIGH",
      assigned_to: users.member.id,
      due_date: "2000-01-01",
    });
    await createTask({
      title: `M2 live done ${fixture.runId}`,
      status: "DONE",
      due_date: "2000-01-01",
    });
    const todo = await createTask({
      title: `M2 live todo ${fixture.runId}`,
      status: "TODO",
      due_date: "2000-01-01",
    });
    await request(`/tasks/${todo.id}`, {
      method: "PATCH",
      token: tokens.member,
      body: { status: "DONE" },
      status: 403,
    });
    const moved = await request(`/tasks/${assigned.id}`, {
      method: "PATCH",
      token: tokens.member,
      body: { status: "IN_PROGRESS" },
      status: 200,
    });
    assert.equal(moved.data.status, "IN_PROGRESS");
    const [persistedTask] = await pool.execute(
      "SELECT status FROM tasks WHERE id = ?",
      [assigned.id],
    );
    assert.equal(persistedTask[0].status, "IN_PROGRESS");

    const board = await request(`/projects/${primary.id}/board?page=1&limit=20`, {
      token: tokens.member,
      status: 200,
    });
    assert.equal(board.pagination.total, 3);
    assert.equal(board.data.TODO.length, 1);
    assert.equal(board.data.IN_PROGRESS.length, 1);
    assert.equal(board.data.DONE.length, 1);

    const dashboard = await request(`/projects/${primary.id}/dashboard`, {
      token: tokens.member,
      status: 200,
    });
    assert.deepEqual(dashboard.data, {
      countsByStatus: { TODO: 1, IN_PROGRESS: 1, DONE: 1 },
      percentComplete: 33,
      overdue: 2,
    });

    const outsiderProject = (await request("/projects", {
      method: "POST",
      token: tokens.outsider,
      body: { name: fixture.projectNames.outsider },
      status: 201,
    })).data;
    const foreignTask = (await request(`/projects/${outsiderProject.id}/tasks`, {
      method: "POST",
      token: tokens.outsider,
      body: { title: `M2 live foreign ${fixture.runId}` },
      status: 201,
    })).data;
    await request(`/tasks/${foreignTask.id}`, { token: tokens.owner, status: 403 });
    await request(`/projects/${outsiderProject.id}/board`, { token: tokens.owner, status: 403 });
    await request(`/projects/${outsiderProject.id}/dashboard`, { token: tokens.owner, status: 403 });

    const ownerComment = (await request(`/tasks/${assigned.id}/comments`, {
      method: "POST",
      token: tokens.owner,
      body: { body: "owner comment" },
      status: 201,
    })).data;
    const memberComment = (await request(`/tasks/${assigned.id}/comments`, {
      method: "POST",
      token: tokens.member,
      body: { body: "member comment" },
      status: 201,
    })).data;
    const adminComment = (await request(`/tasks/${assigned.id}/comments`, {
      method: "POST",
      token: tokens.admin,
      body: { body: "admin comment" },
      status: 201,
    })).data;

    const comments = await request(`/tasks/${assigned.id}/comments?page=1&limit=2`, {
      token: tokens.member,
      status: 200,
    });
    assert.equal(comments.pagination.total, 3);
    assert.equal(comments.data.length, 2);
    await request(`/tasks/${assigned.id}/comments`, {
      method: "POST",
      token: tokens.owner,
      body: { body: "  " },
      status: 400,
    });
    await request(`/comments/${ownerComment.id}`, {
      method: "PATCH",
      token: tokens.member,
      body: { body: "unauthorized edit" },
      status: 403,
    });
    const edited = await request(`/comments/${memberComment.id}`, {
      method: "PATCH",
      token: tokens.member,
      body: { body: "member edited" },
      status: 200,
    });
    assert.equal(edited.data.body, "member edited");
    await request(`/comments/${memberComment.id}`, {
      method: "DELETE",
      token: tokens.member,
      status: 204,
    });
    await request(`/comments/${ownerComment.id}`, {
      method: "DELETE",
      token: tokens.owner,
      status: 204,
    });
    await request(`/comments/${adminComment.id}`, {
      method: "DELETE",
      token: tokens.admin,
      status: 204,
    });
    await request(`/tasks/${foreignTask.id}/comments`, { token: tokens.owner, status: 403 });
    await assert.rejects(
      pool.execute(
        "INSERT INTO comments (task_id, author_id, body) VALUES (?, ?, ?)",
        ["18446744073709551614", users.owner.id, "foreign key check"],
      ),
      (error) => error.code === "ER_NO_REFERENCED_ROW_2",
    );

    await request(`/projects/${primary.id}`, {
      method: "PATCH",
      token: tokens.admin,
      body: { name: "admin settings denial" },
      status: 403,
    });
    const adminProject = (await request("/projects", {
      method: "POST",
      token: tokens.outsider,
      body: { name: fixture.projectNames.adminArchive },
      status: 201,
    })).data;
    await request(`/projects/${adminProject.id}/archive`, {
      method: "POST",
      token: tokens.admin,
      status: 200,
    });

    const archived = await request(`/projects/${primary.id}/archive`, {
      method: "POST",
      token: tokens.owner,
      status: 200,
    });
    assert.equal(archived.data.archived, true);
    const repeatedArchive = await request(`/projects/${primary.id}/archive`, {
      method: "POST",
      token: tokens.owner,
      status: 200,
    });
    assert.equal(repeatedArchive.data.archived, true);
    await request(`/projects/${primary.id}`, { token: tokens.member, status: 200 });
    await request(`/projects/${primary.id}`, {
      method: "PATCH",
      token: tokens.owner,
      body: { name: "archived write denial" },
      status: 409,
    });
    await request(`/projects/${primary.id}/members`, {
      method: "POST",
      token: tokens.owner,
      body: { userId: users.outsider.id },
      status: 409,
    });
    await request(`/projects/${primary.id}/tasks`, {
      method: "POST",
      token: tokens.owner,
      body: { title: "archived task write denial" },
      status: 409,
    });
    await request(`/tasks/${assigned.id}`, {
      method: "PATCH",
      token: tokens.member,
      body: { status: "DONE" },
      status: 409,
    });
    await request(`/tasks/${assigned.id}/comments`, {
      method: "POST",
      token: tokens.owner,
      body: { body: "archived comment write denial" },
      status: 409,
    });

    const tokenId = jwt.decode(tokens.owner)?.jti;
    assert.equal(typeof tokenId, "string", "Login token must have a JWT ID");
    await request("/auth/logout", {
      method: "POST",
      token: tokens.owner,
      status: 204,
    });
    const [revocationRows] = await pool.execute(
      "SELECT COUNT(*) AS total FROM revoked_tokens WHERE token_id = ? AND user_id = ?",
      [tokenId, users.owner.id],
    );
    assert.equal(Number(revocationRows[0].total), 1);
    await request("/auth/me", { token: tokens.owner, status: 401 });

    return {
      userIds: Object.values(users).map((user) => String(user.id)),
      checks: [
        "registration/login, protected and unauthenticated access, logout revocation",
        "project CRUD, validation, membership, pagination, owner/admin policy",
        "cross-user and cross-project authorization",
        "task status persistence, Kanban grouping, dashboard calculations",
        "comment CRUD, validation, pagination, permissions, foreign key enforcement",
        "archive idempotency and archived write restrictions",
      ],
    };
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function cleanupFixture(pool, fixture) {
  const emails = Object.values(fixture.emails);
  const projectNames = Object.values(fixture.projectNames);
  const [users] = await pool.execute(
    `SELECT id FROM users WHERE email IN (${emails.map(() => "?").join(",")})`,
    emails,
  );
  const userIds = users.map((row) => String(row.id));
  const [projects] = await pool.execute(
    `SELECT id FROM projects WHERE name IN (${projectNames.map(() => "?").join(",")})`,
    projectNames,
  );
  const projectIds = projects.map((row) => String(row.id));
  let taskIds = [];

  if (projectIds.length > 0) {
    const placeholders = projectIds.map(() => "?").join(",");
    const [tasks] = await pool.execute(
      `SELECT id FROM tasks WHERE project_id IN (${placeholders})`,
      projectIds,
    );
    taskIds = tasks.map((row) => String(row.id));
    await pool.execute(
      `DELETE c FROM comments c
       INNER JOIN tasks t ON t.id = c.task_id
       WHERE t.project_id IN (${placeholders})`,
      projectIds,
    );
    await pool.execute(
      `DELETE FROM tasks WHERE project_id IN (${placeholders})`,
      projectIds,
    );
    await pool.execute(
      `DELETE FROM project_members WHERE project_id IN (${placeholders})`,
      projectIds,
    );
    await pool.execute(
      `DELETE FROM projects WHERE id IN (${placeholders})`,
      projectIds,
    );
  }

  if (userIds.length > 0) {
    const placeholders = userIds.map(() => "?").join(",");
    await pool.execute(
      `DELETE FROM revoked_tokens WHERE user_id IN (${placeholders})`,
      userIds,
    );
    await pool.execute(
      `DELETE FROM password_reset_tokens WHERE user_id IN (${placeholders})`,
      userIds,
    );
    await pool.execute(
      `DELETE FROM audit_logs WHERE user_id IN (${placeholders})`,
      userIds,
    );
    await pool.execute(
      `DELETE FROM project_members WHERE user_id IN (${placeholders})`,
      userIds,
    );
    await pool.execute(
      `DELETE FROM users WHERE id IN (${placeholders})`,
      userIds,
    );
  }

  const [remainingUsers] = await pool.execute(
    `SELECT id FROM users WHERE email IN (${emails.map(() => "?").join(",")})`,
    emails,
  );
  const [remainingProjects] = await pool.execute(
    `SELECT id FROM projects WHERE name IN (${projectNames.map(() => "?").join(",")})`,
    projectNames,
  );
  assert.equal(remainingUsers.length, 0, "Test user cleanup was incomplete");
  assert.equal(remainingProjects.length, 0, "Test project cleanup was incomplete");

  for (const [table, column, values] of [
    ["project_members", "project_id", projectIds],
    ["tasks", "id", taskIds],
    ["comments", "task_id", taskIds],
    ["revoked_tokens", "user_id", userIds],
    ["password_reset_tokens", "user_id", userIds],
    ["audit_logs", "user_id", userIds],
  ]) {
    if (values.length === 0) continue;
    const placeholders = values.map(() => "?").join(",");
    const [rows] = await pool.execute(
      `SELECT 1 FROM \`${table}\` WHERE \`${column}\` IN (${placeholders}) LIMIT 1`,
      values,
    );
    assert.equal(rows.length, 0, `Test data cleanup was incomplete for ${table}`);
  }

  return { removedUsers: userIds.length, removedProjects: projectIds.length };
}

async function main() {
  const config = getConfig();
  requireExplicitOptIn(config);
  const pool = createPool(config.db);
  const runId = crypto.randomUUID();
  const fixture = makeFixture(runId);
  fixture.runId = runId;
  fixture.password = `M2live${crypto.randomBytes(9).toString("hex")}7a`;
  let result;
  let primaryError;
  let fixtureSafeToClean = false;

  try {
    await assertDatabaseReady(pool, config.db.database);
    await assertNoFixtureCollision(pool, fixture);
    fixtureSafeToClean = true;
    result = await runApiChecks(pool, config, fixture);
  } catch (error) {
    primaryError = error;
  } finally {
    if (fixtureSafeToClean) {
      try {
        const cleanup = await cleanupFixture(pool, fixture);
        console.info(JSON.stringify({ cleanup: "verified", ...cleanup }));
      } catch (error) {
        console.error(`CRITICAL: MySQL integration-test cleanup failed: ${error.message}`);
        if (!primaryError) primaryError = error;
      }
    }
    await pool.end();
  }

  if (primaryError) {
    throw primaryError;
  }
  console.info(JSON.stringify({ result: "passed", ...result }));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`MySQL integration test failed: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { assertDatabaseReady, isDisposableDatabase, requireExplicitOptIn };
