
"use strict";

const express = require("express");
const { asyncHandler } = require("../utils/asyncHandler");
const {
  createActivityController,
} = require("../controllers/activityController");

function createActivityRouter({ activityService, requireAuth }) {
  const router = express.Router();
  const controller = createActivityController(activityService);

  router.use(requireAuth);
  router.get("/:projectId/activity", asyncHandler(controller.list));

  return router;
}

module.exports = { createActivityRouter };
