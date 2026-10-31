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

module.exports = { AuditLogRepository };
