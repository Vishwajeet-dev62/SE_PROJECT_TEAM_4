
const assert = require("node:assert/strict");
const test = require("node:test");
const jwt = require("jsonwebtoken");
const { createRequireAuth } = require("../src/middleware/requireAuth");

const SECRET = "test-secret-that-is-at-least-32-characters-long";

function createRequest(token) {
  return {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  };
}

function createResponse() {
  return {};
}

function createRepository(user) {
  return {
    findById: async (id) => (user && user.id === id ? user : null),
  };
}

function invokeMiddleware(middleware, req) {
  return new Promise((resolve, reject) => {
    middleware(req, createResponse(), (error) => {
      if (error) reject(error);
      else resolve(req);
    });
  });
}

function signToken(payload, options = {}) {
  return jwt.sign(payload, SECRET, {
    algorithm: "HS256",
    expiresIn: "5m",
    ...options,
  });
}

test("missing token is rejected", async () => {
  const middleware = createRequireAuth({
    jwtSecret: SECRET,
    userRepository: createRepository(null),
  });

  await assert.rejects(
    invokeMiddleware(middleware, createRequest()),
    (error) => error.status === 401,
  );
});

test("invalid token is rejected", async () => {
  const middleware = createRequireAuth({
    jwtSecret: SECRET,
    userRepository: createRepository(null),
  });

  await assert.rejects(
    invokeMiddleware(middleware, createRequest("not-a-valid-token")),
    (error) => error.status === 401 && error.code === "INVALID_TOKEN",
  );
});

test("expired token is rejected", async () => {
  const middleware = createRequireAuth({
    jwtSecret: SECRET,
    userRepository: createRepository(null),
  });

  const token = signToken(
    { sub: "1", role: "MEMBER" },
    { expiresIn: -1 },
  );

  await assert.rejects(
    invokeMiddleware(middleware, createRequest(token)),
    (error) => error.status === 401 && error.code === "INVALID_TOKEN",
  );
});

test("inactive user is rejected even with a valid token", async () => {
  const middleware = createRequireAuth({
    jwtSecret: SECRET,
    userRepository: createRepository({
      id: "1",
      role: "MEMBER",
      active: false,
    }),
  });

  const token = signToken({ sub: "1", role: "MEMBER" });

  await assert.rejects(
    invokeMiddleware(middleware, createRequest(token)),
    (error) => error.status === 401,
  );
});

test("valid token uses the user's current database role", async () => {
  const middleware = createRequireAuth({
    jwtSecret: SECRET,
    userRepository: createRepository({
      id: "1",
      role: "ADMIN",
      active: true,
    }),
  });

  // The token says MEMBER, but the current database role is ADMIN.
  const token = signToken({ sub: "1", role: "MEMBER" });

  const req = await invokeMiddleware(middleware, createRequest(token));

  assert.deepEqual(req.user, {
    id: "1",
    role: "ADMIN",
  });
});
