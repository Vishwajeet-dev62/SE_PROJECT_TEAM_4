class PasswordResetRepository {
  constructor(pool) {
    this.pool = pool;
  }

  // Only the newest link works: earlier unused links are retired first.
  async createToken({ userId, tokenHash, validMinutes }) {
    await this.pool.execute(
      `UPDATE password_reset_tokens
       SET used_at = UTC_TIMESTAMP(3)
       WHERE user_id = ? AND used_at IS NULL`,
      [userId],
    );
    await this.pool.execute(
      `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
       VALUES (?, ?, DATE_ADD(UTC_TIMESTAMP(3), INTERVAL ? MINUTE))`,
      [userId, tokenHash, validMinutes],
    );
  }

  // Marks the token used and sets the new password in one transaction. The
  // row lock makes concurrent attempts with the same link single-use.
  // Returns { userId } or null when the token is unknown, used or expired.
  async consumeAndSetPassword({ tokenHash, passwordHash }) {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const [rows] = await connection.execute(
        `SELECT id, user_id
         FROM password_reset_tokens
         WHERE token_hash = ?
           AND used_at IS NULL
           AND expires_at > UTC_TIMESTAMP(3)
         FOR UPDATE`,
        [tokenHash],
      );
      if (!rows[0]) {
        await connection.rollback();
        return null;
      }
      await connection.execute(
        "UPDATE password_reset_tokens SET used_at = UTC_TIMESTAMP(3) WHERE id = ?",
        [rows[0].id],
      );
      await connection.execute(
        `UPDATE users
         SET password_hash = ?,
             password_changed_at = UTC_TIMESTAMP(3),
             failed_attempts = 0, locked_until = NULL
         WHERE id = ?`,
        [passwordHash, rows[0].user_id],
      );
      await connection.commit();
      return { userId: String(rows[0].user_id) };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }
}

module.exports = { PasswordResetRepository };
