"use strict";

const { ApiError } = require("../errors/apiError");

const VALID_ROLES = new Set(["ADMIN", "MEMBER"]);

// Use after requireAuth: router.get("/", requireAuth, requireRole("ADMIN"), ...)
function requireRole(...roles) {
  if (roles.length === 0 || roles.some((role) => !VALID_ROLES.has(role))) {
    throw new Error("requireRole needs one or more of: ADMIN, MEMBER");
  }

  return function requireRoleMiddleware(req, _res, next) {
    if (!req.user) {
      return next(
        new ApiError(401, "UNAUTHENTICATED", "Authentication is required"),
      );
    }
    if (!roles.includes(req.user.role)) {
      return next(
        new ApiError(
          403,
          "FORBIDDEN",
          "You do not have permission to perform this action",
        ),
      );
    }
    return next();
  };
}

module.exports = { requireRole };
