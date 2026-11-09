"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const bcrypt = require("bcryptjs");
const { AuditLogRepository } = require("../src/repositories/auditLogRepository");
const { requireRole } = require("../src/middleware/requireRole");
const { AuthService } = require("../src/services/authService");
const { AUDIT_EVENTS, createAuditLog } = require("../src/services/auditLog");

const SECRET = "test-secret-that-is-at-least-32-characters-long";

function runMiddleware(middleware, req) {
  return new Promise((resolve) => {
    middleware(req, {}, (error) => resolve(error));
  });
}

test("requireRole allows a matching role and rejects others with 403", async () => {
  const adminOnly = requireRole("ADMIN");

  assert.equal(await runMiddleware(adminOnly, { user: { id: 1, role: "ADMIN" } }), undefined);

  const denied = await runMiddleware(adminOnly, { user: { id: 2, role: "MEMBER" } });
  assert.equal(denied.status, 403);
  assert.equal(denied.code, "FORBIDDEN");

  const either = requireRole("ADMIN", "MEMBER");
  assert.equal(await runMiddleware(either, { user: { id: 2, role: "MEMBER" } }), undefined);
});

test("requireRole returns 401 when no authenticated user is attached", async () => {
  const error = await runMiddleware(requireRole("ADMIN"), {});
  assert.equal(error.status, 401);
  assert.equal(error.code, "UNAUTHENTICATED");
});

test("requireRole rejects missing or unknown role names at setup time", () => {
  assert.throws(() => requireRole(), /ADMIN, MEMBER/);
  assert.throws(() => requireRole("SUPERUSER"), /ADMIN, MEMBER/);
});

test("AuditLogRepository uses a parameterized insert", async () => {
  const calls = [];
  const pool = { execute: async (sql, values) => { calls.push({ sql, values }); return [{}]; } };

  await new AuditLogRepository(pool).record({
    userId: "7",
    eventType: "LOGIN_FAILED",
    ipAddress: "10.0.0.1",
    details: { reason: "bad_password" },
  });

  assert.match(calls[0].sql, /INSERT INTO audit_logs/);
  assert.match(calls[0].sql, /VALUES \(\?, \?, \?, \?\)/);
  assert.deepEqual(calls[0].values, [
    "7",
    "LOGIN_FAILED",
    "10.0.0.1",
    JSON.stringify({ reason: "bad_password" }),
  ]);
});

test("auditLog strips sensitive detail keys and caps the IP length", async () => {
  const recorded = [];
  const auditLog = createAuditLog({ record: async (entry) => recorded.push(entry) });

  await auditLog({
    userId: "3",
    eventType: AUDIT_EVENTS.ROLE_CHANGED,
    ip: "x".repeat(80),
    details: { newRole: "ADMIN", password: "hunter2", refreshToken: "abc", passwordHash: "h" },
  });

  assert.deepEqual(recorded[0].details, { newRole: "ADMIN" });
  assert.equal(recorded[0].ipAddress.length, 45);
});

test("auditLog rejects unknown event types", async () => {
  const auditLog = createAuditLog({ record: async () => {} });
  await assert.rejects(auditLog({ eventType: "MADE_UP" }), /Unknown audit event type/);
});

test("auditLog failures are reported without details and do not throw", async () => {
  const errors = [];
  const auditLog = createAuditLog(
    { record: async () => { throw new Error("db down: secret-connection-string"); } },
    { error: (message) => errors.push(message) },
  );

  await auditLog({ eventType: AUDIT_EVENTS.LOGOUT, userId: "1", details: { reason: "x" } });

  assert.equal(errors.length, 1);
  assert.ok(!errors[0].includes("secret-connection-string"));
  assert.match(errors[0], /Failed to write audit log/);
});

function createAuthHarness() {
  const events = [];
  const users = [];
  const userRepository = {
    users,
    create: async ({ name, email, passwordHash }) => {
      const user = {
        id: String(users.length + 1),
        name,
        email,
        passwordHash,
        role: "MEMBER",
        active: true,
        failedAttempts: 0,
        lockedUntil: null,
        createdAt: "2026-10-31 10:00:00.000",
      };
      users.push(user);
      return user;
    },
    findByEmail: async (email) => users.find((user) => user.email === email) || null,
    findById: async (id) => users.find((user) => user.id === id) || null,
    recordFailedLogin: async (id, maxAttempts = 5, lockoutMinutes = 15) => {
      const user = users.find((item) => item.id === id);
      user.failedAttempts += 1;
      if (user.failedAttempts >= maxAttempts) {
        user.lockedUntil = new Date(Date.now() + lockoutMinutes * 60000).toISOString();
      }
    },
    resetFailedLogins: async () => {},
  };
  const service = new AuthService({
    userRepository,
    tokenRevocationRepository: { revoke: async () => {}, isRevoked: async () => false },
    jwtSecret: SECRET,
    bcryptCost: 4,
    auditLog: async (entry) => { events.push(entry); },
  });
  return { service, events, users };
}

const credentials = { email: "a@example.com", password: "Passw0rdOK" };

test("registration, login and logout are audited with user and IP", async () => {
  const { service, events } = createAuthHarness();
  const ctx = { ip: "10.1.1.1" };

  await service.register({ name: "A", ...credentials }, ctx);
  await service.login(credentials, ctx);
  await service.logout({ tokenId: "t", userId: "1", expiresAt: 2000000000, ip: ctx.ip });

  assert.deepEqual(
    events.map((event) => [event.eventType, event.userId, event.ip]),
    [
      [AUDIT_EVENTS.USER_REGISTERED, "1", "10.1.1.1"],
      [AUDIT_EVENTS.LOGIN_SUCCESS, "1", "10.1.1.1"],
      [AUDIT_EVENTS.LOGOUT, "1", "10.1.1.1"],
    ],
  );
});

test("failed logins are audited without the submitted email or password", async () => {
  const { service, events } = createAuthHarness();
  await service.register({ name: "A", ...credentials });
  events.length = 0;

  await assert.rejects(service.login({ email: "nobody@example.com", password: "Wrong1234" }, { ip: "1.2.3.4" }));
  await assert.rejects(service.login({ ...credentials, password: "Wrong1234" }, { ip: "1.2.3.4" }));

  assert.deepEqual(events.map((e) => [e.eventType, e.userId, e.details.reason]), [
    [AUDIT_EVENTS.LOGIN_FAILED, null, "unknown_user"],
    [AUDIT_EVENTS.LOGIN_FAILED, "1", "bad_password"],
  ]);
  const serialized = JSON.stringify(events);
  assert.ok(!serialized.includes("nobody@example.com"));
  assert.ok(!serialized.includes("Wrong1234"));
});

test("the fifth failure records ACCOUNT_LOCKED and later attempts record account_locked", async () => {
  const { service, events } = createAuthHarness();
  await service.register({ name: "A", ...credentials });
  events.length = 0;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    await assert.rejects(service.login({ ...credentials, password: "Wrong1234" }));
  }
  const types = events.map((event) => event.eventType);
  assert.equal(types.filter((type) => type === AUDIT_EVENTS.ACCOUNT_LOCKED).length, 1);
  assert.equal(types[types.length - 1], AUDIT_EVENTS.ACCOUNT_LOCKED);

  events.length = 0;
  await assert.rejects(service.login(credentials));
  assert.deepEqual(events.map((e) => [e.eventType, e.details.reason]), [
    [AUDIT_EVENTS.LOGIN_FAILED, "account_locked"],
  ]);
});

test("a correct password is still checked against the stored hash", async () => {
  const { service, users } = createAuthHarness();
  await service.register({ name: "A", ...credentials });
  assert.equal(await bcrypt.compare(credentials.password, users[0].passwordHash), true);
});
