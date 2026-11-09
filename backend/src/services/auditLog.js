"use strict";

// Security and administrative events only (contract section 3.5).
// User-visible task history belongs in the activity log, not here.
const AUDIT_EVENTS = Object.freeze({
  USER_REGISTERED: "USER_REGISTERED",
  LOGIN_SUCCESS: "LOGIN_SUCCESS",
  LOGIN_FAILED: "LOGIN_FAILED",
  ACCOUNT_LOCKED: "ACCOUNT_LOCKED",
  LOGOUT: "LOGOUT",
  PASSWORD_RESET_REQUESTED: "PASSWORD_RESET_REQUESTED",
  PASSWORD_RESET_COMPLETED: "PASSWORD_RESET_COMPLETED",
  ROLE_CHANGED: "ROLE_CHANGED",
  USER_STATUS_CHANGED: "USER_STATUS_CHANGED",
  TASK_DELETED: "TASK_DELETED",
});

const KNOWN_EVENTS = new Set(Object.values(AUDIT_EVENTS));
const SENSITIVE_KEY = /pass(word)?|token|secret|authorization|hash/i;
const MAX_IP_LENGTH = 45; // audit_logs.ip_address is VARCHAR(45)

function sanitizeDetails(details) {
  if (!details || typeof details !== "object" || Array.isArray(details)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(details).filter(([key]) => !SENSITIVE_KEY.test(key)),
  );
}

// Returns auditLog({ userId, eventType, ip, details }), the shared interface
// from the integration contract. Writing the log is best effort: a failure is
// reported without sensitive data and never breaks the request being audited.
function createAuditLog(auditLogRepository, logger = console) {
  if (!auditLogRepository || typeof auditLogRepository.record !== "function") {
    throw new Error("An audit log repository is required");
  }

  return async function auditLog({
    userId = null,
    eventType,
    ip = null,
    details = {},
  }) {
    if (!KNOWN_EVENTS.has(eventType)) {
      throw new Error(`Unknown audit event type: ${eventType}`);
    }

    try {
      await auditLogRepository.record({
        userId,
        eventType,
        ipAddress: typeof ip === "string" ? ip.slice(0, MAX_IP_LENGTH) : null,
        details: sanitizeDetails(details),
      });
    } catch {
      logger.error(
        JSON.stringify({
          level: "error",
          message: "Failed to write audit log",
          eventType,
        }),
      );
    }
  };
}

module.exports = { AUDIT_EVENTS, createAuditLog };
