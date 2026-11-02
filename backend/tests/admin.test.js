const assert = require("node:assert/strict");
const test = require("node:test");
const request = require("supertest");
const { createApp } = require("../src/app");
const { ApiError } = require("../src/errors/apiError");
const { AdminService } = require("../src/services/adminService");

function createFakeUsers() {
  const users = [
    { id: "1", name: "Admin", email: "admin@x.co", role: "ADMIN", active: true, lockedUntil: null, createdAt: "t" },
    { id: "2", name: "Member", email: "member@x.co", role: "MEMBER", active: true, lockedUntil: null, createdAt: "t" },
    { id: "3", name: "Other", email: "other@x.co", role: "MEMBER", active: false, lockedUntil: null, createdAt: "t" },
  ];
  return {
    users,
    listAll: async ({ limit, offset }) => ({
      rows: users.slice(offset, offset + limit),
      total: users.length,
    }),
    findById: async (id) => users.find((user) => user.id === id) || null,
    setRole: async (id, role) => { users.find((user) => user.id === id).role = role; },
    setActive: async (id, active) => { users.find((user) => user.id === id).active = active; },
  };
}

// Stand-in for requireAuth: "x-test-user: 1:ADMIN" becomes req.user.
function fakeRequireAuth(req, _res, next) {
  const header = req.get("x-test-user");
  if (!header) {
    return next(new ApiError(401, "UNAUTHENTICATED", "Authentication is required"));
  }
  const [id, role] = header.split(":");
  req.user = { id, role };
  return next();
}

function setup() {
  const userRepository = createFakeUsers();
  const events = [];
  const adminService = new AdminService({
    userRepository,
    auditLog: async (event) => { events.push(event); },
  });
  const app = createApp({ adminService, requireAuth: fakeRequireAuth });
  return { app, userRepository, events };
}

const asAdmin = { "x-test-user": "1:ADMIN" };
const asMember = { "x-test-user": "2:MEMBER" };

test("admin routes reject anonymous users with 401 and members with 403", async () => {
  const { app } = setup();
  for (const [method, path] of [
    ["get", "/api/v1/admin/users"],
    ["patch", "/api/v1/admin/users/2/status"],
    ["patch", "/api/v1/admin/users/2/role"],
  ]) {
    const anonymous = await request(app)[method](path).send({});
    assert.equal(anonymous.status, 401, `${method} ${path}`);
    const member = await request(app)[method](path).set(asMember).send({});
    assert.equal(member.status, 403, `${method} ${path}`);
    assert.equal(member.body.error.code, "FORBIDDEN");
  }
});

test("admin can list users in the shared pagination envelope", async () => {
  const { app } = setup();
  const response = await request(app).get("/api/v1/admin/users?page=1&limit=2").set(asAdmin);
  assert.equal(response.status, 200);
  assert.equal(response.body.data.length, 2);
  assert.deepEqual(response.body.pagination, { page: 1, limit: 2, total: 3 });
  assert.equal(JSON.stringify(response.body).includes("password"), false);

  const bad = await request(app).get("/api/v1/admin/users?limit=0").set(asAdmin);
  assert.equal(bad.status, 400);
});

test("admin can deactivate and reactivate a user and each change is audited", async () => {
  const { app, userRepository, events } = setup();
  const off = await request(app).patch("/api/v1/admin/users/2/status").set(asAdmin).send({ active: false });
  assert.equal(off.status, 200);
  assert.equal(off.body.data.active, false);
  assert.equal(userRepository.users[1].active, false);

  const on = await request(app).patch("/api/v1/admin/users/2/status").set(asAdmin).send({ active: true });
  assert.equal(on.body.data.active, true);

  assert.equal(events.length, 2);
  assert.equal(events[0].eventType, "USER_STATUS_CHANGED");
  assert.equal(events[0].userId, "1");
  assert.deepEqual(events[0].details, { targetUserId: "2", from: true, to: false });
});

test("admin can change a role, which is audited with old and new values", async () => {
  const { app, userRepository, events } = setup();
  const response = await request(app).patch("/api/v1/admin/users/2/role").set(asAdmin).send({ role: "ADMIN" });
  assert.equal(response.status, 200);
  assert.equal(response.body.data.role, "ADMIN");
  assert.equal(userRepository.users[1].role, "ADMIN");
  assert.equal(events[0].eventType, "ROLE_CHANGED");
  assert.deepEqual(events[0].details, { targetUserId: "2", from: "MEMBER", to: "ADMIN" });
});

test("unchanged values succeed without writing an audit event", async () => {
  const { app, events } = setup();
  const response = await request(app).patch("/api/v1/admin/users/2/role").set(asAdmin).send({ role: "MEMBER" });
  assert.equal(response.status, 200);
  assert.equal(events.length, 0);
});

test("administrators cannot change their own role or status", async () => {
  const { app, userRepository, events } = setup();
  for (const [path, body] of [
    ["/api/v1/admin/users/1/role", { role: "MEMBER" }],
    ["/api/v1/admin/users/1/status", { active: false }],
  ]) {
    const response = await request(app).patch(path).set(asAdmin).send(body);
    assert.equal(response.status, 409);
    assert.equal(response.body.error.code, "CANNOT_MODIFY_SELF");
  }
  assert.equal(userRepository.users[0].role, "ADMIN");
  assert.equal(userRepository.users[0].active, true);
  assert.equal(events.length, 0);
});

test("admin updates validate ids, bodies and unknown users", async () => {
  const { app } = setup();
  const cases = [
    ["/api/v1/admin/users/abc/role", { role: "ADMIN" }, 400, "INVALID_ID"],
    ["/api/v1/admin/users/2/role", { role: "OWNER" }, 400, "VALIDATION_ERROR"],
    ["/api/v1/admin/users/2/role", { role: "ADMIN", extra: 1 }, 400, "VALIDATION_ERROR"],
    ["/api/v1/admin/users/2/status", { active: "no" }, 400, "VALIDATION_ERROR"],
    ["/api/v1/admin/users/99/role", { role: "ADMIN" }, 404, "USER_NOT_FOUND"],
  ];
  for (const [path, body, status, code] of cases) {
    const response = await request(app).patch(path).set(asAdmin).send(body);
    assert.equal(response.status, status, path);
    assert.equal(response.body.error.code, code, path);
  }
});
