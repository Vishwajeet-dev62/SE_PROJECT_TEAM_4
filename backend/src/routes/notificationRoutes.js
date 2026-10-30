
"use strict";

const express = require("express");
const { asyncHandler } = require("../utils/asyncHandler");
const {
  createNotificationController,
} = require("../controllers/notificationController");

function createNotificationRouter({ notificationService, requireAuth }) {
  const router = express.Router();
  const controller = createNotificationController(notificationService);

  router.use(requireAuth);

  router.get("/", asyncHandler(controller.list));
  router.get("/unread-count", asyncHandler(controller.countUnread));
  router.patch("/read-all", asyncHandler(controller.markAllAsRead));
  router.patch("/:id/read", asyncHandler(controller.markAsRead));

  return router;
}

module.exports = { createNotificationRouter };
