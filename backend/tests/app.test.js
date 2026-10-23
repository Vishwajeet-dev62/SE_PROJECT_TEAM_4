const assert = require("node:assert/strict");
const { after, before, test } = require("node:test");
const { once } = require("node:events");
const { createApp } = require("../src/app");
const { ApiError } = require("../src/errors/apiError");

let server;
let baseUrl;

const user = { id: "1", role: "MEMBER" };
const projectService = {
  listProjects: async () => ({
    data: [],
    pagination: { page: 1, limit: 20, total: 0 },
  }),
  createProject: async (input) => ({ id: "1", ownerId: user.id, ...input }),
};
const commentService = {
  list: async () => ({ data: [], pagination: { page: 1, limit: 20, total: 0 } }),
};

before(async () => {
  const app = createApp({
    projectService,
    commentService,
    requireAuth: (req, _res, next) => {
      req.user = user;
      next();
    },
  });
  server = app.listen(0);
  await once(server, "listening");
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});

test("health endpoint is live and adds a request identifier", async () => {
  const response = await fetch(`${baseUrl}/health`);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: "ok" });
  assert.match(response.headers.get("x-request-id"), /^[\da-f-]{36}$/i);
});

test("project collection uses the shared data and pagination envelope", async () => {
  const response = await fetch(`${baseUrl}/api/v1/projects`);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    data: [],
    pagination: { page: 1, limit: 20, total: 0 },
  });
});

test("project creation validates input before calling the service", async () => {
  const response = await fetch(`${baseUrl}/api/v1/projects`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "  " }),
  });

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    error: {
      code: "VALIDATION_ERROR",
      message: "Project name is required",
      details: { name: "This field cannot be empty" },
    },
  });
});

test("project creation returns 201 with normalized input", async () => {
  const response = await fetch(`${baseUrl}/api/v1/projects`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "  Sprint plan ", description: "  " }),
  });

  assert.equal(response.status, 201);
  assert.equal((await response.json()).data.name, "Sprint plan");
});

test("invalid JSON and oversized bodies use safe error responses", async () => {
  const invalid = await fetch(`${baseUrl}/api/v1/projects`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{",
  });
  assert.equal(invalid.status, 400);
  assert.equal((await invalid.json()).error.code, "INVALID_JSON");

  const oversized = await fetch(`${baseUrl}/api/v1/projects`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "x".repeat(40_000) }),
  });
  assert.equal(oversized.status, 413);
  assert.equal((await oversized.json()).error.code, "REQUEST_TOO_LARGE");
});

test("known API errors retain status and internal errors do not expose details", async () => {
  const app = createApp({
    projectService: {
      listProjects: async () => {
        throw new ApiError(403, "FORBIDDEN", "No project access");
      },
    },
    requireAuth: (req, _res, next) => {
      req.user = user;
      next();
    },
  });
  const tempServer = app.listen(0);
  await once(tempServer, "listening");
  const url = `http://127.0.0.1:${tempServer.address().port}/api/v1/projects`;

  try {
    const forbidden = await fetch(url);
    assert.equal(forbidden.status, 403);
    assert.equal((await forbidden.json()).error.code, "FORBIDDEN");
  } finally {
    await new Promise((resolve, reject) => {
      tempServer.close((error) => (error ? reject(error) : resolve()));
    });
  }
});

test("unexpected errors return a generic body without exposing internals", async () => {
  const app = createApp({
    projectService: {
      listProjects: async () => {
        throw new Error("database password must not be exposed");
      },
    },
    requireAuth: (req, _res, next) => {
      req.user = user;
      next();
    },
  });
  const tempServer = app.listen(0);
  await once(tempServer, "listening");

  try {
    const response = await fetch(
      `http://127.0.0.1:${tempServer.address().port}/api/v1/projects`,
    );
    const body = await response.text();
    assert.equal(response.status, 500);
    assert.equal(body.includes("database password"), false);
    assert.equal(body.includes("stack"), false);
  } finally {
    await new Promise((resolve, reject) => {
      tempServer.close((error) => (error ? reject(error) : resolve()));
    });
  }
});

test("protected routes fail explicitly when real authentication is unavailable", async () => {
  const app = createApp({ projectService });
  const tempServer = app.listen(0);
  await once(tempServer, "listening");

  try {
    const response = await fetch(
      `http://127.0.0.1:${tempServer.address().port}/api/v1/projects`,
    );
    assert.equal(response.status, 503);
    assert.equal((await response.json()).error.code, "AUTHENTICATION_UNAVAILABLE");
  } finally {
    await new Promise((resolve, reject) => {
      tempServer.close((error) => (error ? reject(error) : resolve()));
    });
  }
});

test("task routes remain unavailable until project authorization is integrated", async () => {
  const app = createApp({ projectService, commentService });
  const tempServer = app.listen(0);
  await once(tempServer, "listening");

  try {
    const response = await fetch(
      `http://127.0.0.1:${tempServer.address().port}/api/v1/tasks/50`,
    );
    assert.equal(response.status, 503);
    assert.equal((await response.json()).error.code, "API_NOT_CONFIGURED");
  } finally {
    await new Promise((resolve, reject) => {
      tempServer.close((error) => (error ? reject(error) : resolve()));
    });
  }
});
