
"use strict";

const assert = require("node:assert/strict");
const { after, before, beforeEach, test } = require("node:test");
const { once } = require("node:events");
const express = require("express");

const {
  createTaskServiceRouter,
} = require("../src/routes/taskServiceRoutes");

let server;
let baseUrl;
const calls = [];

const user = { id: "7", role: "MEMBER" };

const taskService = {
  list: async (...args) => {
    calls.push(["list", ...args]);
    return {
      data: [{ id: "11", title: "Test task" }],
      pagination: { page: 1, limit: 20, total: 1 },
    };
  },

  create: async (...args) => {
    calls.push(["create", ...args]);
    return { id: "12", title: args[1].title };
  },

  get: async (...args) => {
    calls.push(["get", ...args]);
    return { id: args[0], title: "Test task" };
  },

  update: async (...args) => {
    calls.push(["update", ...args]);
    return { id: args[0], title: args[1].title };
  },

  delete: async (...args) => {
    calls.push(["delete", ...args]);
  },

  listTrash: async (...args) => {
    calls.push(["listTrash", ...args]);
    return {
      data: [{ id: "13", title: "Deleted task" }],
      pagination: { page: 1, limit: 20, total: 1 },
    };
  },

  restore: async (...args) => {
    calls.push(["restore", ...args]);
    return { id: args[0], title: "Restored task" };
  },
};

before(async () => {
  const app = express();
  app.use(express.json());

  app.use(
    "/api/v1",
    createTaskServiceRouter({
      taskService,
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
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});

beforeEach(() => {
  calls.length = 0;
});

test("lists tasks for a project and passes query filters to the service", async () => {
  const response = await fetch(
    `${baseUrl}/projects/5/tasks?page=2&limit=10`,
  );

  assert.equal(response.status, 200);
  assert.equal((await response.json()).data[0].id, "11");
  assert.equal(calls[0][0], "list");
  assert.equal(calls[0][1], "5");
  assert.equal(calls[0][2], user);
  assert.equal(calls[0][3].page, "2");
  assert.equal(calls[0][3].limit, "10");
});

test("creates a task and returns HTTP 201", async () => {
  const response = await fetch(
    `${baseUrl}/projects/5/tasks`,
    jsonRequest("POST", { title: "New task" }),
  );

  assert.equal(response.status, 201);
  assert.deepEqual(await response.json(), {
    data: { id: "12", title: "New task" },
  });
  assert.equal(calls[0][0], "create");
  assert.equal(calls[0][1], "5");
  assert.equal(calls[0][3], user);
});

test("gets and updates an individual task", async () => {
  const get = await fetch(`${baseUrl}/tasks/11`);
  assert.equal(get.status, 200);

  const update = await fetch(
    `${baseUrl}/tasks/11`,
    jsonRequest("PATCH", { title: "Updated task" }),
  );
  assert.equal(update.status, 200);
  assert.deepEqual(await update.json(), {
    data: { id: "11", title: "Updated task" },
  });

  assert.equal(calls[0][0], "get");
  assert.equal(calls[1][0], "update");
});

test("deletes a task with HTTP 204", async () => {
  const response = await fetch(`${baseUrl}/tasks/11`, {
    method: "DELETE",
  });

  assert.equal(response.status, 204);
  assert.equal(calls[0][0], "delete");
});

test("lists trash and restores a deleted task", async () => {
  const trash = await fetch(`${baseUrl}/projects/5/tasks/trash`);
  assert.equal(trash.status, 200);
  assert.equal((await trash.json()).data[0].id, "13");

  const restore = await fetch(
    `${baseUrl}/tasks/13/restore`,
    { method: "POST" },
  );
  assert.equal(restore.status, 200);
  assert.equal((await restore.json()).data.title, "Restored task");

  assert.equal(calls[0][0], "listTrash");
  assert.equal(calls[1][0], "restore");
});

test("passes the authenticated user to every task operation", async () => {
  await fetch(`${baseUrl}/projects/5/tasks`);
  await fetch(`${baseUrl}/projects/5/tasks/trash`);
  await fetch(`${baseUrl}/tasks/11`);
  await fetch(`${baseUrl}/tasks/11`, jsonRequest("PATCH", {
    title: "Updated",
  }));
  await fetch(`${baseUrl}/tasks/11`, { method: "DELETE" });
  await fetch(`${baseUrl}/tasks/11/restore`, { method: "POST" });

  assert.equal(calls.length, 6);

  for (const call of calls) {
    assert.equal(call[call[0] === "list" || call[0] === "create" ||
      call[0] === "listTrash" ? 2 : call[0] === "update" ? 3 : 2], user);
  }
});

function jsonRequest(method, body) {
  return {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}
