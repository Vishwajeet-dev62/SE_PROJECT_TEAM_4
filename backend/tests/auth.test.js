const assert = require("node:assert/strict");
const test = require("node:test");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const request = require("supertest");
const { createApp } = require("../src/app");
const { ApiError } = require("../src/errors/apiError");
const { createRequireAuth } = require("../src/middleware/requireAuth");
const { AuthService } = require("../src/services/authService");
const { validateRegister } = require("../src/validators/authValidators");

const SECRET = "test-secret-that-is-at-least-32-characters-long";

function createFakeRepository() {
  const users = [];
  return {
    users,
    create: async ({ name, email, passwordHash }) => {
      if (users.some((user) => user.email === email)) {
        throw new ApiError(409, "EMAIL_EXISTS", "An account with this email already exists");
      }
      const user = {
        id: String(users.length + 1),
        name,
        email,
        passwordHash,
        role: "MEMBER",
        active: true,
        failedAttempts: 0,
        lockedUntil: null,
        createdAt: "2026-10-23 10:00:00.000",
      };
      users.push(user);
      return user;
    },
    findByEmail: async (email) => users.find((user) => user.email === email) || null,
    findById: async (id) => users.find((user) => user.id === id) || null,
  };
}

function createTestApp() {
  const userRepository = createFakeRepository();
  const revokedTokens = new Set();
  const tokenRevocationRepository = {
    revoke: async ({ tokenId }) => revokedTokens.add(tokenId),
    isRevoked: async (tokenId) => revokedTokens.has(tokenId),
  };
  const authService = new AuthService({
    userRepository,
    tokenRevocationRepository,
    jwtSecret: SECRET,
    jwtExpiresIn: "30m",
    bcryptCost: 4, // fast for tests; production default is 12
  });
  const requireAuth = createRequireAuth({
    jwtSecret: SECRET,
    userRepository,
    tokenRevocationRepository,
  });
  return {
    app: createApp({ authService, requireAuth }),
    revokedTokens,
    userRepository,
  };
}

const validBody = { name: "Anjali", email: "Anjali@Example.com", password: "Passw0rdOK" };

test("register creates an account, normalizes email and never returns the hash", async () => {
  const { app, userRepository } = createTestApp();
  const response = await request(app).post("/api/v1/auth/register").send(validBody);

  assert.equal(response.status, 201);
  assert.equal(response.body.data.user.email, "anjali@example.com");
  assert.equal(response.body.data.user.role, "MEMBER");
  assert.equal(response.body.data.user.passwordHash, undefined);
  assert.equal(response.body.data.user.password_hash, undefined);
  assert.notEqual(userRepository.users[0].passwordHash, validBody.password);
  assert.equal(await bcrypt.compare(validBody.password, userRepository.users[0].passwordHash), true);
});

test("register rejects duplicate emails with 409 regardless of case", async () => {
  const { app } = createTestApp();
  await request(app).post("/api/v1/auth/register").send(validBody);
  const response = await request(app)
    .post("/api/v1/auth/register")
    .send({ ...validBody, email: "ANJALI@example.com" });

  assert.equal(response.status, 409);
  assert.equal(response.body.error.code, "EMAIL_EXISTS");
});

test("register validates name, email and password policy", async () => {
  const { app } = createTestApp();
  const cases = [
    [{ ...validBody, name: "  " }, "name"],
    [{ ...validBody, email: "not-an-email" }, "email"],
    [{ ...validBody, password: "short1" }, "password"],
    [{ ...validBody, password: "onlyletters" }, "password"],
    [{ ...validBody, password: "12345678" }, "password"],
    [{ ...validBody, password: "a1".repeat(40) }, "password"],
  ];
  for (const [body, field] of cases) {
    const response = await request(app).post("/api/v1/auth/register").send(body);
    assert.equal(response.status, 400, JSON.stringify(body));
    assert.equal(response.body.error.code, "VALIDATION_ERROR");
    assert.ok(response.body.error.details[field]);
  }
  assert.throws(() => validateRegister({ ...validBody, role: "ADMIN" }), /unsupported fields/);
});

test("login returns a signed JWT with subject, role, expiry and unique id", async () => {
  const { app } = createTestApp();
  await request(app).post("/api/v1/auth/register").send(validBody);
  const first = await request(app)
    .post("/api/v1/auth/login")
    .send({ email: "anjali@example.com", password: validBody.password });
  const second = await request(app)
    .post("/api/v1/auth/login")
    .send({ email: "ANJALI@example.com", password: validBody.password });

  assert.equal(first.status, 200);
  const claims = jwt.verify(first.body.data.accessToken, SECRET, { algorithms: ["HS256"] });
  assert.equal(claims.sub, "1");
  assert.equal(claims.role, "MEMBER");
  assert.equal(claims.exp - claims.iat, 30 * 60);
  assert.ok(claims.jti);
  assert.notEqual(
    claims.jti,
    jwt.decode(second.body.data.accessToken).jti,
  );
  assert.equal(first.body.data.user.passwordHash, undefined);
});

test("login failures share one generic 401 for unknown, wrong password and inactive", async () => {
  const { app, userRepository } = createTestApp();
  await request(app).post("/api/v1/auth/register").send(validBody);
  userRepository.users.push({
    ...userRepository.users[0],
    id: "2",
    email: "off@example.com",
    active: false,
  });

  const attempts = [
    { email: "nobody@example.com", password: validBody.password },
    { email: "anjali@example.com", password: "WrongPass1" },
    { email: "off@example.com", password: validBody.password },
  ];
  const bodies = [];
  for (const attempt of attempts) {
    const response = await request(app).post("/api/v1/auth/login").send(attempt);
    assert.equal(response.status, 401);
    assert.equal(response.body.error.code, "INVALID_CREDENTIALS");
    bodies.push(response.body);
  }
  assert.deepEqual(bodies[0], bodies[1]);
  assert.deepEqual(bodies[1], bodies[2]);
});

test("login requires email and password", async () => {
  const { app } = createTestApp();
  const response = await request(app).post("/api/v1/auth/login").send({ email: "a@b.co" });
  assert.equal(response.status, 400);
  assert.equal(response.body.error.code, "VALIDATION_ERROR");
});

test("authenticated user can retrieve the current public account", async () => {
  const { app } = createTestApp();
  await request(app).post("/api/v1/auth/register").send(validBody);
  const login = await request(app)
    .post("/api/v1/auth/login")
    .send({ email: validBody.email, password: validBody.password });

  const response = await request(app)
    .get("/api/v1/auth/me")
    .set("Authorization", `Bearer ${login.body.data.accessToken}`);

  assert.equal(response.status, 200);
  assert.deepEqual(response.body.data.user, {
    id: "1",
    name: "Anjali",
    email: "anjali@example.com",
    role: "MEMBER",
    createdAt: "2026-10-23 10:00:00.000",
  });
});

test("logout revokes the access token and repeated use is rejected", async () => {
  const { app, revokedTokens } = createTestApp();
  await request(app).post("/api/v1/auth/register").send(validBody);
  const login = await request(app)
    .post("/api/v1/auth/login")
    .send({ email: validBody.email, password: validBody.password });
  const accessToken = login.body.data.accessToken;

  const logout = await request(app)
    .post("/api/v1/auth/logout")
    .set("Authorization", `Bearer ${accessToken}`);
  assert.equal(logout.status, 204);
  assert.equal(revokedTokens.size, 1);

  const afterLogout = await request(app)
    .get("/api/v1/auth/me")
    .set("Authorization", `Bearer ${accessToken}`);
  assert.equal(afterLogout.status, 401);
  assert.equal(afterLogout.body.error.code, "SESSION_REVOKED");
});

test("AuthService refuses to start without a strong JWT secret", () => {
  assert.throws(
    () => new AuthService({ userRepository: {}, jwtSecret: "short" }),
    /JWT_SECRET/,
  );
  assert.throws(() => new AuthService({ userRepository: {} }), /JWT_SECRET/);
});
