const { rateLimit } = require("express-rate-limit");

// SRS TM-SR-006: login and password-reset endpoints allow 10 requests per
// minute per IP; the 11th returns 429 in the contract's error format.
const DEFAULT_AUTH_LIMIT = Object.freeze({ windowMs: 60 * 1000, limit: 10 });

function createRateLimiter({
  windowMs = DEFAULT_AUTH_LIMIT.windowMs,
  limit = DEFAULT_AUTH_LIMIT.limit,
} = {}) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    handler: (_req, res) => {
      res.status(429).json({
        error: {
          code: "TOO_MANY_REQUESTS",
          message: "Too many requests. Please try again later.",
        },
      });
    },
  });
}

module.exports = { DEFAULT_AUTH_LIMIT, createRateLimiter };
