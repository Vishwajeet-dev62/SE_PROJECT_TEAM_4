const assert = require("node:assert/strict");
const test = require("node:test");
const { getConfig } = require("../src/config/env");
const { parseId, requireUser } = require("../src/utils/ids");
const { parsePagination } = require("../src/utils/pagination");
const { ApiError } = require("../src/errors/apiError");

test("database configuration is required and numeric settings are bounded", () => {
  assert.throws(() => getConfig({}), /DB_USER is required/);

  const config = getConfig({
    DB_USER: "task_app",
    DB_NAME: "task_manager",
    DB_PORT: "3307",
    PORT: "8080",
    CORS_ORIGIN: "https://app.example.test,http://localhost:5173",
  });

  assert.equal(config.port, 8080);
  assert.equal(config.db.port, 3307);
  assert.deepEqual(config.corsOrigins, [
    "https://app.example.test",
    "http://localhost:5173",
  ]);
  assert.throws(() => getConfig({
    DB_USER: "task_app",
    DB_NAME: "task_manager",
    PORT: "0",
  }), /PORT must be an integer/);
});

test("IDs preserve BIGINT values without JavaScript precision loss", () => {
  assert.equal(parseId("18446744073709551615"), "18446744073709551615");
  assert.throws(() => parseId("18446744073709551616"), ApiError);
  assert.throws(() => parseId("01"), ApiError);
  assert.throws(() => parseId("-1"), ApiError);
  assert.throws(() => parseId(Number.MAX_SAFE_INTEGER + 1), ApiError);
});

test("authenticated identity requires a supported role and positive ID", () => {
  assert.deepEqual(requireUser({ id: "12", role: "MEMBER" }), {
    id: "12",
    role: "MEMBER",
  });
  assert.throws(() => requireUser(undefined), (error) => error.status === 401);
  assert.throws(
    () => requireUser({ id: "12", role: "member" }),
    (error) => error.status === 401,
  );
});

test("pagination uses documented defaults and rejects unsafe offsets", () => {
  assert.deepEqual(parsePagination({}), { page: 1, limit: 20, offset: 0 });
  assert.deepEqual(parsePagination({ page: "3", limit: "10" }), {
    page: 3,
    limit: 10,
    offset: 20,
  });
  assert.throws(() => parsePagination({ limit: "101" }), ApiError);
  assert.throws(() => parsePagination({ page: "900719925474100" }), ApiError);
});
