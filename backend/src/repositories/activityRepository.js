
"use strict";

class ActivityRepository {
  constructor(pool) {
    this.pool = pool;
  }

  async create({
    projectId,
    userId,
    eventType,
    details = {},
  }) {
    const [result] = await this.pool.execute(
      `INSERT INTO audit_logs
         (user_id, project_id, event_type, details)
       VALUES (?, ?, ?, ?)`,
      [
        userId,
        projectId,
        eventType,
        JSON.stringify(details),
      ],
    );

    return String(result.insertId);
  }

  async listForProject(projectId, { limit, offset }) {
    const [rows] = await this.pool.execute(
      `SELECT
         al.id,
         al.project_id,
         al.user_id,
         u.name AS actor_name,
         al.event_type,
         al.details,
         al.created_at
       FROM audit_logs al
       LEFT JOIN users u ON u.id = al.user_id
       WHERE al.project_id = ?
       ORDER BY al.created_at DESC, al.id DESC
       LIMIT ? OFFSET ?`,
      [projectId, limit, offset],
    );

    return rows.map((row) => ({
      id: String(row.id),
      projectId: String(row.project_id),
      userId: row.user_id === null ? null : String(row.user_id),
      actorName: row.actor_name || "Former user",
      eventType: row.event_type,
      details: parseDetails(row.details),
      createdAt: row.created_at,
    }));
  }

  async countForProject(projectId) {
    const [rows] = await this.pool.execute(
      `SELECT COUNT(*) AS total
       FROM audit_logs
       WHERE project_id = ?`,
      [projectId],
    );

    return Number(rows[0].total);
  }
}

function parseDetails(details) {
  if (typeof details === "string") {
    try {
      details = JSON.parse(details);
    } catch {
      return {};
    }
  }

  if (
    details !== null &&
    typeof details === "object" &&
    !Array.isArray(details)
  ) {
    return details;
  }

  return {};
}

module.exports = { ActivityRepository };
