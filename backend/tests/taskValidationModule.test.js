
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  validateTaskBody,
  parsePagination,
} = require("../src/validators/taskValidators");

test("accepts a valid task title and trims whitespace", () => {
  const result = validateTaskBody({ title: "  Prepare report  " });

  assert.deepEqual(result.errors, []);
  assert.equal(result.input.title.trim(), "Prepare report");
});

test("rejects missing and excessively long titles", () => {
  assert.ok(validateTaskBody({}).errors.some((e) => e.field === "title"));
  assert.ok(
    validateTaskBody({ title: "x".repeat(151) }).errors.some(
      (e) => e.field === "title",
    ),
  );
});

test("rejects unsupported statuses and priorities", () => {
  assert.ok(
    validateTaskBody({ title: "Task", status: "WAITING" }).errors.some(
      (e) => e.field === "status",
    ),
  );
  assert.ok(
    validateTaskBody({ title: "Task", priority: "URGENT" }).errors.some(
      (e) => e.field === "priority",
    ),
  );
});

test("rejects client-controlled project and creator IDs", () => {
  const result = validateTaskBody({
    title: "Task",
    project_id: 5,
    created_by: 10,
  });

  assert.ok(result.errors.some((e) => e.field === "project_id"));
  assert.ok(result.errors.some((e) => e.field === "created_by"));
});

test("rejects empty partial updates and immutable fields", () => {
  assert.ok(validateTaskBody({}, { partial: true }).errors.length > 0);

  const result = validateTaskBody(
    { created_by: 99 },
    { partial: true },
  );

  assert.ok(result.errors.some((e) => e.field === "created_by"));
});

test("accepts valid optional IDs and nullable assignments", () => {
  assert.deepEqual(
    validateTaskBody({
      title: "Task",
      assigned_to: 20,
      category_id: null,
    }).errors,
    [],
  );

  assert.deepEqual(
    validateTaskBody({ assigned_to: null }, { partial: true }).errors,
    [],
  );
});

test("rejects invalid calendar dates", () => {
  const result = validateTaskBody({
    title: "Task",
    due_date: "2026-02-30",
  });

  assert.ok(result.errors.some((e) => e.field === "due_date"));
});

test("pagination defaults to page 1 and limit 20", () => {
  assert.deepEqual(parsePagination({}), {
    page: 1,
    limit: 20,
    offset: 0,
  });
});

test("pagination rejects invalid or excessive limits", () => {
  for (const query of [
    { page: "0" },
    { page: "-1" },
    { page: "abc" },
    { limit: "101" },
  ]) {
    assert.equal(parsePagination(query), null);
  }
});
