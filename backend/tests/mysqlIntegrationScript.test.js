"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  isDisposableDatabase,
  requireExplicitOptIn,
} = require("../scripts/mysql-integration");

const validConfig = {
  db: { database: "task_manager_disposable_test" },
  jwtSecret: "a-strong-test-secret-with-at-least-32-characters",
};

test("live MySQL integration is disabled without explicit opt-in", () => {
  const previous = process.env.M2_MYSQL_INTEGRATION;
  delete process.env.M2_MYSQL_INTEGRATION;
  try {
    assert.throws(
      () => requireExplicitOptIn(validConfig),
      /Refusing database writes/,
    );
  } finally {
    if (previous === undefined) delete process.env.M2_MYSQL_INTEGRATION;
    else process.env.M2_MYSQL_INTEGRATION = previous;
  }
});

test("live MySQL integration rejects ambiguous and production-looking database names", () => {
  process.env.M2_MYSQL_INTEGRATION = "1";
  try {
    assert.equal(isDisposableDatabase("task_manager_test"), true);
    assert.equal(isDisposableDatabase("disposable_task_manager"), true);
    assert.equal(isDisposableDatabase("task_manager"), false);
    assert.equal(isDisposableDatabase("production_test"), false);
    assert.equal(isDisposableDatabase("task_manager_prod_test"), false);
    assert.throws(
      () => requireExplicitOptIn({
        ...validConfig,
        db: { database: "task_manager" },
      }),
      /DB_NAME must clearly contain/,
    );
    assert.throws(
      () => requireExplicitOptIn({
        ...validConfig,
        db: { database: "production_test" },
      }),
      /DB_NAME must clearly contain/,
    );
  } finally {
    delete process.env.M2_MYSQL_INTEGRATION;
  }
});

test("live MySQL integration rejects the example JWT secret", () => {
  process.env.M2_MYSQL_INTEGRATION = "1";
  try {
    assert.throws(
      () => requireExplicitOptIn({
        ...validConfig,
        jwtSecret: "replace_with_a_long_random_secret_which_is_long_enough",
      }),
      /non-placeholder value/,
    );
  } finally {
    delete process.env.M2_MYSQL_INTEGRATION;
  }
});
