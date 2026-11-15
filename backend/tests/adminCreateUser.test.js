const assert = require("node:assert/strict");
const test = require("node:test");
const bcrypt = require("bcryptjs");
const request = require("supertest");
const { createApp } = require("../src/app");
const { ApiError } = require("../src/errors/apiError");
const { UserRepository } = require("../src/repositories/userRepository");
const { AdminService } = require("../src/services/adminService");

function setup() {
  const users = [];
  const events = [];
  const userRepository = {
    create: async ({ name, email, passwordHash, role }) => {
      if (users.some((user) => user.email === email)) {
        throw new ApiError(409, "EMAIL_EXISTS", "An account with this email already exists");
      }
      const user = {
        id: String(users.length + 1), name, email, passwordHash, role,
        active: true, lockedUntil: null, createdAt: "t",
      };
      users.push(user);
      return user;
    },
  };
  const adminService = new AdminService({
    userRepository,
    auditLog: async (event) => { events.push(event); },
    bcryptCost: 4,
  });
  const requireAuth = (req, _res, next) => {
    const header = req.get("x-test-user");
    if (!header) return next(new ApiError(401, "UNAUTHENTICATED", "Authentication is required"));
    const [id, role] = header.split(":");
    req.user = { id, role };
    return next();
  };
  return { app: createApp({ adminService, requireAuth, authRateLimit: false }), users, events };
}

const admin = { "x-test-user": "99:ADMIN" };
const member = { "x-test-user": "5:MEMBER" };
const body = { name: "New Person", email: "New.Person@Example.com", password: "Passw0rdOK" };
const create = (app, payload = body, headers = admin) =>
  request(app).post("/api/v1/admin/users").set(headers).send(payload);

test("an administrator creates a member account with a hashed password", async () => {
  const { app, users, events } = setup();
  const response = await create(app);

  assert.equal(response.status, 201);
  assert.equal(response.body.data.email, "new.person@example.com");
  assert.equal(response.body.data.role, "MEMBER");
  assert.equal(JSON.stringify(response.body).includes("passw"), false);
  assert.equal(users[0].passwordHash.includes(body.password), false);
  assert.equal(await bcrypt.compare(body.password, users[0].passwordHash), true);

  assert.equal(events.length, 1);
  assert.equal(events[0].eventType, "USER_CREATED_BY_ADMIN");
  assert.equal(events[0].userId, "99");
  assert.deepEqual(events[0].details, { targetUserId: "1", role: "MEMBER" });
  assert.equal(JSON.stringify(events).includes(body.password), false);
});

test("an administrator can create another administrator", async () => {
  const { app } = setup();
  const response = await create(app, { ...body, role: "ADMIN" });
  assert.equal(response.status, 201);
  assert.equal(response.body.data.role, "ADMIN");
});

test("only administrators can create accounts", async () => {
  const { app, users } = setup();
  assert.equal((await create(app, body, member)).status, 403);
  assert.equal((await request(app).post("/api/v1/admin/users").send(body)).status, 401);
  assert.equal(users.length, 0);
});

test("duplicate emails return 409 regardless of case", async () => {
  const { app } = setup();
  await create(app);
  const duplicate = await create(app, { ...body, email: "NEW.PERSON@example.com" });
  assert.equal(duplicate.status, 409);
  assert.equal(duplicate.body.error.code, "EMAIL_EXISTS");
});

test("account details are validated like registration", async () => {
  const { app, users } = setup();
  const cases = [
    [{ ...body, name: "  " }, "name"],
    [{ ...body, email: "not-an-email" }, "email"],
    [{ ...body, password: "short1" }, "password"],
    [{ ...body, password: "onlyletters" }, "password"],
    [{ ...body, role: "OWNER" }, "role"],
  ];
  for (const [payload, field] of cases) {
    const response = await create(app, payload);
    assert.equal(response.status, 400, JSON.stringify(payload));
    assert.ok(response.body.error.details[field], field);
  }
  const extra = await create(app, { ...body, active: false });
  assert.equal(extra.status, 400);
  assert.equal(users.length, 0);
});

test("the repository stores the requested role in a parameterized insert", async () => {
  const calls = [];
  const repository = new UserRepository({
    execute: async (sql, params) => {
      calls.push([sql.replace(/\s+/g, " ").trim(), params]);
      if (sql.startsWith("INSERT")) return [{ insertId: 5 }];
      return [[{ id: 5, name: "n", email: "e", password_hash: "h", role: "ADMIN", active: 1, failed_attempts: 0, locked_until: null, password_changed_epoch: null, created_at: "t", updated_at: "t" }]];
    },
  });
  const created = await repository.create({ name: "n", email: "e", passwordHash: "h", role: "ADMIN" });
  assert.match(calls[0][0], /INSERT INTO users \(name, email, password_hash, role\) VALUES \(\?, \?, \?, \?\)/);
  assert.deepEqual(calls[0][1], ["n", "e", "h", "ADMIN"]);
  assert.equal(created.role, "ADMIN");

  await repository.create({ name: "n", email: "e", passwordHash: "h" });
  assert.equal(calls.find((c, i) => i > 1 && c[0].startsWith("INSERT"))[1][3], "MEMBER");
});
