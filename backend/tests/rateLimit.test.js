const assert = require("node:assert/strict");
const test = require("node:test");
const request = require("supertest");
const { createApp } = require("../src/app");

const pass = (_req, _res, next) => next();

function setup(authRateLimit) {
  const authService = {
    login: async () => ({ accessToken: "t", user: { id: "1" } }),
  };
  const passwordResetService = {
    requestReset: async () => {},
    resetPassword: async () => {},
  };
  return createApp({ authService, passwordResetService, requireAuth: pass, authRateLimit });
}

const login = (app) =>
  request(app).post("/api/v1/auth/login").send({ email: "a@x.co", password: "Passw0rd1" });

test("the 11th login request in a minute returns 429 in the contract error format", async () => {
  const app = setup();
  for (let attempt = 1; attempt <= 10; attempt += 1) {
    const response = await login(app);
    assert.equal(response.status, 200, `attempt ${attempt}`);
  }
  const blocked = await login(app);
  assert.equal(blocked.status, 429);
  assert.equal(blocked.body.error.code, "TOO_MANY_REQUESTS");
  assert.ok(blocked.headers["ratelimit"] || blocked.headers["ratelimit-policy"]);
});

test("forgot-password and reset-password share one limit, separate from login", async () => {
  const app = setup();
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const forgot = await request(app).post("/api/v1/auth/forgot-password").send({ email: "a@x.co" });
    assert.equal(forgot.status, 202);
    const reset = await request(app)
      .post("/api/v1/auth/reset-password")
      .send({ token: "t", newPassword: "Passw0rd1" });
    assert.equal(reset.status, 200);
  }
  const forgotBlocked = await request(app).post("/api/v1/auth/forgot-password").send({ email: "a@x.co" });
  assert.equal(forgotBlocked.status, 429);
  const resetBlocked = await request(app)
    .post("/api/v1/auth/reset-password")
    .send({ token: "t", newPassword: "Passw0rd1" });
  assert.equal(resetBlocked.status, 429);

  const stillFine = await login(app);
  assert.equal(stillFine.status, 200);
});

test("the limit is configurable and other routes are not limited", async () => {
  const app = setup({ windowMs: 60000, limit: 2 });
  assert.equal((await login(app)).status, 200);
  assert.equal((await login(app)).status, 200);
  assert.equal((await login(app)).status, 429);
  for (let i = 0; i < 15; i += 1) {
    const health = await request(app).get("/health");
    assert.equal(health.status, 200);
  }
});

test("limiting can be switched off explicitly for tests", async () => {
  const app = setup(false);
  for (let attempt = 1; attempt <= 15; attempt += 1) {
    assert.equal((await login(app)).status, 200);
  }
});
