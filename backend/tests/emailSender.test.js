"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { createSmtpEmailSender } = require("../src/services/emailSender");

test("SMTP sender creates a transporter with the configured credentials", () => {
  let transportConfig;

  createSmtpEmailSender(
    {
      host: "smtp.example.com",
      port: 465,
      secure: true,
      user: "sender@example.com",
      pass: "test-password",
      from: "sender@example.com",
    },
    {
      createTransport(config) {
        transportConfig = config;
        return { sendMail: async () => ({ messageId: "test-id" }) };
      },
    },
  );

  assert.deepEqual(transportConfig, {
    host: "smtp.example.com",
    port: 465,
    secure: true,
    auth: {
      user: "sender@example.com",
      pass: "test-password",
    },
  });
});

test("SMTP sender sends a password-reset email with escaped HTML", async () => {
  let sentMessage;

  const sender = createSmtpEmailSender(
    {
      host: "smtp.example.com",
      port: 465,
      secure: true,
      user: "sender@example.com",
      pass: "test-password",
      from: "sender@example.com",
    },
    {
      createTransport() {
        return {
          async sendMail(message) {
            sentMessage = message;
          },
        };
      },
    },
  );

  const resetUrl = "http://localhost:5173/reset-password?token=abc&next=home";

  await sender.sendPasswordReset({
    to: "recipient@example.com",
    name: "<script>alert('x')</script>",
    resetUrl,
    expiresInMinutes: 30,
  });

  assert.equal(sentMessage.from, "sender@example.com");
  assert.equal(sentMessage.to, "recipient@example.com");
  assert.equal(sentMessage.subject, "Reset your Task Manager password");

  assert.ok(sentMessage.text.includes(resetUrl));
  assert.ok(sentMessage.html.includes("&lt;script&gt;"));
  assert.ok(!sentMessage.html.includes("<script>"));
  assert.ok(sentMessage.html.includes("&amp;next=home"));
  assert.ok(sentMessage.html.includes("30 minutes"));
});

test("SMTP sender propagates email delivery failures", async () => {
  const sender = createSmtpEmailSender(
    {
      host: "smtp.example.com",
      port: 465,
      secure: true,
      user: "sender@example.com",
      pass: "test-password",
      from: "sender@example.com",
    },
    {
      createTransport() {
        return {
          async sendMail() {
            throw new Error("SMTP delivery failed");
          },
        };
      },
    },
  );

  await assert.rejects(
    sender.sendPasswordReset({
      to: "recipient@example.com",
      resetUrl: "http://localhost:5173/reset-password?token=test",
    }),
    /SMTP delivery failed/,
  );
});
