class CommentRepository {
  constructor(pool) {
    this.pool = pool;
  }

  async listForTask(taskId, { limit, offset }) {
    const [rows] = await this.pool.execute(
      `SELECT c.id, c.task_id, c.author_id, u.name AS author_name, c.body,
              c.created_at, c.updated_at
       FROM comments c
       INNER JOIN users u ON u.id = c.author_id
       WHERE c.task_id = ?
       ORDER BY c.created_at ASC, c.id ASC
       LIMIT ? OFFSET ?`,
      [taskId, limit, offset],
    );
    return rows.map(mapComment);
  }

  async countForTask(taskId) {
    const [rows] = await this.pool.execute(
      "SELECT COUNT(*) AS total FROM comments WHERE task_id = ?",
      [taskId],
    );
    return Number(rows[0].total);
  }

  async findById(commentId) {
    const [rows] = await this.pool.execute(
      `SELECT c.id, c.task_id, c.author_id, u.name AS author_name, c.body,
              c.created_at, c.updated_at, t.project_id, p.owner_id, p.archived
       FROM comments c
       INNER JOIN users u ON u.id = c.author_id
       INNER JOIN tasks t ON t.id = c.task_id
       INNER JOIN projects p ON p.id = t.project_id
       WHERE c.id = ? AND t.deleted_at IS NULL`,
      [commentId],
    );
    if (rows.length === 0) {
      return null;
    }
    const row = rows[0];
    return {
      ...mapComment(row),
      projectId: String(row.project_id),
      ownerId: String(row.owner_id),
      archived: row.archived === 1 || row.archived === true || row.archived === "1",
    };
  }

  async create({ taskId, authorId, body }) {
    const [result] = await this.pool.execute(
      `INSERT INTO comments (task_id, author_id, body)
       SELECT t.id, ?, ?
       FROM tasks t
       INNER JOIN projects p ON p.id = t.project_id
       WHERE t.id = ? AND t.deleted_at IS NULL AND p.archived = 0`,
      [authorId, body, taskId],
    );
    return result.affectedRows === 0 ? null : String(result.insertId);
  }

  async update(commentId, body) {
    const [result] = await this.pool.execute(
      `UPDATE comments c
       INNER JOIN tasks t ON t.id = c.task_id
       INNER JOIN projects p ON p.id = t.project_id
       SET c.body = ?,
           c.updated_at = GREATEST(UTC_TIMESTAMP(3), c.updated_at + INTERVAL 1 MICROSECOND)
       WHERE c.id = ? AND t.deleted_at IS NULL AND p.archived = 0`,
      [body, commentId],
    );
    return result.affectedRows > 0;
  }

  async delete(commentId) {
    const [result] = await this.pool.execute(
      `DELETE c FROM comments c
       INNER JOIN tasks t ON t.id = c.task_id
       INNER JOIN projects p ON p.id = t.project_id
       WHERE c.id = ? AND t.deleted_at IS NULL AND p.archived = 0`,
      [commentId],
    );
    return result.affectedRows > 0;
  }
}

function mapComment(row) {
  return {
    id: String(row.id),
    taskId: String(row.task_id),
    authorId: String(row.author_id),
    authorName: row.author_name,
    body: row.body,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

function toIso(value) {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (value === null || value === undefined) {
    return null;
  }
  const text = String(value).replace(" ", "T");
  const utcValue = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(text)
    ? `${text}Z`
    : text;
  return new Date(utcValue).toISOString();
}

module.exports = { CommentRepository };
