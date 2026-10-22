const { asyncHandler } = require("../utils/asyncHandler");
const { ApiError } = require("../errors/apiError");
const { validateCommentBody } = require("../services/commentService");

function createCommentRouter({ express, commentService, requireAuth }) {
  const router = express.Router();

  router.get("/tasks/:id/comments", requireAuth, asyncHandler(async (req, res) => {
    res.status(200).json(
      await commentService.list(req.params.id, req.user, req.query),
    );
  }));
  router.post("/tasks/:id/comments", requireAuth, asyncHandler(async (req, res) => {
    const body = requireCommentBody(req.body);
    const comment = await commentService.create(req.params.id, body, req.user);
    res.status(201).json({ data: comment });
  }));
  router.patch("/comments/:id", requireAuth, asyncHandler(async (req, res) => {
    const body = requireCommentBody(req.body);
    const comment = await commentService.update(req.params.id, body, req.user);
    res.status(200).json({ data: comment });
  }));
  router.delete("/comments/:id", requireAuth, asyncHandler(async (req, res) => {
    await commentService.delete(req.params.id, req.user);
    res.status(204).end();
  }));

  return router;
}

function requireCommentBody(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new ApiError(400, "VALIDATION_ERROR", "Request body must be a JSON object");
  }
  const allowed = new Set(["body"]);
  const unknown = Object.keys(body).filter((key) => !allowed.has(key));
  if (unknown.length > 0) {
    throw new ApiError(400, "VALIDATION_ERROR", "Request contains unsupported fields", {
      fields: unknown,
    });
  }
  return validateCommentBody(body.body);
}

module.exports = { createCommentRouter, requireCommentBody };
