
"use strict";

class NotificationRepository {
  constructor(pool) {
    this.pool = pool;
  }

  async create({
    userId,
    type,
    title,
    message,
    data = null,
  }) {
    const [result] = await this.pool.execute(
      `INSERT INTO notifications
       (user_id, type, title, message, data)
       VALUES (?, ?, ?, ?, ?)`,
      [
        userId,
        type,
        title,
        message,
        data === null ? null : JSON.stringify(data),
      ],
    );

    return this.findById(userId, result.insertId);
  }

  async findById(userId, notificationId) {
    const [rows] = await this.pool.execute(
      `SELECT id, user_id, type, title, message,
              data, is_read, read_at, created_at
       FROM notifications
       WHERE user_id = ? AND id = ?
       LIMIT 1`,
      [userId, notificationId],
    );

    return rows[0] || null;
  }

  async findByUser(userId, { page, limit }) {
    const offset = (page - 1) * limit;

    const [rows] = await this.pool.execute(
      `SELECT id, user_id, type, title, message,
              data, is_read, read_at, created_at
       FROM notifications
       WHERE user_id = ?
       ORDER BY created_at DESC, id DESC
       LIMIT ? OFFSET ?`,
      [userId, limit, offset],
    );

    const [countRows] = await this.pool.execute(
      `SELECT COUNT(*) AS total
       FROM notifications
       WHERE user_id = ?`,
      [userId],
    );

    return {
      rows,
      total: Number(countRows[0].total),
    };
  }

  async markAsRead(userId, notificationId) {
    const [result] = await this.pool.execute(
      `UPDATE notifications
       SET is_read = 1,
           read_at = COALESCE(read_at, CURRENT_TIMESTAMP(3))
       WHERE user_id = ? AND id = ?`,
      [userId, notificationId],
    );

    if (result.affectedRows === 0) {
      return this.findById(userId, notificationId);
    }

    return this.findById(userId, notificationId);
  }

  async markAllAsRead(userId) {
    const [result] = await this.pool.execute(
      `UPDATE notifications
       SET is_read = 1,
           read_at = COALESCE(read_at, CURRENT_TIMESTAMP(3))
       WHERE user_id = ? AND is_read = 0`,
      [userId],
    );

    return result.affectedRows;
  }

  async countUnread(userId) {
    const [rows] = await this.pool.execute(
      `SELECT COUNT(*) AS total
       FROM notifications
       WHERE user_id = ? AND is_read = 0`,
      [userId],
    );

    return Number(rows[0].total);
  }
}

module.exports = { NotificationRepository };
