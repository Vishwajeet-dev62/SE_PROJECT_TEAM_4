const express = require("express");
const { createAdminController } = require("../controllers/adminController");
const { requireRole } = require("../middleware/requireRole");
const { asyncHandler } = require("../utils/asyncHandler");

function createAdminRouter({ adminService, requireAuth }) {
  const router = express.Router();
  const controller = createAdminController(adminService);

  // Every admin route requires a logged-in ADMIN, checked on the server.
  router.use(requireAuth, requireRole("ADMIN"));

  router.get("/users", asyncHandler(controller.listUsers));
  router.patch("/users/:id/status", asyncHandler(controller.setStatus));
  router.patch("/users/:id/role", asyncHandler(controller.setRole));

  return router;
}

module.exports = { createAdminRouter };
