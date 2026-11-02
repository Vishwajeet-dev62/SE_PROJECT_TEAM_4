const express = require("express");
const { asyncHandler } = require("../utils/asyncHandler");
const {
  validateForgotPassword,
  validateResetPassword,
} = require("../validators/passwordResetValidators");

function createPasswordResetRouter({ passwordResetService }) {
  const router = express.Router();

  router.post(
    "/forgot-password",
    asyncHandler(async (req, res) => {
      await passwordResetService.requestReset(validateForgotPassword(req.body), {
        ip: req.ip,
      });
      res.status(202).json({
        data: {
          message: "If an account exists for that email, a reset link has been sent.",
        },
      });
    }),
  );

  router.post(
    "/reset-password",
    asyncHandler(async (req, res) => {
      await passwordResetService.resetPassword(validateResetPassword(req.body), {
        ip: req.ip,
      });
      res.status(200).json({ data: { message: "Password has been reset." } });
    }),
  );

  return router;
}

module.exports = { createPasswordResetRouter };
