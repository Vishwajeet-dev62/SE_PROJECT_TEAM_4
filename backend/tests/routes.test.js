const assert = require("node:assert/strict");
const { after, before, test } = require("node:test");
const { once } = require("node:events");
const { createApp } = require("../src/app");

let server;
let baseUrl;

const user = { id: "7", role: "MEMBER" };
const projectService = {
  listProjects: async () => ({
    data: [],
    pagination: { page: 1, limit: 20, total: 0 },
  }),
  getProject: async (id) => ({ id, name: "Project" }),
  createProject: async (input) => ({ id: "1", ...input }),
  updateProject: async (id, input) => ({ id, ...input }),
  archiveProject: async (id) => ({ id, archived: true }),
  listMembers: async () => ({
    data: [],
    pagination: { page: 1, limit: 20, total: 0 },
  }),
  addMember: async (projectId, memberId) => ({ projectId, userId: memberId }),
  removeMember: async () => {},
  getDashboard: async () => ({
    countsByStatus: { TODO: 0, IN_PROGRESS: 0, DONE: 0 },
    percentComplete: 0,
    overdue: 0,
  }),
  getBoard: async () => ({
    data: { TODO: [], IN_PROGRESS: [], DONE: [] },
    pagination: { page: 1, limit: 20, total: 0 },
  }),
};
const commentService = {
  list: async () => ({
    data: [],
    pagination: { page: 1, limit: 20, total: 0 },
  }),
  create: async (taskId, body) => ({ id: "1", taskId, body }),
  update: async (id, body) => ({ id, body }),
  delete: async () => {},
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
  baseUrl = `http://127.0.0.1:${server.address().port}/api/v1`;
});

after(async () => {
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});

test("project management and member endpoints use contract methods and status codes", async () => {
  const list = await fetch(`${baseUrl}/projects`);
  assert.equal(list.status, 200);

  const create = await fetch(`${baseUrl}/projects`, jsonRequest("POST", {
    name: "Project",
  }));
  assert.equal(create.status, 201);

  const get = await fetch(`${baseUrl}/projects/1`);
  assert.equal(get.status, 200);

  const update = await fetch(`${baseUrl}/projects/1`, jsonRequest("PATCH", {
    name: "Renamed",
  }));
  assert.equal(update.status, 200);

  const archive = await fetch(`${baseUrl}/projects/1/archive`, {
    method: "POST",
  });
  assert.equal(archive.status, 200);

  const members = await fetch(`${baseUrl}/projects/1/members`);
  assert.equal(members.status, 200);

  const addMember = await fetch(`${baseUrl}/projects/1/members`, jsonRequest("POST", {
    userId: "8",
  }));
  assert.equal(addMember.status, 201);

  const removeMember = await fetch(`${baseUrl}/projects/1/members/8`, {
    method: "DELETE",
  });
  assert.equal(removeMember.status, 204);
});

test("dashboard and board endpoints return the selected project views", async () => {
  const dashboard = await fetch(`${baseUrl}/projects/1/dashboard`);
  assert.equal(dashboard.status, 200);
  assert.equal((await dashboard.json()).data.percentComplete, 0);

  const board = await fetch(`${baseUrl}/projects/1/board?page=2&limit=10`);
  assert.equal(board.status, 200);
  assert.deepEqual((await board.json()).data, {
    TODO: [],
    IN_PROGRESS: [],
    DONE: [],
  });
});

test("task comment endpoints validate bodies and return appropriate statuses", async () => {
  const list = await fetch(`${baseUrl}/tasks/9/comments`);
  assert.equal(list.status, 200);

  const invalid = await fetch(`${baseUrl}/tasks/9/comments`, jsonRequest("POST", {
    body: " ",
  }));
  assert.equal(invalid.status, 400);

  const create = await fetch(`${baseUrl}/tasks/9/comments`, jsonRequest("POST", {
    body: "Helpful note",
  }));
  assert.equal(create.status, 201);

  const update = await fetch(`${baseUrl}/comments/1`, jsonRequest("PATCH", {
    body: "Updated note",
  }));
  assert.equal(update.status, 200);

  const remove = await fetch(`${baseUrl}/comments/1`, { method: "DELETE" });
  assert.equal(remove.status, 204);
});

function jsonRequest(method, body) {
  return {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}
