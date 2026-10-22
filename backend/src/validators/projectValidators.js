const { ApiError } = require("../errors/apiError");
const { parseId } = require("../utils/ids");

const PROJECT_FIELDS = new Set(["name", "description"]);

function validateProjectCreate(body) {
  const input = requireObject(body);
  rejectUnknownFields(input, PROJECT_FIELDS);
  return {
    name: validateName(input.name),
    description: validateDescription(input.description),
  };
}

function validateProjectUpdate(body) {
  const input = requireObject(body);
  rejectUnknownFields(input, PROJECT_FIELDS);

  const update = {};
  if (Object.hasOwn(input, "name")) {
    update.name = validateName(input.name);
  }
  if (Object.hasOwn(input, "description")) {
    update.description = validateDescription(input.description);
  }
  if (Object.keys(update).length === 0) {
    throw new ApiError(400, "VALIDATION_ERROR", "At least one project field is required");
  }
  return update;
}

function validateMemberCreate(body) {
  const input = requireObject(body);
  rejectUnknownFields(input, new Set(["userId"]));
  return { userId: parseId(input.userId, "userId") };
}

function requireObject(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new ApiError(400, "VALIDATION_ERROR", "Request body must be a JSON object");
  }
  return body;
}

function rejectUnknownFields(input, allowed) {
  const unknown = Object.keys(input).filter((field) => !allowed.has(field));
  if (unknown.length > 0) {
    throw new ApiError(
      400,
      "VALIDATION_ERROR",
      "Request contains unsupported fields",
      { fields: unknown },
    );
  }
}

function validateName(value) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ApiError(400, "VALIDATION_ERROR", "Project name is required", {
      name: "This field cannot be empty",
    });
  }
  const name = value.trim();
  if (name.length > 150) {
    throw new ApiError(400, "VALIDATION_ERROR", "Project name is too long", {
      name: "Must not exceed 150 characters",
    });
  }
  return name;
}

function validateDescription(value) {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== "string") {
    throw new ApiError(400, "VALIDATION_ERROR", "Project description must be text", {
      description: "Must be a string or null",
    });
  }
  const description = value.trim();
  if (description.length > 5000) {
    throw new ApiError(400, "VALIDATION_ERROR", "Project description is too long", {
      description: "Must not exceed 5000 characters",
    });
  }
  return description || null;
}

module.exports = {
  validateMemberCreate,
  validateProjectCreate,
  validateProjectUpdate,
};
