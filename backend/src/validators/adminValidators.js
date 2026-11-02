const { ApiError } = require("../errors/apiError");

const ROLES = ["ADMIN", "MEMBER"];

function validateStatusUpdate(body) {
  const input = requireObject(body, ["active"]);
  if (typeof input.active !== "boolean") {
    throw new ApiError(400, "VALIDATION_ERROR", "active must be true or false", {
      active: "Must be a boolean",
    });
  }
  return { active: input.active };
}

function validateRoleUpdate(body) {
  const input = requireObject(body, ["role"]);
  if (!ROLES.includes(input.role)) {
    throw new ApiError(400, "VALIDATION_ERROR", "role is not valid", {
      role: `Must be one of ${ROLES.join(", ")}`,
    });
  }
  return { role: input.role };
}

function requireObject(body, allowedFields) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new ApiError(400, "VALIDATION_ERROR", "Request body must be a JSON object");
  }
  const unknown = Object.keys(body).filter((field) => !allowedFields.includes(field));
  if (unknown.length > 0) {
    throw new ApiError(400, "VALIDATION_ERROR", "Request contains unsupported fields", {
      fields: unknown,
    });
  }
  return body;
}

module.exports = { validateRoleUpdate, validateStatusUpdate };
