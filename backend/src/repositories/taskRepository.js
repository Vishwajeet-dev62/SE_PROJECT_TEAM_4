
"use strict";

const { mapTask } = require("./projectRepository");

class TaskRepository {
  constructor(pool) {
    this.pool = pool;
  }

  async create({
    projectId,
    createdBy,
    assignedTo = null,
    categoryId = null,
    title,
    description = null,
    status = "TODO",
    priority = "MEDIUM",
    dueDate = null,
  }) {
    const [result] = await this.pool.execute(
      `INSERT INTO tasks (
         project_id, created_by, assigned_to, category_id,
         title, description, status, priority, due_date
       )
       SELECT p.id, ?, ?, ?, ?, ?, ?, ?, ?
       FROM projects p
       WHERE p.id = ? AND p.archived = 0`,
      [
        createdBy,
        assignedTo,
        categoryId,
        title,
        description,
        status,
        priority,
        dueDate,
        projectId,
      ],
    );

    return result.affectedRows === 0 ? null : String(result.insertId);
  }

  async findById(taskId, { includeDeleted = false } = {}) {
    const deletedCondition = includeDeleted
      ? ""
      : "AND t.deleted_at IS NULL";

    const [rows] = await this.pool.execute(
      `SELECT t.id, t.project_id, t.created_by, t.assigned_to,
              t.category_id, t.title, t.description, t.status,
              t.priority, t.due_date, t.deleted_at,
              t.created_at, t.updated_at,
              p.owner_id, p.archived
       FROM tasks t
       INNER JOIN projects p ON p.id = t.project_id
       WHERE t.id = ? ${deletedCondition}`,
      [taskId],
    );

    if (rows.length === 0) return null;

    const row = rows[0];

    return {
      ...mapTask(row),
      deletedAt: toIso(row.deleted_at),
      ownerId: String(row.owner_id),
      archived: row.archived === 1 ||
        row.archived === true ||
        row.archived === "1",
    };
  }

  async listForProject(projectId, {
    limit,
    offset,
    status,
    priority,
    assignedTo,
    search,
    dueBefore,
  }) {
    const conditions = [
      "t.project_id = ?",
      "t.deleted_at IS NULL",
    ];
    const values = [projectId];

    if (status !== undefined) {
      conditions.push("t.status = ?");
      values.push(status);
    }

    if (priority !== undefined) {
      conditions.push("t.priority = ?");
      values.push(priority);
    }

    if (assignedTo !== undefined) {
      conditions.push("t.assigned_to = ?");
      values.push(assignedTo);
    }

    if (search !== undefined && search !== "") {
      conditions.push("t.title LIKE ?");
      values.push(`%${escapeLike(search)}%`);
    }

    if (dueBefore !== undefined) {
      conditions.push("t.due_date IS NOT NULL AND t.due_date <= ?");
      values.push(dueBefore);
    }

    const [rows] = await this.pool.execute(
      `SELECT t.id, t.project_id, t.created_by, t.assigned_to,
              t.category_id, t.title, t.description, t.status,
              t.priority, t.due_date, t.created_at, t.updated_at
       FROM tasks t
       WHERE ${conditions.join(" AND ")}
       ORDER BY t.created_at DESC, t.id DESC
       LIMIT ? OFFSET ?`,
      [...values, limit, offset],
    );

    return rows.map(mapTask);
  }

  async countForProject(projectId, {
    status,
    priority,
    assignedTo,
    search,
    dueBefore,
  } = {}) {
    const conditions = [
      "t.project_id = ?",
      "t.deleted_at IS NULL",
    ];
    const values = [projectId];

    if (status !== undefined) {
      conditions.push("t.status = ?");
      values.push(status);
    }

    if (priority !== undefined) {
      conditions.push("t.priority = ?");
      values.push(priority);
    }

    if (assignedTo !== undefined) {
      conditions.push("t.assigned_to = ?");
      values.push(assignedTo);
    }

    if (search !== undefined && search !== "") {
      conditions.push("t.title LIKE ?");
      values.push(`%${escapeLike(search)}%`);
    }

    if (dueBefore !== undefined) {
      conditions.push("t.due_date IS NOT NULL AND t.due_date <= ?");
      values.push(dueBefore);
    }

    const [rows] = await this.pool.execute(
      `SELECT COUNT(*) AS total
       FROM tasks t
       WHERE ${conditions.join(" AND ")}`,
      values,
    );

    return Number(rows[0].total);
  }

  async update(taskId, changes, userId) {
    const columns = [];
    const values = [];

    const fieldMap = {
      assigned_to: "assigned_to",
      category_id: "category_id",
      title: "title",
      description: "description",
      status: "status",
      priority: "priority",
      due_date: "due_date",
    };

    for (const [field, column] of Object.entries(fieldMap)) {
      if (Object.hasOwn(changes, field)) {
        columns.push(`t.${column} = ?`);
        values.push(changes[field]);
      }
    }

    if (columns.length === 0) return false;

    columns.push(
      "t.updated_at = GREATEST(UTC_TIMESTAMP(3), t.updated_at + INTERVAL 1 MICROSECOND)",
    );

    values.push(taskId);

    const [result] = await this.pool.execute(
      `UPDATE tasks t
       INNER JOIN projects p ON p.id = t.project_id
       SET ${columns.join(", ")}
       WHERE t.id = ?
         AND t.deleted_at IS NULL
         AND p.archived = 0
         AND (t.created_by = ? OR t.assigned_to = ?)`,
      [...values, userId, userId],
    );

    return result.affectedRows > 0;
  }

  async softDelete(taskId) {
    const [result] = await this.pool.execute(
      `UPDATE tasks t
       INNER JOIN projects p ON p.id = t.project_id
       SET t.deleted_at = UTC_TIMESTAMP(3),
           t.updated_at = GREATEST(
             UTC_TIMESTAMP(3),
             t.updated_at + INTERVAL 1 MICROSECOND
           )
       WHERE t.id = ?
         AND t.deleted_at IS NULL
         AND p.archived = 0`,
      [taskId],
    );

    return result.affectedRows > 0;
  }

  async listTrashForProject(projectId, { limit, offset }) {
    const [rows] = await this.pool.execute(
      `SELECT t.id, t.project_id, t.created_by, t.assigned_to,
              t.category_id, t.title, t.description, t.status,
              t.priority, t.due_date, t.deleted_at,
              t.created_at, t.updated_at
       FROM tasks t
       WHERE t.project_id = ?
         AND t.deleted_at IS NOT NULL
         AND t.deleted_at >= UTC_TIMESTAMP(3) - INTERVAL 30 DAY
       ORDER BY t.deleted_at DESC, t.id DESC
       LIMIT ? OFFSET ?`,
      [projectId, limit, offset],
    );

    return rows.map((row) => ({
      ...mapTask(row),
      deletedAt: toIso(row.deleted_at),
    }));
  }

  async countTrashForProject(projectId) {
    const [rows] = await this.pool.execute(
      `SELECT COUNT(*) AS total
       FROM tasks
       WHERE project_id = ?
         AND deleted_at IS NOT NULL
         AND deleted_at >= UTC_TIMESTAMP(3) - INTERVAL 30 DAY`,
      [projectId],
    );

    return Number(rows[0].total);
  }

  async restore(taskId) {
    const [result] = await this.pool.execute(
      `UPDATE tasks t
       INNER JOIN projects p ON p.id = t.project_id
       SET t.deleted_at = NULL,
           t.updated_at = GREATEST(
             UTC_TIMESTAMP(3),
             t.updated_at + INTERVAL 1 MICROSECOND
           )
       WHERE t.id = ?
         AND t.deleted_at IS NOT NULL
         AND t.deleted_at >= UTC_TIMESTAMP(3) - INTERVAL 30 DAY
         AND p.archived = 0`,
      [taskId],
    );

    return result.affectedRows > 0;
  }
}

function escapeLike(value) {
  return String(value).replace(/[\\%_]/g, "\\$&");
}

function toIso(value) {
  if (value instanceof Date) return value.toISOString();
  if (value === null || value === undefined) return null;

  const text = String(value).replace(" ", "T");
  const utcValue =
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(text)
      ? `${text}Z`
      : text;

  return new Date(utcValue).toISOString();
}

module.exports = { TaskRepository };
