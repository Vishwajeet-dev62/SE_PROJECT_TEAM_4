"use strict";

// Live checks for the Member 3 features (lockout, admin, password reset,
// assignment, rate limiting, audit logging) against a disposable MySQL
// database that has all migrations applied. It reuses the safety guards of
// scripts/mysql-integration.js and, like it, never runs migrations.
//
//   M2_MYSQL_INTEGRATION=1 npm run test:mysql:member3
require("dotenv").config({ quiet: true });

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { createPool } = require("../src/config/database");
const { getConfig } = require("../src/config/env");
const { createApp } = require("../src/app");
const { createServices } = require("../src/services/createServices");
const {
  assertDatabaseReady,
  requireExplicitOptIn,
} = require("./mysql-integration");

const ROLES = ["admin", "alice", "bob", "carol", "dave"];
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");

function makeFixture(runId) {
  return {
    runId,
    emails: Object.fromEntries(
      ROLES.map((role) => [role, `m3-live-${runId}-${role}@example.invalid`]),
    ),
    projectName: `M3 live project ${runId}`,
    password: `M3live${crypto.randomBytes(9).toString("hex")}7a`,
    newPassword: `M3next${crypto.randomBytes(9).toString("hex")}9b`,
  };
}

async function listen(app) {
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  return { server, baseUrl: `http://127.0.0.1:${server.address().port}/api/v1` };
}

function createClient(baseUrl) {
  return async function request(path, { method = "GET", token, body } = {}) {
    const headers = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    if (body !== undefined) headers["Content-Type"] = "application/json";
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    return { status: response.status, body: text ? JSON.parse(text) : null };
  };
}

function expectStatus(response, status, label) {
  assert.equal(
    response.status,
    status,
    `${label}: expected ${status}, received ${response.status} (${response.body?.error?.code || "ok"})`,
  );
  return response.body;
}

async function runChecks(pool, config, fixture) {
  const sentLinks = [];
  const originalInfo = console.info;
  console.info = (...args) => {
    const line = args.join(" ");
    const match = /\[DEV EMAIL\] Password reset for (\S+): (\S+)/.exec(line);
    if (match) sentLinks.push({ to: match[1], url: match[2] });
    else originalInfo(...args);
  };

  const services = createServices(pool, {
    jwtSecret: config.jwtSecret,
    jwtExpiresIn: config.jwtExpiresIn,
  });
  const flow = await listen(
    createApp({ ...services, corsOrigins: config.corsOrigins, authRateLimit: false }),
  );
  const limited = await listen(
    createApp({ ...services, corsOrigins: config.corsOrigins }),
  );
  const api = createClient(flow.baseUrl);
  const limitedApi = createClient(limited.baseUrl);

  const users = {};
  const tokens = {};
  const checks = [];
  const done = (name) => checks.push(name);

  const login = (role, password = fixture.password) =>
    api("/auth/login", { method: "POST", body: { email: fixture.emails[role], password } });
  const auditRows = async (userId, eventType) => {
    const [rows] = await pool.execute(
      "SELECT details FROM audit_logs WHERE user_id = ? AND event_type = ? ORDER BY id",
      [userId, eventType],
    );
    return rows.map((row) =>
      typeof row.details === "string" ? JSON.parse(row.details) : row.details,
    );
  };

  try {
    // 1. Registration, bcrypt cost, login --------------------------------
    for (const role of ROLES) {
      const registered = expectStatus(
        await api("/auth/register", {
          method: "POST",
          body: { name: `M3 ${role}`, email: fixture.emails[role], password: fixture.password },
        }),
        201,
        `register ${role}`,
      );
      users[role] = registered.data.user;
      assert.equal(registered.data.user.password_hash, undefined);
      assert.equal(registered.data.user.passwordHash, undefined);
    }
    expectStatus(
      await api("/auth/register", {
        method: "POST",
        body: { name: "dup", email: fixture.emails.alice.toUpperCase(), password: fixture.password },
      }),
      409,
      "duplicate email",
    );
    const [hashRows] = await pool.execute(
      "SELECT password_hash FROM users WHERE id = ?",
      [users.alice.id],
    );
    assert.match(hashRows[0].password_hash, /^\$2[aby]\$12\$/, "bcrypt cost 12 stored");
    assert.equal(hashRows[0].password_hash.includes(fixture.password), false);
    await pool.execute("UPDATE users SET role = 'ADMIN' WHERE id = ?", [users.admin.id]);
    for (const role of ROLES) {
      tokens[role] = expectStatus(await login(role), 200, `login ${role}`).data.accessToken;
    }
    done("registration, duplicate email, bcrypt cost 12 in the database, login");

    // 2. Lockout and audit ------------------------------------------------
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      expectStatus(await login("bob", "WrongPass1"), 401, `bad login ${attempt}`);
    }
    const [locked] = await pool.execute(
      `SELECT failed_attempts, locked_until > UTC_TIMESTAMP(3) AS locked,
              TIMESTAMPDIFF(MINUTE, UTC_TIMESTAMP(3), locked_until) AS minutes
       FROM users WHERE id = ?`,
      [users.bob.id],
    );
    assert.equal(Number(locked[0].failed_attempts), 5);
    assert.equal(Number(locked[0].locked), 1);
    assert.ok(Number(locked[0].minutes) >= 14 && Number(locked[0].minutes) <= 15);
    const whileLocked = expectStatus(await login("bob"), 401, "correct password while locked");
    assert.equal(whileLocked.error.code, "INVALID_CREDENTIALS");
    assert.ok((await auditRows(users.bob.id, "ACCOUNT_LOCKED")).length >= 1);
    assert.ok((await auditRows(users.bob.id, "LOGIN_FAILED")).length >= 4);
    await pool.execute(
      "UPDATE users SET locked_until = UTC_TIMESTAMP(3) - INTERVAL 1 MINUTE WHERE id = ?",
      [users.bob.id],
    );
    tokens.bob = expectStatus(await login("bob"), 200, "login after lockout expiry").data.accessToken;
    const [reset] = await pool.execute(
      "SELECT failed_attempts, locked_until FROM users WHERE id = ?",
      [users.bob.id],
    );
    assert.equal(Number(reset[0].failed_attempts), 0);
    assert.equal(reset[0].locked_until, null);
    done("lockout after 5 failures for ~15 minutes, audit events, reset on success");

    // 3. Administration ---------------------------------------------------
    expectStatus(await api("/admin/users"), 401, "admin list anonymous");
    expectStatus(await api("/admin/users", { token: tokens.alice }), 403, "admin list as member");
    const listing = expectStatus(
      await api("/admin/users?page=1&limit=100", { token: tokens.admin }),
      200,
      "admin list",
    );
    assert.ok(listing.data.some((user) => user.id === users.bob.id));
    assert.equal(JSON.stringify(listing).includes("password"), false);
    assert.ok(listing.pagination.total >= ROLES.length);

    expectStatus(
      await api(`/admin/users/${users.bob.id}/status`, {
        method: "PATCH", token: tokens.admin, body: { active: false },
      }),
      200,
      "deactivate bob",
    );
    expectStatus(await api("/auth/me", { token: tokens.bob }), 401, "deactivated user's token");
    expectStatus(await login("bob"), 401, "deactivated user login");
    expectStatus(
      await api(`/admin/users/${users.bob.id}/status`, {
        method: "PATCH", token: tokens.admin, body: { active: true },
      }),
      200,
      "reactivate bob",
    );
    tokens.bob = expectStatus(await login("bob"), 200, "login after reactivation").data.accessToken;

    expectStatus(
      await api(`/admin/users/${users.carol.id}/role`, {
        method: "PATCH", token: tokens.admin, body: { role: "ADMIN" },
      }),
      200,
      "promote carol",
    );
    expectStatus(await api("/admin/users", { token: tokens.carol }), 200, "new admin takes effect at once");
    expectStatus(
      await api(`/admin/users/${users.carol.id}/role`, {
        method: "PATCH", token: tokens.admin, body: { role: "MEMBER" },
      }),
      200,
      "demote carol",
    );
    expectStatus(await api("/admin/users", { token: tokens.carol }), 403, "demotion takes effect at once");
    expectStatus(
      await api(`/admin/users/${users.admin.id}/role`, {
        method: "PATCH", token: tokens.admin, body: { role: "MEMBER" },
      }),
      409,
      "admin cannot demote self",
    );
    const roleEvents = await auditRows(users.admin.id, "ROLE_CHANGED");
    assert.deepEqual(
      roleEvents.map((event) => [event.from, event.to]),
      [["MEMBER", "ADMIN"], ["ADMIN", "MEMBER"]],
    );
    assert.equal((await auditRows(users.admin.id, "USER_STATUS_CHANGED")).length, 2);
    done("admin list, deactivate/reactivate, role change, self-change blocked, audited");

    // 4. Password reset ---------------------------------------------------
    const oldAliceToken = tokens.alice;
    const forgotKnown = expectStatus(
      await api("/auth/forgot-password", { method: "POST", body: { email: fixture.emails.alice } }),
      202,
      "forgot known",
    );
    const forgotUnknown = expectStatus(
      await api("/auth/forgot-password", { method: "POST", body: { email: `nobody-${fixture.runId}@example.invalid` } }),
      202,
      "forgot unknown",
    );
    assert.deepEqual(forgotKnown, forgotUnknown);
    assert.equal(sentLinks.length, 1);
    const firstToken = new URL(sentLinks[0].url).searchParams.get("token");
    const [tokenRows] = await pool.execute(
      `SELECT token_hash, TIMESTAMPDIFF(MINUTE, UTC_TIMESTAMP(3), expires_at) AS minutes
       FROM password_reset_tokens WHERE user_id = ?`,
      [users.alice.id],
    );
    assert.equal(tokenRows.length, 1);
    assert.equal(tokenRows[0].token_hash, sha256(firstToken));
    assert.notEqual(tokenRows[0].token_hash, firstToken);
    assert.ok(Number(tokenRows[0].minutes) >= 28 && Number(tokenRows[0].minutes) <= 30);

    await api("/auth/forgot-password", { method: "POST", body: { email: fixture.emails.alice } });
    const secondToken = new URL(sentLinks[1].url).searchParams.get("token");
    expectStatus(
      await api("/auth/reset-password", { method: "POST", body: { token: firstToken, newPassword: fixture.newPassword } }),
      400,
      "older link retired",
    );
    expectStatus(
      await api("/auth/reset-password", { method: "POST", body: { token: secondToken, newPassword: "short" } }),
      400,
      "weak new password",
    );
    expectStatus(
      await api("/auth/reset-password", { method: "POST", body: { token: secondToken, newPassword: fixture.newPassword } }),
      200,
      "reset",
    );
    expectStatus(await login("alice"), 401, "old password after reset");
    tokens.alice = expectStatus(await login("alice", fixture.newPassword), 200, "new password").data.accessToken;
    expectStatus(
      await api("/auth/reset-password", { method: "POST", body: { token: secondToken, newPassword: fixture.password } }),
      400,
      "reused link",
    );
    await api("/auth/forgot-password", { method: "POST", body: { email: fixture.emails.alice } });
    const expiringToken = new URL(sentLinks[2].url).searchParams.get("token");
    await pool.execute(
      "UPDATE password_reset_tokens SET expires_at = UTC_TIMESTAMP(3) - INTERVAL 1 MINUTE WHERE token_hash = ?",
      [sha256(expiringToken)],
    );
    expectStatus(
      await api("/auth/reset-password", { method: "POST", body: { token: expiringToken, newPassword: fixture.password } }),
      400,
      "expired link",
    );
    assert.equal((await auditRows(users.alice.id, "PASSWORD_RESET_COMPLETED")).length, 1);
    const sessionEndedByReset = expectStatus(
      await api("/auth/me", { token: oldAliceToken }),
      401,
      "token issued before the reset",
    );
    assert.equal(sessionEndedByReset.error.code, "SESSION_REVOKED");
    const [changedRows] = await pool.execute(
      "SELECT password_changed_at IS NOT NULL AS changed FROM users WHERE id = ?",
      [users.alice.id],
    );
    assert.equal(Number(changedRows[0].changed), 1);
    done("password reset: hashed single-use 30-minute links, newest link only, expiry, audit, earlier sessions ended");

    // 5. Assignment -------------------------------------------------------
    const project = expectStatus(
      await api("/projects", { method: "POST", token: tokens.alice, body: { name: fixture.projectName, description: "m3 live" } }),
      201,
      "create project",
    ).data;
    for (const role of ["bob", "carol", "dave"]) {
      const added = await api(`/projects/${project.id}/members`, {
        method: "POST", token: tokens.alice, body: { userId: users[role].id },
      });
      assert.ok([200, 201].includes(added.status), `add ${role}: ${added.status}`);
    }
    const task = expectStatus(
      await api(`/projects/${project.id}/tasks`, { method: "POST", token: tokens.alice, body: { title: `M3 live task ${fixture.runId}` } }),
      201,
      "create task",
    ).data;
    const assign = (token, assignedTo) =>
      api(`/tasks/${task.id}/assignment`, { method: "PATCH", token, body: { assigned_to: assignedTo } });
    const notificationsFor = async (role) =>
      (await api("/notifications?page=1&limit=50", { token: tokens[role] })).body.data;

    expectStatus(await assign(tokens.alice, Number(users.bob.id)), 200, "assign bob");
    let [assignedRow] = await pool.execute("SELECT assigned_to FROM tasks WHERE id = ?", [task.id]);
    assert.equal(String(assignedRow[0].assigned_to), users.bob.id);
    const bobNotes = await notificationsFor("bob");
    assert.ok(bobNotes.some((note) => note.type === "TASK_ASSIGNED"));

    expectStatus(await assign(tokens.dave, Number(users.carol.id)), 403, "unrelated member cannot assign");
    expectStatus(await assign(tokens.alice, Number(users.admin.id)), 400, "assignee outside project");
    expectStatus(await assign(tokens.alice, 999999999), 404, "unknown assignee");
    expectStatus(await assign(tokens.alice, Number(users.carol.id)), 200, "reassign to carol");
    assert.ok((await notificationsFor("carol")).some((note) => note.type === "TASK_ASSIGNED"));
    assert.ok((await notificationsFor("bob")).some((note) => note.type === "TASK_UNASSIGNED"));
    const unchanged = await assign(tokens.alice, Number(users.carol.id));
    expectStatus(unchanged, 200, "same assignee");
    assert.equal((await notificationsFor("carol")).filter((note) => note.type === "TASK_ASSIGNED").length, 1);
    expectStatus(await assign(tokens.carol, null), 200, "assignee removes assignment");
    [assignedRow] = await pool.execute("SELECT assigned_to FROM tasks WHERE id = ?", [task.id]);
    assert.equal(assignedRow[0].assigned_to, null);
    const activity = await api(`/projects/${project.id}/activity?page=1&limit=50`, { token: tokens.alice });
    assert.ok(JSON.stringify(activity.body).includes("TASK_ASSIGNED"));
    expectStatus(
      await api(`/projects/${project.id}/archive`, { method: "POST", token: tokens.alice }),
      200,
      "archive project",
    );
    expectStatus(await assign(tokens.alice, Number(users.bob.id)), 409, "archived project rejects assignment");
    done("assignment: permissions, membership, notifications, history, archived project");

    // 6. Rate limiting ----------------------------------------------------
    let blockedAt = null;
    for (let attempt = 1; attempt <= 12; attempt += 1) {
      const response = await limitedApi("/auth/login", {
        method: "POST", body: { email: `ratelimit-${fixture.runId}@example.invalid`, password: "Whatever123" },
      });
      if (response.status === 429) { blockedAt = attempt; break; }
      assert.equal(response.status, 401);
    }
    assert.equal(blockedAt, 11, "the 11th login in a minute is rejected");
    let resetBlockedAt = null;
    for (let attempt = 1; attempt <= 12; attempt += 1) {
      const response = await limitedApi("/auth/forgot-password", {
        method: "POST", body: { email: `ratelimit-${fixture.runId}@example.invalid` },
      });
      if (response.status === 429) { resetBlockedAt = attempt; break; }
    }
    assert.equal(resetBlockedAt, 11);
    done("rate limiting: 11th login and 11th reset request in a minute return 429");

    // 7. Audit hygiene ----------------------------------------------------
    const [secretRows] = await pool.execute(
      `SELECT COUNT(*) AS found FROM audit_logs
       WHERE details LIKE ? OR details LIKE ? OR details LIKE ? OR details LIKE ?`,
      [`%${fixture.password}%`, `%${fixture.newPassword}%`, `%${firstToken}%`, `%${secondToken}%`],
    );
    assert.equal(Number(secretRows[0].found), 0, "no passwords or reset tokens in audit logs");
    done("audit logs contain no passwords or reset tokens");

    return { checks };
  } finally {
    console.info = originalInfo;
    await new Promise((resolve) => flow.server.close(resolve));
    await new Promise((resolve) => limited.server.close(resolve));
  }
}

async function cleanup(pool, fixture) {
  const emails = Object.values(fixture.emails);
  const connection = await pool.getConnection();
  try {
    await connection.query("SET FOREIGN_KEY_CHECKS = 0");
    const [userRows] = await connection.query(
      `SELECT id FROM users WHERE email IN (${emails.map(() => "?").join(",")})`,
      emails,
    );
    const userIds = userRows.map((row) => row.id);
    const [projectRows] = await connection.query(
      "SELECT id FROM projects WHERE name = ?",
      [fixture.projectName],
    );
    const projectIds = projectRows.map((row) => row.id);
    const marks = (values) => values.map(() => "?").join(",");
    if (projectIds.length) {
      await connection.query(`DELETE FROM comments WHERE task_id IN (SELECT id FROM tasks WHERE project_id IN (${marks(projectIds)}))`, projectIds);
      await connection.query(`DELETE FROM tasks WHERE project_id IN (${marks(projectIds)})`, projectIds);
      await connection.query(`DELETE FROM project_members WHERE project_id IN (${marks(projectIds)})`, projectIds);
      await connection.query(`DELETE FROM audit_logs WHERE project_id IN (${marks(projectIds)})`, projectIds);
      await connection.query(`DELETE FROM projects WHERE id IN (${marks(projectIds)})`, projectIds);
    }
    if (userIds.length) {
      await connection.query(`DELETE FROM notifications WHERE user_id IN (${marks(userIds)})`, userIds);
      await connection.query(`DELETE FROM password_reset_tokens WHERE user_id IN (${marks(userIds)})`, userIds);
      await connection.query(`DELETE FROM audit_logs WHERE user_id IN (${marks(userIds)})`, userIds);
      await connection.query(`DELETE FROM users WHERE id IN (${marks(userIds)})`, userIds);
    }
    await connection.query("SET FOREIGN_KEY_CHECKS = 1");
    const [left] = await connection.query(
      `SELECT COUNT(*) AS left_over FROM users WHERE email IN (${emails.map(() => "?").join(",")})`,
      emails,
    );
    assert.equal(Number(left[0].left_over), 0, "test users removed");
    return { removedUsers: userIds.length, removedProjects: projectIds.length };
  } finally {
    connection.release();
  }
}

async function main() {
  const config = getConfig();
  requireExplicitOptIn(config);
  const pool = createPool(config.db);
  const fixture = makeFixture(crypto.randomUUID());
  let result;
  let failure;
  try {
    await assertDatabaseReady(pool, config.db.database);
    result = await runChecks(pool, config, fixture);
  } catch (error) {
    failure = error;
  } finally {
    try {
      console.info(JSON.stringify({ cleanup: "verified", ...(await cleanup(pool, fixture)) }));
    } catch (error) {
      console.error(`CRITICAL: cleanup failed: ${error.message}`);
      process.exitCode = 1;
    }
    await pool.end();
  }
  if (failure) {
    console.error(`Member 3 MySQL integration test failed: ${failure.message}`);
    process.exitCode = 1;
    return;
  }
  console.info(JSON.stringify({ result: "passed", ...result }));
}

if (require.main === module) {
  main();
}
