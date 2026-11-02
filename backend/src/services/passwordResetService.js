const crypto = require("node:crypto");
const bcrypt = require("bcryptjs");
const { ApiError } = require("../errors/apiError");
const { AUDIT_EVENTS } = require("./auditLog");

const TOKEN_VALID_MINUTES = 30; // SRS TM-F-004

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

class PasswordResetService {
  constructor({
    passwordResetRepository,
    userRepository,
    emailSender,
    auditLog = async () => {},
    resetUrlBase,
    bcryptCost = 12,
    logger = console,
  }) {
    this.passwordResetRepository = passwordResetRepository;
    this.userRepository = userRepository;
    this.emailSender = emailSender;
    this.auditLog = auditLog;
    this.resetUrlBase = resetUrlBase;
    this.bcryptCost = bcryptCost;
    this.logger = logger;
  }

  // Always completes the same way, so the response never reveals whether an
  // account exists for the email.
  async requestReset({ email }, context = {}) {
    const user = await this.userRepository.findByEmail(email);

    if (!user || !user.active) {
      await this.auditLog({
        eventType: AUDIT_EVENTS.PASSWORD_RESET_REQUESTED,
        ip: context.ip,
        details: { reason: "unknown_or_inactive" },
      });
      return;
    }

    const token = crypto.randomBytes(32).toString("hex");
    await this.passwordResetRepository.createToken({
      userId: user.id,
      tokenHash: hashToken(token),
      validMinutes: TOKEN_VALID_MINUTES,
    });

    try {
      await this.emailSender.sendPasswordReset({
        to: user.email,
        name: user.name,
        resetUrl: `${this.resetUrlBase}?token=${token}`,
        expiresInMinutes: TOKEN_VALID_MINUTES,
      });
    } catch {
      // Delivery problems must not change the response; never log the link.
      this.logger.error("Password reset email could not be sent");
    }

    await this.auditLog({
      userId: user.id,
      eventType: AUDIT_EVENTS.PASSWORD_RESET_REQUESTED,
      ip: context.ip,
    });
  }

  async resetPassword({ token, newPassword }, context = {}) {
    const passwordHash = await bcrypt.hash(newPassword, this.bcryptCost);
    const result = await this.passwordResetRepository.consumeAndSetPassword({
      tokenHash: hashToken(token),
      passwordHash,
    });

    if (!result) {
      throw new ApiError(
        400,
        "INVALID_RESET_TOKEN",
        "This reset link is invalid or has expired",
      );
    }

    await this.auditLog({
      userId: result.userId,
      eventType: AUDIT_EVENTS.PASSWORD_RESET_COMPLETED,
      ip: context.ip,
    });
  }
}

module.exports = { PasswordResetService, TOKEN_VALID_MINUTES, hashToken };
