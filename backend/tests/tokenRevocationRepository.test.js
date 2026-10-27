"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { TokenRevocationRepository } = require("../src/repositories/tokenRevocationRepository");

test("revocation removes expired entries and stores a parameterized token record", async () => {
  const calls = [];
  const repository = new TokenRevocationRepository({
    execute: async (sql, params = []) => {
      calls.push({ sql, params });
      return [{ affectedRows: 1 }];
    },
  });
  const expiresAt = new Date("2026-10-27T10:00:00.000Z");

  await repository.revoke({
    tokenId: "token-jti",
    userId: "42",
    expiresAt,
  });

  assert.match(calls[0].sql, /DELETE FROM revoked_tokens/);
  assert.match(calls[0].sql, /expires_at <= UTC_TIMESTAMP/);
  assert.match(calls[1].sql, /INSERT INTO revoked_tokens/);
  assert.deepEqual(calls[1].params, ["token-jti", "42", expiresAt]);
});

test("revocation lookup considers only unexpired tokens", async () => {
  const calls = [];
  const repository = new TokenRevocationRepository({
    execute: async (sql, params = []) => {
      calls.push({ sql, params });
      return [[{ 1: 1 }]];
    },
  });

  assert.equal(await repository.isRevoked("token-jti"), true);
  assert.match(calls[0].sql, /expires_at > UTC_TIMESTAMP/);
  assert.deepEqual(calls[0].params, ["token-jti"]);
});
