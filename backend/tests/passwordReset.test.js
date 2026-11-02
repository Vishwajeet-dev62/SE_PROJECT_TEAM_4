const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const test = require("node:test");
const bcrypt = require("bcryptjs");
const request = require("supertest");
const { createApp } = require("../src/app");
const { PasswordResetRepository } = require("../src/repositories/passwordResetRepository");
const { PasswordResetService } = require("../src/services/passwordResetService");
const {
  createDevEmailSender,
  createUnconfiguredEmailSender,
} = require("../src/services/emailSender");

const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");

function setup({ emailSender } = {}) {
  const users = [
    { id: "1", name: "Anjali", email: "anjali@x.co", active: true },
    { id: "2", name: "Off", email: "off@x.co", active: false },
  ];
  const sent = [];
  const events = [];
  const tokens = []; // { userId, tokenHash, used }
  const passwords = {};
  const passwordResetRepository = {
    createToken: async ({ userId, tokenHash, validMinutes }) => {
      tokens.forEach((row) => { if (row.userId === userId) row.used = true; });
      tokens.push({ userId, tokenHash, used: false, validMinutes });
    },
    consumeAndSetPassword: async ({ tokenHash, passwordHash }) => {
      const row = tokens.find((item) => item.tokenHash === tokenHash && !item.used);
      if (!row) return null;
      row.used = true;
      passwords[row.userId] = passwordHash;
      return { userId: row.userId };
    },
  };
  const logger = { info() {}, warn() {}, error: (message) => events.push({ logged: message }) };
  const passwordResetService = new PasswordResetService({
    passwordResetRepository,
    userRepository: { findByEmail: async (email) => users.find((u) => u.email === email) || null },
    emailSender: emailSender || { sendPasswordReset: async (mail) => { sent.push(mail); } },
    auditLog: async (event) => { events.push(event); },
    resetUrlBase: "http://app.test/reset-password",
    bcryptCost: 4,
    logger,
  });
  return { app: createApp({ passwordResetService }), sent, events, tokens, passwords };
}

const tokenFrom = (mail) => new URL(mail.resetUrl).searchParams.get("token");

test("forgot-password gives the same 202 answer for known, unknown and inactive emails", async () => {
  const { app, sent } = setup();
  const bodies = [];
  for (const email of ["anjali@x.co", "nobody@x.co", "off@x.co"]) {
    const response = await request(app).post("/api/v1/auth/forgot-password").send({ email });
    assert.equal(response.status, 202);
    bodies.push(response.body);
  }
  assert.deepEqual(bodies[0], bodies[1]);
  assert.deepEqual(bodies[1], bodies[2]);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, "anjali@x.co");
  assert.equal(sent[0].expiresInMinutes, 30);
});

test("only a hash of the reset token is stored, never the token itself", async () => {
  const { app, sent, tokens } = setup();
  await request(app).post("/api/v1/auth/forgot-password").send({ email: "anjali@x.co" });
  const token = tokenFrom(sent[0]);
  assert.match(token, /^[a-f0-9]{64}$/);
  assert.equal(tokens[0].tokenHash, sha256(token));
  assert.notEqual(tokens[0].tokenHash, token);
  assert.equal(tokens[0].validMinutes, 30);
});

test("a reset link sets the new password once and then stops working", async () => {
  const { app, sent, passwords } = setup();
  await request(app).post("/api/v1/auth/forgot-password").send({ email: "anjali@x.co" });
  const token = tokenFrom(sent[0]);

  const first = await request(app)
    .post("/api/v1/auth/reset-password")
    .send({ token, newPassword: "BrandNew123" });
  assert.equal(first.status, 200);
  assert.equal(await bcrypt.compare("BrandNew123", passwords["1"]), true);

  const second = await request(app)
    .post("/api/v1/auth/reset-password")
    .send({ token, newPassword: "AnotherOne456" });
  assert.equal(second.status, 400);
  assert.equal(second.body.error.code, "INVALID_RESET_TOKEN");
});

test("a newer reset request retires the earlier link", async () => {
  const { app, sent } = setup();
  await request(app).post("/api/v1/auth/forgot-password").send({ email: "anjali@x.co" });
  await request(app).post("/api/v1/auth/forgot-password").send({ email: "anjali@x.co" });
  const [older, newer] = sent.map(tokenFrom);

  const oldTry = await request(app)
    .post("/api/v1/auth/reset-password")
    .send({ token: older, newPassword: "BrandNew123" });
  assert.equal(oldTry.status, 400);
  const newTry = await request(app)
    .post("/api/v1/auth/reset-password")
    .send({ token: newer, newPassword: "BrandNew123" });
  assert.equal(newTry.status, 200);
});

test("unknown tokens and weak passwords are rejected", async () => {
  const { app } = setup();
  const unknown = await request(app)
    .post("/api/v1/auth/reset-password")
    .send({ token: "f".repeat(64), newPassword: "BrandNew123" });
  assert.equal(unknown.status, 400);
  assert.equal(unknown.body.error.code, "INVALID_RESET_TOKEN");

  const weak = await request(app)
    .post("/api/v1/auth/reset-password")
    .send({ token: "f".repeat(64), newPassword: "short" });
  assert.equal(weak.status, 400);
  assert.equal(weak.body.error.code, "VALIDATION_ERROR");
  assert.ok(weak.body.error.details.newPassword);

  const extra = await request(app)
    .post("/api/v1/auth/forgot-password")
    .send({ email: "anjali@x.co", role: "ADMIN" });
  assert.equal(extra.status, 400);
  const badEmail = await request(app).post("/api/v1/auth/forgot-password").send({ email: "nope" });
  assert.equal(badEmail.status, 400);
});

test("requests and completions are audited without tokens or passwords", async () => {
  const { app, sent, events } = setup();
  await request(app).post("/api/v1/auth/forgot-password").send({ email: "anjali@x.co" });
  await request(app).post("/api/v1/auth/forgot-password").send({ email: "nobody@x.co" });
  await request(app)
    .post("/api/v1/auth/reset-password")
    .send({ token: tokenFrom(sent[0]), newPassword: "BrandNew123" });

  assert.deepEqual(
    events.map((event) => [event.eventType, event.userId ?? null]),
    [
      ["PASSWORD_RESET_REQUESTED", "1"],
      ["PASSWORD_RESET_REQUESTED", null],
      ["PASSWORD_RESET_COMPLETED", "1"],
    ],
  );
  const serialized = JSON.stringify(events);
  assert.equal(serialized.includes(tokenFrom(sent[0])), false);
  assert.equal(serialized.includes("BrandNew123"), false);
  assert.equal(serialized.includes("anjali@x.co"), false);
});

test("an email delivery failure still returns 202 and never logs the link", async () => {
  const { app, events } = setup({
    emailSender: { sendPasswordReset: async () => { throw new Error("smtp down"); } },
  });
  const response = await request(app)
    .post("/api/v1/auth/forgot-password")
    .send({ email: "anjali@x.co" });
  assert.equal(response.status, 202);
  const logged = events.filter((event) => event.logged);
  assert.equal(logged.length, 1);
  assert.equal(logged[0].logged, "Password reset email could not be sent");
});

test("the production fallback sender never prints the reset link", async () => {
  const lines = [];
  const logger = { info: (m) => lines.push(m), warn: (m) => lines.push(m) };
  await createUnconfiguredEmailSender(logger).sendPasswordReset({
    to: "a@x.co",
    resetUrl: "http://app.test/reset-password?token=secret",
  });
  assert.equal(lines.some((line) => line.includes("secret")), false);

  await createDevEmailSender(logger).sendPasswordReset({
    to: "a@x.co",
    resetUrl: "http://app.test/reset-password?token=secret",
  });
  assert.equal(lines.some((line) => line.includes("[DEV EMAIL]")), true);
});

test("repository SQL enforces single use, expiry and an atomic password change", async () => {
  const calls = [];
  const connection = {
    beginTransaction: async () => calls.push(["begin"]),
    commit: async () => calls.push(["commit"]),
    rollback: async () => calls.push(["rollback"]),
    release: () => calls.push(["release"]),
    execute: async (sql, params) => {
      calls.push(["sql", sql.replace(/\s+/g, " ").trim(), params]);
      if (sql.includes("SELECT id, user_id")) {
        return [[{ id: 7, user_id: 3 }]];
      }
      return [{ affectedRows: 1 }];
    },
  };
  const repository = new PasswordResetRepository({ getConnection: async () => connection });
  const result = await repository.consumeAndSetPassword({ tokenHash: "h", passwordHash: "p" });

  assert.deepEqual(result, { userId: "3" });
  const sqlText = calls.filter((c) => c[0] === "sql").map((c) => c[1]).join(" | ");
  assert.match(sqlText, /used_at IS NULL/);
  assert.match(sqlText, /expires_at > UTC_TIMESTAMP\(3\)/);
  assert.match(sqlText, /FOR UPDATE/);
  assert.match(sqlText, /failed_attempts = 0, locked_until = NULL/);
  assert.deepEqual(calls.map((c) => c[0]).filter((n) => n !== "sql"), ["begin", "commit", "release"]);

  const emptyCalls = [];
  const emptyConnection = {
    ...connection,
    rollback: async () => emptyCalls.push("rollback"),
    release: () => emptyCalls.push("release"),
    execute: async () => [[]],
  };
  const none = await new PasswordResetRepository({ getConnection: async () => emptyConnection })
    .consumeAndSetPassword({ tokenHash: "x", passwordHash: "p" });
  assert.equal(none, null);
  assert.deepEqual(emptyCalls, ["rollback", "release"]);

  const createCalls = [];
  const pool = { execute: async (sql, params) => { createCalls.push([sql.replace(/\s+/g, " "), params]); } };
  await new PasswordResetRepository(pool).createToken({ userId: "3", tokenHash: "h", validMinutes: 30 });
  assert.match(createCalls[0][0], /SET used_at = UTC_TIMESTAMP\(3\) WHERE user_id = \? AND used_at IS NULL/);
  assert.match(createCalls[1][0], /INTERVAL \? MINUTE/);
  assert.deepEqual(createCalls[1][1], ["3", "h", 30]);
});
