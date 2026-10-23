const { ApiError } = require("../errors/apiError");

const MAX_UNSIGNED_BIGINT = 18446744073709551615n;

function parseId(value, field = "id") {
  const text = typeof value === "number" && Number.isSafeInteger(value)
    ? String(value)
    : value;

  if (typeof text !== "string" || !/^[1-9]\d*$/.test(text)) {
    throw new ApiError(400, "INVALID_ID", `${field} must be a positive integer`);
  }

  if (BigInt(text) > MAX_UNSIGNED_BIGINT) {
    throw new ApiError(400, "INVALID_ID", `${field} is outside the supported range`);
  }

  return text;
}

function requireUser(user) {
  if (!user || !["ADMIN", "MEMBER"].includes(user.role)) {
    throw new ApiError(401, "UNAUTHENTICATED", "Authentication is required");
  }
  return { ...user, id: parseId(user.id, "user id") };
}

module.exports = { parseId, requireUser };
