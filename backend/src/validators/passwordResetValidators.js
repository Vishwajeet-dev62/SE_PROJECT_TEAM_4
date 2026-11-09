const { ApiError } = require("../errors/apiError");
const { validateEmail, validateNewPassword } = require("./authValidators");

function validateForgotPassword(body) {
  const input = requireObject(body, ["email"]);
  return { email: validateEmail(input.email) };
}

function validateResetPassword(body) {
  const input = requireObject(body, ["token", "newPassword"]);
  if (
    typeof input.token !== "string"
    || input.token.trim() === ""
    || input.token.length > 128
  ) {
    throw new ApiError(400, "VALIDATION_ERROR", "Reset token is required", {
      token: "This field cannot be empty",
    });
  }
  let newPassword;
  try {
    newPassword = validateNewPassword(input.newPassword);
  } catch (error) {
    // Report the problem against the field the client actually sent.
    if (error instanceof ApiError && error.details && error.details.password) {
      throw new ApiError(400, "VALIDATION_ERROR", error.message, {
        newPassword: error.details.password,
      });
    }
    throw error;
  }
  return { token: input.token.trim(), newPassword };
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

module.exports = { validateForgotPassword, validateResetPassword };
