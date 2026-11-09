const express = require("express");
const { asyncHandler } = require("../utils/asyncHandler");

function createAssignmentRouter({ assignmentService, requireAuth }) {
  const router = express.Router();

  router.patch(
    "/tasks/:id/assignment",
    requireAuth,
    asyncHandler(async (req, res) => {
      const task = await assignmentService.assign(req.params.id, req.body, req.user);
      res.status(200).json({ data: task });
    }),
  );

  return router;
}

module.exports = { createAssignmentRouter };
