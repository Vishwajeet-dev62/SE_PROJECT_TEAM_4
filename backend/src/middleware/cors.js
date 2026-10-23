function createCorsMiddleware(allowedOrigins) {
  const allowed = new Set(allowedOrigins);

  return function cors(req, res, next) {
    const origin = req.get("Origin");

    if (origin && allowed.has(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
    }

    if (req.method === "OPTIONS") {
      return res.sendStatus(origin && !allowed.has(origin) ? 403 : 204);
    }

    return next();
  };
}

module.exports = { createCorsMiddleware };
