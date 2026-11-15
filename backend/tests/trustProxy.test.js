const assert = require("node:assert/strict");
const test = require("node:test");
const request = require("supertest");
const { createApp } = require("../src/app");
const { getConfig } = require("../src/config/env");

const baseEnv = { DB_USER: "u", DB_NAME: "task_manager_test", JWT_SECRET: "x".repeat(40) };

test("TRUST_PROXY defaults to 0 and accepts a hop count", () => {
  assert.equal(getConfig({ ...baseEnv }).trustProxy, 0);
  assert.equal(getConfig({ ...baseEnv, TRUST_PROXY: "1" }).trustProxy, 1);
  for (const bad of ["abc", "-1", "11", "1.5"]) {
    assert.throws(() => getConfig({ ...baseEnv, TRUST_PROXY: bad }), /TRUST_PROXY/, bad);
  }
});

const authService = { login: async () => ({ accessToken: "t", user: { id: "1" } }) };
const login = (app, headers = {}) =>
  request(app).post("/api/v1/auth/login").set(headers).send({ email: "a@x.co", password: "Passw0rd1" });

test("behind a trusted proxy the rate limit counts each forwarded client separately", async () => {
  const app = createApp({
    authService, requireAuth: (_q, _s, n) => n(),
    authRateLimit: { windowMs: 60000, limit: 1 }, trustProxy: 1,
  });
  assert.equal((await login(app, { "X-Forwarded-For": "203.0.113.5" })).status, 200);
  assert.equal((await login(app, { "X-Forwarded-For": "203.0.113.6" })).status, 200);
  assert.equal((await login(app, { "X-Forwarded-For": "203.0.113.5" })).status, 429);
});

test("without a proxy every request shares the connection address", async () => {
  const app = createApp({
    authService, requireAuth: (_q, _s, n) => n(),
    authRateLimit: { windowMs: 60000, limit: 1 },
  });
  assert.equal((await login(app)).status, 200);
  assert.equal((await login(app)).status, 429);
});
