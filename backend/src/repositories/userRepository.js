
const { ApiError } = require("../errors/apiError");

const DUPLICATE_KEY = "ER_DUP_ENTRY";

class UserRepository {
  constructor(pool) {
    this.pool = pool;
  }

  async create({ name, email, passwordHash }) {
    try {
      const [result] = await this.pool.execute(
        `INSERT INTO users (name, email, password_hash)
         VALUES (?, ?, ?)`,
        [name, email, passwordHash],
      );

      return this.findById(String(result.insertId));
    } catch (error) {
      if (error.code === DUPLICATE_KEY) {
        throw new ApiError(
          409,
          "EMAIL_EXISTS",
          "An account with this email already exists",
        );
      }

      throw error;
    }
  }

  async findByEmail(email) {
    const [rows] = await this.pool.execute(
      `SELECT id, name, email, password_hash, role,
              active,
              failed_attempts,
              locked_until, created_at, updated_at
       FROM users
       WHERE email = ?`,
      [email],
    );

    return rows[0] ? mapUser(rows[0]) : null;
  }

  async findById(id) {
    const [rows] = await this.pool.execute(
      `SELECT id, name, email, password_hash, role,
              active,
              failed_attempts,
              locked_until, created_at, updated_at
       FROM users
       WHERE id = ?`,
      [id],
    );

    return rows[0] ? mapUser(rows[0]) : null;
  }

  async isLocked(id) {
    const [rows] = await this.pool.execute(
      `SELECT 1
       FROM users
       WHERE id = ?
         AND locked_until IS NOT NULL
         AND locked_until > UTC_TIMESTAMP(3)
       LIMIT 1`,
      [id],
    );

    return rows.length > 0;
  }

  async recordFailedLogin(id, maxAttempts = 5, lockoutMinutes = 15) {
    await this.pool.execute(
      `UPDATE users
       SET failed_attempts = CASE
             WHEN locked_until IS NOT NULL
                  AND locked_until <= UTC_TIMESTAMP(3)
               THEN 1
             ELSE failed_attempts + 1
           END,
           locked_until = CASE
             WHEN (
               CASE
                 WHEN locked_until IS NOT NULL
                      AND locked_until <= UTC_TIMESTAMP(3)
                   THEN 1
                 ELSE failed_attempts + 1
               END
             ) >= ?
               THEN DATE_ADD(
                 UTC_TIMESTAMP(3),
                 INTERVAL ? MINUTE
               )
             WHEN locked_until IS NOT NULL
                  AND locked_until <= UTC_TIMESTAMP(3)
               THEN NULL
             ELSE locked_until
           END
       WHERE id = ?`,
      [maxAttempts, lockoutMinutes, id],
    );
  }

  async resetFailedLogins(id) {
    await this.pool.execute(
      `UPDATE users
       SET failed_attempts = 0,
           locked_until = NULL
       WHERE id = ?`,
      [id],
    );
  }
  async listAll({ limit, offset }) {
    const [rows] = await this.pool.execute(
      `SELECT id, name, email, role, active, locked_until, created_at
       FROM users
       ORDER BY id ASC
       LIMIT ? OFFSET ?`,
      [limit, offset],
    );
    const [countRows] = await this.pool.execute(
      "SELECT COUNT(*) AS total FROM users",
    );
    return {
      rows: rows.map((row) => ({
        id: String(row.id),
        name: row.name,
        email: row.email,
        role: row.role,
        active: Boolean(row.active),
        lockedUntil: row.locked_until,
        createdAt: row.created_at,
      })),
      total: Number(countRows[0].total),
    };
  }

  async setRole(id, role) {
    await this.pool.execute("UPDATE users SET role = ? WHERE id = ?", [role, id]);
  }

  async setActive(id, active) {
    await this.pool.execute(
      "UPDATE users SET active = ? WHERE id = ?",
      [active ? 1 : 0, id],
    );
  }

}

function mapUser(row) {
  return {
    id: String(row.id),
    name: row.name,
    email: row.email,
    passwordHash: row.password_hash,
    role: row.role,
    active: Boolean(row.active),
    failedAttempts: Number(row.failed_attempts),
    lockedUntil: row.locked_until,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toPublicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt,
  };
}

// Admin views add account state but still never expose the hash.
function toAdminUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    active: user.active,
    lockedUntil: user.lockedUntil ?? null,
    createdAt: user.createdAt,
  };
}

module.exports = { UserRepository, toAdminUser, toPublicUser };
