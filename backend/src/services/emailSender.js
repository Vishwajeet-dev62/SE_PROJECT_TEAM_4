
"use strict";

const nodemailer = require("nodemailer");

// Development fallback: prints the reset link for local testing only.
function createDevEmailSender(logger = console) {
  return {
    async sendPasswordReset({ to, resetUrl }) {
      logger.info(`[DEV EMAIL] Password reset for ${to}: ${resetUrl}`);
    },
  };
}

// Production fallback: never exposes the reset link.
function createUnconfiguredEmailSender(logger = console) {
  return {
    async sendPasswordReset() {
      logger.warn(
        "Email delivery is not configured; password reset email not sent",
      );
    },
  };
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };

    return entities[character];
  });
}

// SMTP sender: creates one reusable Nodemailer transport.
function createSmtpEmailSender(
  config,
  { createTransport = nodemailer.createTransport } = {},
) {
  const transporter = createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.user,
      pass: config.pass,
    },
  });

  return {
    async sendPasswordReset({
      to,
      name,
      resetUrl,
      expiresInMinutes = 30,
    }) {
      const safeName = escapeHtml(name || "there");
      const safeResetUrl = escapeHtml(resetUrl);

      await transporter.sendMail({
        from: config.from,
        to,
        subject: "Reset your Task Manager password",
        text: [
          `Hello ${name || "there"},`,
          "",
          "We received a request to reset your Task Manager password.",
          "",
          `Use this link to reset your password: ${resetUrl}`,
          "",
          `This link expires in ${expiresInMinutes} minutes.`,
          "If you did not request this, you can ignore this email.",
        ].join("\n"),
        html: `
          <p>Hello ${safeName},</p>
          <p>We received a request to reset your Task Manager password.</p>
          <p>
            <a href="${safeResetUrl}">Reset your password</a>
          </p>
          <p>This link expires in ${expiresInMinutes} minutes.</p>
          <p>If you did not request this, you can ignore this email.</p>
        `,
      });
    },
  };
}

module.exports = {
  createDevEmailSender,
  createUnconfiguredEmailSender,
  createSmtpEmailSender,
};
