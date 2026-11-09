// TEMPORARY until Member 1's notification service can send real email
// (contract section 10). Both senders implement the same interface:
//   sendPasswordReset({ to, name, resetUrl, expiresInMinutes })
// The integration contract requires this to be replaced before the
// password-reset feature is marked complete.

// Development only: prints the link so the flow can be tried locally.
function createDevEmailSender(logger = console) {
  return {
    async sendPasswordReset({ to, resetUrl }) {
      logger.info(`[DEV EMAIL] Password reset for ${to}: ${resetUrl}`);
    },
  };
}

// Production fallback: never prints the link, only that nothing was sent.
function createUnconfiguredEmailSender(logger = console) {
  return {
    async sendPasswordReset() {
      logger.warn("Email delivery is not configured; password reset email not sent");
    },
  };
}

module.exports = { createDevEmailSender, createUnconfiguredEmailSender };
