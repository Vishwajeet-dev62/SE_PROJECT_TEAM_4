
"use strict";

const assert = require("node:assert/strict");
const { after, before, beforeEach, test } = require("node:test");
const express = require("express");
const { once } = require("node:events");

const {
  createActivityRouter,
} = require("../src/routes/activityRoutes");

let server;
let baseUrl;
const calls = [];

const user = { id: "7", role: "MEMBER" };

const activityService = {
  list: async (...args) => {
    calls.push(args);

    return {
      data: [
        {
          id: "21",
          projectId: "5",
          userId: "7",
          actorName: "Test User",
          eventType: "TASK_CREATED",
          details: { taskId: "12" },
          createdAt: "2026-10-29T10:00:00.000Z",
        },
      ],
      pagination: { page: 1, limit: 20, total: 1 },
    };
  },
};

before(async () => {
  const app = express();

  app.use(
    "/api/v1/projects",
    createActivityRouter({
      activityService,
      requireAuth: (req, _res, next) => {
        req.user = user;
        next();
      },
    }),
  );

  server = app.listen(0);
  await once(server, "listening");
  baseUrl = `http://127.0.0.1:${server.address().port}/api/v1`;
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

test("lists project activity and passes the authenticated user and pagination query", async () => {
  const response = await fetch(
    `${baseUrl}/projects/5/activity?page=1&limit=20`,
  );

  assert.equal(response.status, 200);

  const payload = await response.json();
  assert.equal(payload.data[0].eventType, "TASK_CREATED");
  assert.equal(payload.data[0].projectId, "5");
  assert.deepEqual(payload.pagination, {
    page: 1,
    limit: 20,
    total: 1,
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], "5");
  assert.equal(calls[0][1], user);
  assert.equal(calls[0][2].page, "1");
  assert.equal(calls[0][2].limit, "20");
});

test("does not call the activity service when authentication fails", async () => {
  const app = express();

  app.use(
    "/api/v1/projects",
    createActivityRouter({
      activityService,
      requireAuth: (_req, res) => {
        res.status(401).json({
          error: { code: "UNAUTHORIZED", message: "Authentication required" },
        });
      },
    }),
  );

  const unauthorizedServer = app.listen(0);
  await once(unauthorizedServer, "listening");

  try {
    const response = await fetch(
      `http://127.0.0.1:${unauthorizedServer.address().port}/api/v1/projects/5/activity`,
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
