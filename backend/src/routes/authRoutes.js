const express = require("express");
const { createAuthController } = require("../controllers/authController");
const { asyncHandler } = require("../utils/asyncHandler");

function createAuthRouter({ authService, requireAuth }) {
  const router = express.Router();
  const controller = createAuthController(authService);

  router.post("/register", asyncHandler(controller.register));
  router.post("/login", asyncHandler(controller.login));
  router.post("/logout", requireAuth, asyncHandler(controller.logout));
  router.get("/me", requireAuth, asyncHandler(controller.me));

  return router;
}

module.exports = { createAuthRouter };
