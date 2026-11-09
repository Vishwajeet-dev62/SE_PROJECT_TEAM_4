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
    tagIds = [],
    title,
    description = null,
    status = "TODO",
    priority = "MEDIUM",
    dueDate = null,
  }) {
    const connection = await this.pool.getConnection();

    try {
      await connection.beginTransaction();

      const [result] = await connection.execute(
        `INSERT INTO tasks (
           project_id, created_by, assigned_to, category_id,
           title, description, status, priority, due_date
         )
         SELECT p.id, ?, ?, ?, ?, ?, ?, ?, ?
         FROM projects p
         WHERE p.id = ? AND p.is_archived = 0`,
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

      if (result.affectedRows === 0) {
        await connection.rollback();
        return null;
      }

      const taskId = String(result.insertId);

      await replaceTaskTags(
        connection,
        projectId,
        taskId,
        tagIds,
      );

      await connection.commit();

      return taskId;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
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
              p.owner_id, p.is_archived AS archived
       FROM tasks t
       INNER JOIN projects p ON p.id = t.project_id
       WHERE t.id = ? ${deletedCondition}`,
      [taskId],
    );

    if (rows.length === 0) {
      return null;
    }

    const row = rows[0];

    const task = {
      ...mapTask(row),
      deletedAt: toIso(row.deleted_at),
      ownerId: String(row.owner_id),
      archived:
        row.archived === 1 ||
        row.archived === true ||
        row.archived === "1",
    };

    const tagsByTask = await getTagsForTasks(
      this.pool,
      [task.id],
    );

    task.tags = tagsByTask.get(task.id) || [];

    return task;
  }

  async listForProject(
    projectId,
    {
      limit,
      offset,
      status,
      priority,
      assignedTo,
      categoryId,
      tagId,
      search,
      dueBefore,
    },
  ) {
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

    if (categoryId !== undefined) {
      conditions.push("t.category_id = ?");
      values.push(categoryId);
    }

    if (tagId !== undefined) {
      conditions.push(
        `EXISTS (
          SELECT 1
          FROM task_tags tt
          WHERE tt.project_id = t.project_id
            AND tt.task_id = t.id
            AND tt.tag_id = ?
        )`,
      );
      values.push(tagId);
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

    const tasks = rows.map(mapTask);

    const tagsByTask = await getTagsForTasks(
      this.pool,
      tasks.map((task) => task.id),
    );

    return tasks.map((task) => ({
      ...task,
      tags: tagsByTask.get(task.id) || [],
    }));
  }

  async countForProject(
    projectId,
    {
      status,
      priority,
      assignedTo,
      categoryId,
      tagId,
      search,
      dueBefore,
    } = {},
  ) {
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

    if (categoryId !== undefined) {
      conditions.push("t.category_id = ?");
      values.push(categoryId);
    }

    if (tagId !== undefined) {
      conditions.push(
        `EXISTS (
          SELECT 1
          FROM task_tags tt
          WHERE tt.project_id = t.project_id
            AND tt.task_id = t.id
            AND tt.tag_id = ?
        )`,
      );
      values.push(tagId);
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
    if (!changes || Object.keys(changes).length === 0) {
      return false;
   }
    const connection = await this.pool.getConnection();

    try {
      await connection.beginTransaction();

      const [taskRows] = await connection.execute(
        `SELECT t.id, t.project_id
         FROM tasks t
         INNER JOIN projects p ON p.id = t.project_id
         WHERE t.id = ?
           AND t.deleted_at IS NULL
           AND p.is_archived = 0
           AND (t.created_by = ? OR t.assigned_to = ?)
         FOR UPDATE`,
        [taskId, userId, userId],
      );

      if (taskRows.length === 0) {
        await connection.rollback();
        return false;
      }

      const projectId = String(taskRows[0].project_id);

      const columns = [];
      const values = [];

      const fieldMap = {
        assignedTo: "assigned_to",
        categoryId: "category_id",
        title: "title",
        description: "description",
        status: "status",
        priority: "priority",
        dueDate: "due_date",
      };

      for (const [field, column] of Object.entries(fieldMap)) {
        if (Object.hasOwn(changes, field)) {
          columns.push(`t.${column} = ?`);
          values.push(changes[field]);
        }
      }

      if (columns.length > 0) {
        columns.push(
          "t.updated_at = GREATEST(UTC_TIMESTAMP(3), t.updated_at + INTERVAL 1 MICROSECOND)",
        );

        values.push(taskId, userId, userId);

        const [result] = await connection.execute(
          `UPDATE tasks t
           INNER JOIN projects p ON p.id = t.project_id
           SET ${columns.join(", ")}
           WHERE t.id = ?
             AND t.deleted_at IS NULL
             AND p.is_archived = 0
             AND (t.created_by = ? OR t.assigned_to = ?)`,
          values,
        );

        if (result.affectedRows === 0) {
          await connection.rollback();
          return false;
        }
      }

      if (Object.hasOwn(changes, "tagIds")) {
        await replaceTaskTags(
          connection,
          projectId,
          String(taskId),
          changes.tagIds,
        );

        // Tag-only updates must also update the task timestamp.
        if (columns.length === 0) {
          await connection.execute(
            `UPDATE tasks
             SET updated_at = GREATEST(
               UTC_TIMESTAMP(3),
               updated_at + INTERVAL 1 MICROSECOND
             )
             WHERE id = ?`,
            [taskId],
          );
        }
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
         AND p.is_archived = 0`,
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

    const tasks = rows.map((row) => ({
      ...mapTask(row),
      deletedAt: toIso(row.deleted_at),
    }));

    const tagsByTask = await getTagsForTasks(
      this.pool,
      tasks.map((task) => task.id),
    );

    return tasks.map((task) => ({
      ...task,
      tags: tagsByTask.get(task.id) || [],
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
         AND p.is_archived = 0`,
      [taskId],
    );

    return result.affectedRows > 0;
  }
}

async function replaceTaskTags(
  connection,
  projectId,
  taskId,
  tagIds,
) {
  await connection.execute(
    `DELETE FROM task_tags
     WHERE project_id = ? AND task_id = ?`,
    [projectId, taskId],
  );

  if (!tagIds || tagIds.length === 0) {
    return;
  }

  const placeholders = tagIds.map(() => "(?, ?, ?)").join(", ");
  const values = [];

  for (const tagId of tagIds) {
    values.push(projectId, taskId, tagId);
  }

  await connection.execute(
    `INSERT INTO task_tags (project_id, task_id, tag_id)
     VALUES ${placeholders}`,
    values,
  );
}

async function getTagsForTasks(pool, taskIds) {
  const result = new Map();

  if (!taskIds || taskIds.length === 0) {
    return result;
  }

  const placeholders = taskIds.map(() => "?").join(", ");

  const [rows] = await pool.execute(
    `SELECT tt.task_id, t.id, t.project_id, t.name,
            t.created_at, t.updated_at
     FROM task_tags tt
     INNER JOIN tags t
       ON t.id = tt.tag_id
      AND t.project_id = tt.project_id
     WHERE tt.task_id IN (${placeholders})
     ORDER BY t.name ASC, t.id ASC`,
    taskIds,
  );

  for (const row of rows) {
    const taskId = String(row.task_id);

    if (!result.has(taskId)) {
      result.set(taskId, []);
    }

    result.get(taskId).push({
      id: String(row.id),
      projectId: String(row.project_id),
      name: row.name,
      createdAt: toIso(row.created_at),
      updatedAt: toIso(row.updated_at),
    });
  }

  return result;
}

function escapeLike(value) {
  return String(value).replace(/[\\%_]/g, "\\$&");
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

module.exports = { TaskRepository };