const { ApiError } = require("../errors/apiError");

function authenticationUnavailable(_req, _res, next) {
  next(new ApiError(
    503,
    "AUTHENTICATION_UNAVAILABLE",
    "Authentication integration is not configured",
  ));
}

module.exports = { authenticationUnavailable };
