"use strict";

class AuditLogRepository {
  constructor(pool) {
    this.pool = pool;
  }

  async record({ userId, eventType, ipAddress, details }) {
    await this.pool.execute(
      `INSERT INTO audit_logs (user_id, event_type, ip_address, details)
       VALUES (?, ?, ?, ?)`,
      [userId, eventType, ipAddress, JSON.stringify(details)],
    );
  }
}

// Deletes one batch of old security events. Only the listed event types are
// removed, so other rows that share the table (task activity history) are
// never touched by the retention job.
AuditLogRepository.prototype.purgeOlderThan = async function purgeOlderThan({
  eventTypes,
  retentionDays,
  limit,
}) {
  if (!Array.isArray(eventTypes) || eventTypes.length === 0) {
    throw new Error("At least one event type is required");
  }
  if (!Number.isInteger(retentionDays) || retentionDays < 1) {
    throw new Error("retentionDays must be a positive integer");
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > 10000) {
    throw new Error("limit must be an integer from 1 to 10000");
  }

  const placeholders = eventTypes.map(() => "?").join(", ");
  const [result] = await this.pool.execute(
    `DELETE FROM audit_logs
     WHERE event_type IN (${placeholders})
       AND created_at < DATE_SUB(UTC_TIMESTAMP(3), INTERVAL ? DAY)
     ORDER BY id
     LIMIT ${limit}`,
    [...eventTypes, retentionDays],
  );
  return result.affectedRows;
};

module.exports = { AuditLogRepository };
