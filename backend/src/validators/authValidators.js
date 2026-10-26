const { ApiError } = require("../errors/apiError");

const REGISTER_FIELDS = new Set(["name", "email", "password"]);
const LOGIN_FIELDS = new Set(["email", "password"]);
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_PASSWORD_BYTES = 72; // bcrypt ignores anything beyond 72 bytes

function validateRegister(body) {
  const input = requireObject(body);
  rejectUnknownFields(input, REGISTER_FIELDS);
  return {
    name: validateName(input.name),
    email: validateEmail(input.email),
    password: validateNewPassword(input.password),
  };
}

function validateLogin(body) {
  const input = requireObject(body);
  rejectUnknownFields(input, LOGIN_FIELDS);
  if (typeof input.email !== "string" || input.email.trim() === "") {
    throw invalid("Email is required", "email", "This field cannot be empty");
  }
  if (typeof input.password !== "string" || input.password === "") {
    throw invalid("Password is required", "password", "This field cannot be empty");
  }
  return { email: input.email.trim().toLowerCase(), password: input.password };
}

function validateName(value) {
  if (typeof value !== "string" || value.trim() === "") {
    throw invalid("Name is required", "name", "This field cannot be empty");
  }
  const name = value.trim();
  if (name.length > 100) {
    throw invalid("Name is too long", "name", "Use at most 100 characters");
  }
  return name;
}

function validateEmail(value) {
  if (typeof value !== "string" || value.trim() === "") {
    throw invalid("Email is required", "email", "This field cannot be empty");
  }
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !EMAIL_PATTERN.test(email)) {
    throw invalid("Email is not valid", "email", "Enter a valid email address");
  }
  return email;
}

// SRS TM-F-001: at least 8 characters, letters and digits.
function validateNewPassword(value) {
  if (typeof value !== "string" || value === "") {
    throw invalid("Password is required", "password", "This field cannot be empty");
  }
  if (
    value.length < 8
    || !/[A-Za-z]/.test(value)
    || !/\d/.test(value)
  ) {
    throw invalid(
      "Password does not meet the policy",
      "password",
      "Use at least 8 characters with letters and digits",
    );
  }
  if (Buffer.byteLength(value, "utf8") > MAX_PASSWORD_BYTES) {
    throw invalid("Password is too long", "password", "Use at most 72 bytes");
  }
  return value;
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

function invalid(message, field, detail) {
  return new ApiError(400, "VALIDATION_ERROR", message, { [field]: detail });
}

module.exports = { validateLogin, validateRegister };
