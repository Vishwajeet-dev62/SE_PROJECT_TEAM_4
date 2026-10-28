"use strict";

class TokenRevocationRepository {
  constructor(pool) {
    this.pool = pool;
  }

  async revoke({ tokenId, userId, expiresAt }) {
    await this.pool.execute(
      "DELETE FROM revoked_tokens WHERE expires_at <= UTC_TIMESTAMP(3)",
    );
    await this.pool.execute(
      `INSERT INTO revoked_tokens (token_id, user_id, expires_at)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE token_id = VALUES(token_id)`,
      [tokenId, userId, expiresAt],
    );
  }

  async isRevoked(tokenId) {
    const [rows] = await this.pool.execute(
      `SELECT 1 FROM revoked_tokens
       WHERE token_id = ? AND expires_at > UTC_TIMESTAMP(3)
       LIMIT 1`,
      [tokenId],
    );
    return rows.length > 0;
  }
}

module.exports = { TokenRevocationRepository };
