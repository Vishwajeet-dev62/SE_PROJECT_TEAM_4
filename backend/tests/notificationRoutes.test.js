
"use strict";

const assert = require("node:assert/strict");
const { after, before, beforeEach, test } = require("node:test");
const express = require("express");
const { once } = require("node:events");

const {
  createNotificationRouter,
} = require("../src/routes/notificationRoutes");

let server;
let baseUrl;

const user = { id: "7", role: "MEMBER" };
const calls = [];

const notificationService = {
  list: async (...args) => {
    calls.push(["list", ...args]);

    return {
      data: [
        {
          id: "21",
          user_id: "7",
          type: "TASK_ASSIGNED",
          title: "New task assigned",
          message: "You have been assigned a task",
          is_read: 0,
        },
      ],
      pagination: { page: 1, limit: 20, total: 1 },
    };
  },

  markAsRead: async (...args) => {
    calls.push(["markAsRead", ...args]);

    return {
      id: args[0],
      user_id: args[1].id,
      is_read: 1,
    };
  },

  markAllAsRead: async (...args) => {
    calls.push(["markAllAsRead", ...args]);
    return { updatedCount: 3 };
  },

  countUnread: async (...args) => {
    calls.push(["countUnread", ...args]);
    return { count: 3 };
  },
};

before(async () => {
  const app = express();

  app.use(
    "/api/v1/notifications",
    createNotificationRouter({
      notificationService,
      requireAuth: (req, _res, next) => {
        req.user = user;
        next();
      },
    }),
  );

  server = app.listen(0);
  await once(server, "listening");

  baseUrl =
    `http://127.0.0.1:${server.address().port}/api/v1/notifications`;
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

test("lists notifications for the authenticated user", async () => {
  const response = await fetch(`${baseUrl}?page=1&limit=20`);

  assert.equal(response.status, 200);

  const payload = await response.json();

  assert.equal(payload.data[0].type, "TASK_ASSIGNED");
  assert.deepEqual(payload.pagination, {
    page: 1,
    limit: 20,
    total: 1,
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], "list");
  assert.equal(calls[0][1], user);
  assert.equal(calls[0][2].page, "1");
});

test("marks one notification as read", async () => {
  const response = await fetch(`${baseUrl}/21/read`, {
    method: "PATCH",
  });

  assert.equal(response.status, 200);

  const payload = await response.json();

  assert.equal(payload.data.id, "21");
  assert.equal(payload.data.is_read, 1);
  assert.equal(calls[0][0], "markAsRead");
  assert.equal(calls[0][1], "21");
  assert.equal(calls[0][2], user);
});

test("marks all notifications as read", async () => {
  const response = await fetch(`${baseUrl}/read-all`, {
    method: "PATCH",
  });

  assert.equal(response.status, 200);

  const payload = await response.json();

  assert.equal(payload.data.updatedCount, 3);
  assert.equal(calls[0][0], "markAllAsRead");
  assert.equal(calls[0][1], user);
});

test("returns the unread notification count", async () => {
  const response = await fetch(`${baseUrl}/unread-count`);

  assert.equal(response.status, 200);

  const payload = await response.json();

  assert.equal(payload.data.count, 3);
  assert.equal(calls[0][0], "countUnread");
  assert.equal(calls[0][1], user);
});

test("does not call notification service when authentication fails", async () => {
  const app = express();

  app.use(
    "/api/v1/notifications",
    createNotificationRouter({
      notificationService,
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
      `http://127.0.0.1:${unauthorizedServer.address().port}/api/v1/notifications`,
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
