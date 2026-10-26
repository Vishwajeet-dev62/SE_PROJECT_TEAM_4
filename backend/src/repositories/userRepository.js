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
        throw new ApiError(409, "EMAIL_EXISTS", "An account with this email already exists");
      }
      throw error;
    }
  }

  async findByEmail(email) {
    const [rows] = await this.pool.execute(
      `SELECT id, name, email, password_hash, role, active,
              failed_attempts, locked_until, created_at, updated_at
       FROM users WHERE email = ?`,
      [email],
    );
    return rows[0] ? mapUser(rows[0]) : null;
  }

  async findById(id) {
    const [rows] = await this.pool.execute(
      `SELECT id, name, email, password_hash, role, active,
              failed_attempts, locked_until, created_at, updated_at
       FROM users WHERE id = ?`,
      [id],
    );
    return rows[0] ? mapUser(rows[0]) : null;
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

// Never send the hash or lockout counters to clients.
function toPublicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt,
  };
}

module.exports = { UserRepository, toPublicUser };
