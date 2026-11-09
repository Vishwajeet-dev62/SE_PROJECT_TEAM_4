
"use strict";

const assert = require("node:assert/strict");
const { after, before, beforeEach, test } = require("node:test");
const express = require("express");
const { once } = require("node:events");

const {
  createCategoryRouter,
} = require("../src/routes/categoryRoutes");

let server;
let baseUrl;

const user = { id: "7", role: "MEMBER" };
const calls = [];

const categoryService = {
  list: async (...args) => {
    calls.push(["list", ...args]);

    return [
      {
        id: "12",
        projectId: "10",
        name: "Development",
      },
    ];
  },

  create: async (...args) => {
    calls.push(["create", ...args]);

    return {
      id: "12",
      projectId: args[0],
      name: args[1].name.trim(),
    };
  },

  update: async (...args) => {
    calls.push(["update", ...args]);

    return {
      id: args[1],
      projectId: args[0],
      name: args[2].name.trim(),
    };
  },

  delete: async (...args) => {
    calls.push(["delete", ...args]);
  },
};

before(async () => {
  const app = express();
  app.use(express.json());

  app.use(
    "/api/v1/projects/:id/categories",
    createCategoryRouter({
      categoryService,
      requireAuth: (req, _res, next) => {
        req.user = user;
        next();
      },
    }),
  );

  server = app.listen(0);
  await once(server, "listening");

  baseUrl =
    `http://127.0.0.1:${server.address().port}/api/v1/projects/10/categories`;
});

after(async () => {
  if (!server) return;

  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});

beforeEach(() => {
  calls.length = 0;
});

test("lists categories for a project", async () => {
  const response = await fetch(baseUrl);

  assert.equal(response.status, 200);

  const payload = await response.json();

  assert.equal(payload.data.length, 1);
  assert.equal(payload.data[0].id, "12");
  assert.equal(payload.data[0].name, "Development");

  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], "list");
  assert.equal(calls[0][1], "10");
  assert.equal(calls[0][2], user);
});

test("creates a category and returns HTTP 201", async () => {
  const response = await fetch(baseUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Testing" }),
  });

  assert.equal(response.status, 201);

  const payload = await response.json();

  assert.equal(payload.data.id, "12");
  assert.equal(payload.data.name, "Testing");

  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], "create");
  assert.equal(calls[0][1], "10");
  assert.deepEqual(calls[0][2], { name: "Testing" });
  assert.equal(calls[0][3], user);
});

test("updates a category and returns HTTP 200", async () => {
  const response = await fetch(`${baseUrl}/12`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Updated category" }),
  });

  assert.equal(response.status, 200);

  const payload = await response.json();

  assert.equal(payload.data.id, "12");
  assert.equal(payload.data.name, "Updated category");

  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], "update");
  assert.equal(calls[0][1], "10");
  assert.equal(calls[0][2], "12");
  assert.deepEqual(calls[0][3], { name: "Updated category" });
  assert.equal(calls[0][4], user);
});

test("deletes a category and returns HTTP 204", async () => {
  const response = await fetch(`${baseUrl}/12`, {
    method: "DELETE",
  });

  assert.equal(response.status, 204);
  assert.equal(await response.text(), "");

  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], "delete");
  assert.equal(calls[0][1], "10");
  assert.equal(calls[0][2], "12");
  assert.equal(calls[0][3], user);
});

test("does not call category service when authentication fails", async () => {
  const app = express();
  app.use(express.json());

  app.use(
    "/api/v1/projects/:id/categories",
    createCategoryRouter({
      categoryService,
      requireAuth: (_req, res) => {
        res.status(401).json({
          error: {
            code: "UNAUTHORIZED",
            message: "Authentication required",
          },
        });
      },
    }),
  );

  const unauthorizedServer = app.listen(0);
  await once(unauthorizedServer, "listening");

  try {
    const response = await fetch(
      `http://127.0.0.1:${unauthorizedServer.address().port}/api/v1/projects/10/categories`,
    );

    assert.equal(response.status, 401);
    assert.equal(calls.length, 0);
  } finally {
    await new Promise((resolve, reject) => {
      unauthorizedServer.close((error) =>
        error ? reject(error) : resolve(),
      );
    });
  }
});

test("rejects invalid category input with HTTP 400", async () => {
  const app = express();
  app.use(express.json());

  const { ApiError } = require("../src/errors/apiError");

  const invalidService = {
    ...categoryService,
    create: async () => {
      throw new ApiError(
        400,
        "VALIDATION_ERROR",
        "Category name is required",
      );
    },
  };

  const { errorHandler } = require("../src/middleware/errorHandler");

  app.use(
    "/api/v1/projects/:id/categories",
    createCategoryRouter({
      categoryService: invalidService,
      requireAuth: (req, _res, next) => {
        req.user = user;
        next();
      },
    }),
  );

  app.use(errorHandler);

  const testServer = app.listen(0);
  await once(testServer, "listening");

  try {
    const response = await fetch(
      `http://127.0.0.1:${testServer.address().port}/api/v1/projects/10/categories`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "" }),
      },
    );

    assert.equal(response.status, 400);
    assert.equal(calls.length, 0);
  } finally {
    await new Promise((resolve, reject) => {
      testServer.close((error) =>
        error ? reject(error) : resolve(),
      );
    });
  }
});
