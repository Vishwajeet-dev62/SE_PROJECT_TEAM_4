const { ApiError } = require("../errors/apiError");
const { parseId } = require("../utils/ids");

// Body: { "assigned_to": <user id> } to assign, or { "assigned_to": null }
// to remove the assignee. Field names follow the task API (snake_case).
function validateAssignment(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new ApiError(400, "VALIDATION_ERROR", "Request body must be a JSON object");
  }
  const unknown = Object.keys(body).filter((field) => field !== "assigned_to");
  if (unknown.length > 0) {
    throw new ApiError(400, "VALIDATION_ERROR", "Request contains unsupported fields", {
      fields: unknown,
    });
  }
  if (!Object.hasOwn(body, "assigned_to")) {
    throw new ApiError(400, "VALIDATION_ERROR", "assigned_to is required", {
      assigned_to: "Provide a user id, or null to remove the assignee",
    });
  }
  if (body.assigned_to === null) {
    return { assigneeId: null };
  }
  return { assigneeId: parseId(body.assigned_to, "assigned_to") };
}

module.exports = { validateAssignment };
