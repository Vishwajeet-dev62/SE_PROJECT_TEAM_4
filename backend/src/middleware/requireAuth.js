
const jwt = require("jsonwebtoken");
const { ApiError } = require("../errors/apiError");
const { parseId } = require("../utils/ids");

function createRequireAuth({
  jwtSecret,
  userRepository,
  tokenRevocationRepository,
}) {
  if (typeof jwtSecret !== "string" || jwtSecret.length < 32) {
    throw new Error("A strong JWT secret is required for authentication");
  }

  if (!userRepository || typeof userRepository.findById !== "function") {
    throw new Error("A user repository is required for authentication");
  }
  if (
    !tokenRevocationRepository ||
    typeof tokenRevocationRepository.isRevoked !== "function"
  ) {
    throw new Error("A token revocation repository is required for authentication");
  }

  return async function requireAuth(req, _res, next) {
    const authorization = req.headers.authorization;

    if (
      typeof authorization !== "string" ||
      !authorization.startsWith("Bearer ")
    ) {
      return next(
        new ApiError(401, "UNAUTHENTICATED", "Authentication is required"),
      );
    }

    const token = authorization.slice("Bearer ".length).trim();

    if (!token) {
      return next(
        new ApiError(401, "INVALID_TOKEN", "Authentication token is invalid"),
      );
    }

    let payload;

    try {
      payload = jwt.verify(token, jwtSecret, {
        algorithms: ["HS256"],
      });

      if (
        !payload ||
        typeof payload !== "object" ||
        typeof payload.sub !== "string" ||
        typeof payload.jti !== "string" ||
        !Number.isSafeInteger(payload.exp)
      ) {
        throw new Error("Invalid token claims");
      }

      parseId(payload.sub, "user id");
    } catch {
      return next(
        new ApiError(
          401,
          "INVALID_TOKEN",
          "Authentication token is invalid or expired",
        ),
      );
    }

    try {
      if (await tokenRevocationRepository.isRevoked(payload.jti)) {
        return next(
          new ApiError(401, "SESSION_REVOKED", "Authentication session has ended"),
        );
      }

      const user = await userRepository.findById(payload.sub);

      if (
        !user ||
        !user.active ||
        !["ADMIN", "MEMBER"].includes(user.role)
      ) {
        return next(
          new ApiError(
            401,
            "UNAUTHENTICATED",
            "User is unavailable or inactive",
          ),
        );
      }

      req.user = {
        id: parseId(user.id, "user id"),
        role: user.role,
      };
      req.auth = {
        tokenId: payload.jti,
        expiresAt: payload.exp,
      };

      return next();
    } catch (error) {
      if (error instanceof ApiError) {
        return next(error);
      }

      return next(error);
    }
  };
}

module.exports = { createRequireAuth };
