const express = require("express");
const { createAuthController } = require("../controllers/authController");
const { asyncHandler } = require("../utils/asyncHandler");

function createAuthRouter({ authService }) {
  const router = express.Router();
  const controller = createAuthController(authService);

  router.post("/register", asyncHandler(controller.register));
  router.post("/login", asyncHandler(controller.login));

  return router;
}

module.exports = { createAuthRouter };
