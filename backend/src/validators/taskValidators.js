
"use strict";

const ALLOWED_STATUSES = new Set(["TODO", "IN_PROGRESS", "DONE"]);
const ALLOWED_PRIORITIES = new Set(["LOW", "MEDIUM", "HIGH"]);
const MAX_PAGE_SIZE = 100;
const MAX_TITLE_LENGTH = 150;

// These fields are controlled by the authenticated route/service,
// not by the request body.
const MUTABLE_FIELDS = new Set([
  "assigned_to",
  "category_id",
  "title",
  "description",
  "status",
  "priority",
  "due_date",
]);

function parsePositiveInteger(value, fallback) {
  if (value === undefined || value === "") return fallback;
  if (!/^[1-9]\d*$/.test(String(value))) return null;

  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function parsePagination(query = {}) {
  const page = parsePositiveInteger(query.page, 1);
  const limit = parsePositiveInteger(query.limit, 20);

  if (page === null || limit === null || limit > MAX_PAGE_SIZE) {
    return null;
  }

  const offset = (page - 1) * limit;
  if (!Number.isSafeInteger(offset)) return null;

  return { page, limit, offset };
}

function validateDueDate(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2})?)?$/.test(value)
  ) {
    return "due_date must be a valid date or datetime string";
  }

  const datePart = value.slice(0, 10);
  const date = new Date(`${datePart}T00:00:00Z`);

  if (
    Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== datePart
  ) {
    return "due_date must contain a valid calendar date";
  }

  return null;
}

function validateTaskBody(body, { partial = false } = {}) {
  const input =
    body && typeof body === "object" && !Array.isArray(body) ? body : {};

  const errors = [];

  for (const key of Object.keys(input)) {
    if (!MUTABLE_FIELDS.has(key)) {
      errors.push({
        field: key,
        message: "Unknown or immutable field",
      });
    }
  }

  if (!partial && (
    input.title === undefined ||
    input.title === null ||
    input.title === ""
  )) {
    errors.push({ field: "title", message: "title is required" });
  }

  if (!partial || input.title !== undefined) {
    if (typeof input.title !== "string" || !input.title.trim()) {
      errors.push({
        field: "title",
        message: "title must be a non-empty string",
      });
    } else if (input.title.trim().length > MAX_TITLE_LENGTH) {
      errors.push({
        field: "title",
        message: `title must be at most ${MAX_TITLE_LENGTH} characters`,
      });
    }
  }

  for (const field of ["assigned_to", "category_id"]) {
    if (input[field] !== undefined && input[field] !== null) {
      if (parsePositiveInteger(input[field], null) === null) {
        errors.push({
          field,
          message: `${field} must be a positive integer or null`,
        });
      }
    }
  }

  if (
    input.description !== undefined &&
    input.description !== null &&
    typeof input.description !== "string"
  ) {
    errors.push({
      field: "description",
      message: "description must be a string or null",
    });
  }

  if (
    input.status !== undefined &&
    (typeof input.status !== "string" || !ALLOWED_STATUSES.has(input.status))
  ) {
    errors.push({
      field: "status",
      message: "status must be TODO, IN_PROGRESS, or DONE",
    });
  }

  if (
    input.priority !== undefined &&
    (typeof input.priority !== "string" ||
      !ALLOWED_PRIORITIES.has(input.priority))
  ) {
    errors.push({
      field: "priority",
      message: "priority must be LOW, MEDIUM, or HIGH",
    });
  }

  const dueDateError = validateDueDate(input.due_date);
  if (dueDateError) {
    errors.push({ field: "due_date", message: dueDateError });
  }

  if (partial && !Object.keys(input).some((key) => MUTABLE_FIELDS.has(key))) {
    errors.push({
      field: "body",
      message: "Provide at least one supported field to update",
    });
  }

  return { input, errors };
}

module.exports = {
  ALLOWED_PRIORITIES,
  ALLOWED_STATUSES,
  MAX_PAGE_SIZE,
  MAX_TITLE_LENGTH,
  parsePagination,
  parsePositiveInteger,
  validateTaskBody,
};
