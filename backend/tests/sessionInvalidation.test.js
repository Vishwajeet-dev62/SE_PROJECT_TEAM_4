const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const jwt = require("jsonwebtoken");
const { createRequireAuth } = require("../src/middleware/requireAuth");
const { PasswordResetRepository } = require("../src/repositories/passwordResetRepository");
const { UserRepository } = require("../src/repositories/userRepository");
const { MIGRATION_DEPENDENCIES } = require("../scripts/migrate");

const SECRET = "test-secret-that-is-at-least-32-characters-long";
const nowSeconds = () => Math.floor(Date.now() / 1000);

function authWith(user) {
  return createRequireAuth({
    jwtSecret: SECRET,
    userRepository: { findById: async () => user },
    tokenRevocationRepository: { isRevoked: async () => false },
  });
}

function tokenIssuedAt(iat, { withTimestamp = true } = {}) {
  return jwt.sign(withTimestamp ? { iat } : {}, SECRET, {
    algorithm: "HS256",
    subject: "7",
    jwtid: `jti-${iat}-${withTimestamp}`,
    expiresIn: "30m",
    noTimestamp: !withTimestamp,
  });
}

async function authenticate(requireAuth, token) {
  const req = { headers: { authorization: `Bearer ${token}` } };
  const error = await new Promise((resolve) => requireAuth(req, {}, resolve));
  return { req, error };
}

const activeUser = (extra = {}) => ({ id: "7", role: "MEMBER", active: true, ...extra });

test("a token issued before a password change is rejected", async () => {
  const changedAt = nowSeconds();
  const requireAuth = authWith(activeUser({ passwordChangedEpoch: changedAt }));
  const { error } = await authenticate(requireAuth, tokenIssuedAt(changedAt - 60));
  assert.equal(error.status, 401);
  assert.equal(error.code, "SESSION_REVOKED");
});

test("tokens issued at or after the password change are accepted", async () => {
  const changedAt = nowSeconds() - 30;
  const requireAuth = authWith(activeUser({ passwordChangedEpoch: changedAt }));
  for (const iat of [changedAt, changedAt + 5]) {
    const { req, error } = await authenticate(requireAuth, tokenIssuedAt(iat));
    assert.equal(error, undefined, `iat offset ${iat - changedAt}`);
    assert.equal(req.user.id, "7");
  }
});

test("users who never changed their password are unaffected", async () => {
  for (const value of [null, undefined]) {
    const requireAuth = authWith(activeUser({ passwordChangedEpoch: value }));
    const { error } = await authenticate(requireAuth, tokenIssuedAt(nowSeconds() - 600));
    assert.equal(error, undefined);
  }
});

test("a token without an issue time cannot outlive a password change", async () => {
  const requireAuth = authWith(activeUser({ passwordChangedEpoch: nowSeconds() - 10 }));
  const { error } = await authenticate(requireAuth, tokenIssuedAt(0, { withTimestamp: false }));
  assert.equal(error.code, "SESSION_REVOKED");
});

test("a password reset records the change time in the same transaction", async () => {
  const statements = [];
  const connection = {
    beginTransaction: async () => {},
    commit: async () => {},
    rollback: async () => {},
    release: () => {},
    execute: async (sql) => {
      statements.push(sql.replace(/\s+/g, " ").trim());
      return sql.includes("SELECT id, user_id") ? [[{ id: 1, user_id: 7 }]] : [{ affectedRows: 1 }];
    },
  };
  await new PasswordResetRepository({ getConnection: async () => connection })
    .consumeAndSetPassword({ tokenHash: "h", passwordHash: "p" });
  const update = statements.find((sql) => sql.startsWith("UPDATE users"));
  assert.match(update, /password_changed_at = UTC_TIMESTAMP\(3\)/);
});

test("user lookups return the password change time as epoch seconds", async () => {
  const seen = [];
  const row = {
    id: 7, name: "A", email: "a@x.co", password_hash: "h", role: "MEMBER",
    active: 1, failed_attempts: 0, locked_until: null,
    password_changed_epoch: "1790000000", created_at: "t", updated_at: "t",
  };
  const repository = new UserRepository({
    execute: async (sql) => { seen.push(sql.replace(/\s+/g, " ")); return [[row]]; },
  });
  assert.equal((await repository.findById("7")).passwordChangedEpoch, 1790000000);
  assert.equal((await repository.findByEmail("a@x.co")).passwordChangedEpoch, 1790000000);
  assert.ok(seen.every((sql) => /TIMESTAMPDIFF\( SECOND, '1970-01-01 00:00:00', password_changed_at \) AS password_changed_epoch/.test(sql)));

  const never = new UserRepository({ execute: async () => [[{ ...row, password_changed_epoch: null }]] });
  assert.equal((await never.findById("7")).passwordChangedEpoch, null);
});

test("migration 016 adds a nullable password_changed_at column to users", () => {
  const migration = fs.readFileSync(
    path.join(__dirname, "..", "migrations", "016_add_password_changed_at.sql"),
    "utf8",
  );
  assert.match(migration, /ALTER TABLE users/);
  assert.match(migration, /ADD COLUMN password_changed_at DATETIME\(3\) NULL/);
  assert.deepEqual(MIGRATION_DEPENDENCIES["016_add_password_changed_at.sql"], ["users"]);
});
