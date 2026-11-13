"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

// The repositories run against fake pools in these tests, so a column name
// that does not exist in the migrations would only fail against a real
// database. This guard keeps the user queries and the schema in step.
test("user queries use the column names defined by 001_users.sql", () => {
  const schema = read("migrations/001_users.sql");
  for (const column of ["active", "failed_attempts", "locked_until", "password_hash"]) {
    assert.match(schema, new RegExp(`^\\s+${column}\\s`, "m"), `schema defines ${column}`);
  }

  const repositories = [
    "src/repositories/userRepository.js",
    "src/repositories/passwordResetRepository.js",
  ];
  for (const file of repositories) {
    const source = read(file);
    assert.doesNotMatch(source, /\bis_active\b/, `${file} must not use is_active`);
    assert.doesNotMatch(
      source,
      /\bfailed_login_attempts\b/,
      `${file} must not use failed_login_attempts`,
    );
  }

  const userRepository = read("src/repositories/userRepository.js");
  assert.match(userRepository, /failed_attempts = failed_attempts \+ 1/);
  assert.match(userRepository, /SET failed_attempts = 0/);
});

// MySQL evaluates SET assignments left to right and later ones see earlier
// results. If the counter were incremented before locked_until is decided,
// accounts would lock after 4 failures instead of 5 (found on a real
// database; fake pools cannot show it).
test("recordFailedLogin decides the lock before incrementing the counter", async () => {
  const { UserRepository } = require("../src/repositories/userRepository");
  const statements = [];
  const repository = new UserRepository({
    execute: async (sql, params) => {
      statements.push([sql.replace(/\s+/g, " ").trim(), params]);
      return [{ affectedRows: 1 }];
    },
  });
  await repository.recordFailedLogin("7", 5, 15);

  assert.equal(statements.length, 2);
  assert.match(statements[0][0], /locked_until <= UTC_TIMESTAMP\(3\)/);
  const increment = statements[1][0];
  assert.ok(
    increment.indexOf("locked_until = CASE") < increment.indexOf("failed_attempts = failed_attempts + 1"),
    "locked_until must be assigned before the counter changes",
  );
  assert.deepEqual(statements[1][1], [5, 15, "7"]);
});
