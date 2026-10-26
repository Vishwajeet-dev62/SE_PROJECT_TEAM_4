
"use strict";

const express = require("express");
const { createTaskServiceController } = require("../controllers/taskServiceController");
const { asyncHandler } = require("../utils/asyncHandler");

function createTaskServiceRouter({ taskService, requireAuth }) {
  const router = express.Router();
  const controller = createTaskServiceController(taskService);

  // All task endpoints require authentication.
  router.use(requireAuth);

  // Project-scoped task collection.
  router.get("/projects/:projectId/tasks/trash", asyncHandler(controller.trash));
  router.get("/projects/:projectId/tasks", asyncHandler(controller.list));
  router.post("/projects/:projectId/tasks", asyncHandler(controller.create));

  // Individual task endpoints.
  router.get("/tasks/:id", asyncHandler(controller.get));
  router.patch("/tasks/:id", asyncHandler(controller.update));
  router.delete("/tasks/:id", asyncHandler(controller.delete));
  router.post("/tasks/:id/restore", asyncHandler(controller.restore));

  return router;
}

module.exports = { createTaskServiceRouter };
