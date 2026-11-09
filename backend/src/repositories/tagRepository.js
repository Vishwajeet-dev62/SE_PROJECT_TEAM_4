"use strict";

class TagRepository {
  constructor(pool) {
    this.pool = pool;
  }

  async listForProject(projectId) {
    const [rows] = await this.pool.execute(
      `SELECT id, project_id, name, created_at, updated_at
       FROM tags
       WHERE project_id = ?
       ORDER BY name ASC, id ASC`,
      [projectId],
    );

    return rows.map(mapTag);
  }

  async findById(projectId, tagId) {
    const [rows] = await this.pool.execute(
      `SELECT id, project_id, name, created_at, updated_at
       FROM tags
       WHERE project_id = ? AND id = ?`,
      [projectId, tagId],
    );

    return rows.length === 0 ? null : mapTag(rows[0]);
  }

  async existsForProject(projectId, tagId) {
    const [rows] = await this.pool.execute(
      `SELECT id
       FROM tags
       WHERE project_id = ? AND id = ?
       LIMIT 1`,
      [projectId, tagId],
    );

    return rows.length > 0;
  }

  async create(projectId, name) {
    const [result] = await this.pool.execute(
      `INSERT INTO tags (project_id, name)
       SELECT id, ?
       FROM projects
       WHERE id = ? AND is_archived = 0`,
      [name, projectId],
    );

    return result.affectedRows === 0
      ? null
      : String(result.insertId);
  }

  async update(projectId, tagId, name) {
    await this.pool.execute(
      `UPDATE tags t
       INNER JOIN projects p ON p.id = t.project_id
       SET t.name = ?
       WHERE t.project_id = ?
         AND t.id = ?
         AND p.is_archived = 0`,
      [name, projectId, tagId],
    );

    return this.findById(projectId, tagId);
  }

  async delete(projectId, tagId) {
    const [result] = await this.pool.execute(
      `DELETE t
       FROM tags t
       INNER JOIN projects p ON p.id = t.project_id
       WHERE t.project_id = ?
         AND t.id = ?
         AND p.is_archived = 0`,
      [projectId, tagId],
    );

    // task_tags rows are automatically deleted by the FK cascade.
    return result.affectedRows > 0;
  }
}

function mapTag(row) {
  return {
    id: String(row.id),
    projectId: String(row.project_id),
    name: row.name,
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

  const utcValue =
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(text)
      ? `${text}Z`
      : text;

  return new Date(utcValue).toISOString();
}

module.exports = { TagRepository };