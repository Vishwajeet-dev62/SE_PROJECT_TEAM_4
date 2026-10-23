const { ApiError } = require("../errors/apiError");

function errorHandler(error, req, res, next) {
  if (res.headersSent) {
    return next(error);
  }

  if (error instanceof SyntaxError && error.status === 400 && "body" in error) {
    return res.status(400).json({
      error: {
        code: "INVALID_JSON",
        message: "Request body must contain valid JSON",
      },
    });
  }

  if (error.type === "entity.too.large") {
    return res.status(413).json({
      error: {
        code: "REQUEST_TOO_LARGE",
        message: "Request body exceeds the 32 KB limit",
      },
    });
  }

  if (error instanceof ApiError) {
    const body = {
      code: error.code,
      message: error.message,
    };
    if (error.details !== undefined) {
      body.details = error.details;
    }
    return res.status(error.status).json({ error: body });
  }

  console.error(JSON.stringify({
    level: "error",
    requestId: req.requestId,
    message: "Unhandled request error",
  }));
  return res.status(500).json({
    error: {
      code: "INTERNAL_SERVER_ERROR",
      message: "An unexpected error occurred",
    },
  });
}

module.exports = { errorHandler };
