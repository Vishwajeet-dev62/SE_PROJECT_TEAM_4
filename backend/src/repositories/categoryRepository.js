"use strict";

class CategoryRepository {
  constructor(pool) {
    this.pool = pool;
  }

  async listForProject(projectId) {
    const [rows] = await this.pool.execute(
      `SELECT id, project_id, name, created_at, updated_at
       FROM categories
       WHERE project_id = ?
       ORDER BY name ASC, id ASC`,
      [projectId],
    );

    return rows.map(mapCategory);
  }

  async findById(projectId, categoryId) {
    const [rows] = await this.pool.execute(
      `SELECT id, project_id, name, created_at, updated_at
       FROM categories
       WHERE project_id = ? AND id = ?`,
      [projectId, categoryId],
    );

    return rows.length === 0 ? null : mapCategory(rows[0]);
  }

  async existsForProject(projectId, categoryId) {
    const [rows] = await this.pool.execute(
      `SELECT id
       FROM categories
       WHERE project_id = ? AND id = ?
       LIMIT 1`,
      [projectId, categoryId],
    );

    return rows.length > 0;
  }

  async create(projectId, name) {
    const [result] = await this.pool.execute(
      `INSERT INTO categories (project_id, name)
       SELECT id, ?
       FROM projects
       WHERE id = ? AND is_archived = 0`,
      [name, projectId],
    );

    return result.affectedRows === 0 ? null : String(result.insertId);
  }

  async update(projectId, categoryId, name) {
    const [result] = await this.pool.execute(
      `UPDATE categories c
       INNER JOIN projects p ON p.id = c.project_id
       SET c.name = ?
       WHERE c.project_id = ?
         AND c.id = ?
         AND p.is_archived = 0`,
      [name, projectId, categoryId],
    );

    if (result.affectedRows === 0) {
      // An unchanged name can also produce zero affected rows.
      return this.findById(projectId, categoryId);
    }

    return this.findById(projectId, categoryId);
  }

  async delete(projectId, categoryId) {
    const connection = await this.pool.getConnection();

    try {
      await connection.beginTransaction();

      const [categories] = await connection.execute(
        `SELECT c.id
         FROM categories c
         INNER JOIN projects p ON p.id = c.project_id
         WHERE c.project_id = ?
           AND c.id = ?
           AND p.is_archived = 0
         FOR UPDATE`,
        [projectId, categoryId],
      );

      if (categories.length === 0) {
        await connection.rollback();
        return false;
      }

      // Remove the category reference from active and deleted tasks.
      await connection.execute(
        `UPDATE tasks
         SET category_id = NULL
         WHERE project_id = ? AND category_id = ?`,
        [projectId, categoryId],
      );

      const [result] = await connection.execute(
        `DELETE FROM categories
         WHERE project_id = ? AND id = ?`,
        [projectId, categoryId],
      );

      if (result.affectedRows === 0) {
        await connection.rollback();
        return false;
      }

      await connection.commit();
      return true;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }
}

function mapCategory(row) {
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

module.exports = { CategoryRepository };