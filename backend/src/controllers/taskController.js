
const { pool } = require('../config/db');

const ALLOWED_STATUSES = ['TODO', 'IN_PROGRESS', 'DONE'];
const ALLOWED_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH'];

async function listTasks(req, res) {
  try {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 20));
    const offset = (page - 1) * limit;
    const conditions = ['t.deleted_at IS NULL'];
    const params = [];

    if (req.query.projectId) {
      conditions.push('t.project_id = ?');
      params.push(req.query.projectId);
    }

    if (req.query.status) {
      if (!ALLOWED_STATUSES.includes(req.query.status)) {
        return res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: 'Invalid task status' },
        });
      }
      conditions.push('t.status = ?');
      params.push(req.query.status);
    }

    if (req.query.priority) {
      if (!ALLOWED_PRIORITIES.includes(req.query.priority)) {
        return res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: 'Invalid task priority' },
        });
      }
      conditions.push('t.priority = ?');
      params.push(req.query.priority);
    }

    if (req.query.search) {
      conditions.push('(t.title LIKE ? OR t.description LIKE ?)');
      const search = `%${req.query.search}%`;
      params.push(search, search);
    }

    const where = conditions.join(' AND ');

    const [countRows] = await pool.execute(
      `SELECT COUNT(*) AS total FROM tasks t WHERE ${where}`,
      params
    );

    const [tasks] = await pool.execute(
      `SELECT t.id, t.project_id, t.created_by, t.assigned_to,
              t.category_id, t.title, t.description, t.status,
              t.priority, t.due_date, t.created_at, t.updated_at
       FROM tasks t
       WHERE ${where}
       ORDER BY t.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    return res.json({
      data: tasks,
      pagination: { page, limit, total: countRows[0].total },
    });
  } catch (error) {
    console.error('List tasks failed:', error.message);
    return res.status(500).json({
      error: { code: 'INTERNAL_SERVER_ERROR', message: 'Unable to retrieve tasks' },
    });
  }
}

async function listDeletedTasks(req, res) {
  try {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 20));
    const offset = (page - 1) * limit;
    const conditions = [
      'deleted_at IS NOT NULL',
      'deleted_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 30 DAY)',
    ];
    const params = [];

    if (req.query.projectId) {
      conditions.push('project_id = ?');
      params.push(req.query.projectId);
    }

    const where = conditions.join(' AND ');

    const [countRows] = await pool.execute(
      `SELECT COUNT(*) AS total FROM tasks WHERE ${where}`,
      params
    );

    const [tasks] = await pool.execute(
      `SELECT id, project_id, created_by, assigned_to, category_id,
              title, description, status, priority, due_date,
              created_at, updated_at, deleted_at
       FROM tasks
       WHERE ${where}
       ORDER BY deleted_at DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    return res.json({
      data: tasks,
      pagination: { page, limit, total: countRows[0].total },
    });
  } catch (error) {
    console.error('List deleted tasks failed:', error.message);
    return res.status(500).json({
      error: { code: 'INTERNAL_SERVER_ERROR', message: 'Unable to retrieve deleted tasks' },
    });
  }
}

async function createTask(req, res) {
  const {
    project_id,
    created_by,
    assigned_to = null,
    category_id = null,
    title,
    description = null,
    status = 'TODO',
    priority = 'MEDIUM',
    due_date = null,
  } = req.body;

  if (
    !project_id ||
    !created_by ||
    typeof title !== 'string' ||
    !title.trim() ||
    title.trim().length > 150
  ) {
    return res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'project_id, created_by and a title of 1 to 150 characters are required',
      },
    });
  }

  if (!ALLOWED_STATUSES.includes(status) || !ALLOWED_PRIORITIES.includes(priority)) {
    return res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'Invalid task status or priority' },
    });
  }

  try {
    const [result] = await pool.execute(
      `INSERT INTO tasks
        (project_id, created_by, assigned_to, category_id, title,
         description, status, priority, due_date)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        project_id, created_by, assigned_to, category_id,
        title.trim(), description, status, priority, due_date,
      ]
    );

    return res.status(201).json({
      data: {
        id: result.insertId, project_id, created_by, assigned_to,
        category_id, title: title.trim(), description, status, priority, due_date,
      },
    });
  } catch (error) {
    console.error('Create task failed:', error.message);
    return res.status(500).json({
      error: { code: 'INTERNAL_SERVER_ERROR', message: 'Unable to create task' },
    });
  }
}

async function getTaskById(req, res) {
  try {
    const [tasks] = await pool.execute(
      `SELECT id, project_id, created_by, assigned_to, category_id,
              title, description, status, priority, due_date, created_at, updated_at
       FROM tasks
       WHERE id = ? AND deleted_at IS NULL`,
      [req.params.id]
    );

    if (tasks.length === 0) {
      return res.status(404).json({
        error: { code: 'TASK_NOT_FOUND', message: 'Task not found' },
      });
    }

    return res.json({ data: tasks[0] });
  } catch (error) {
    console.error('Get task failed:', error.message);
    return res.status(500).json({
      error: { code: 'INTERNAL_SERVER_ERROR', message: 'Unable to retrieve task' },
    });
  }
}

async function updateTask(req, res) {
  const allowedFields = [
    'title', 'description', 'status', 'priority',
    'due_date', 'category_id', 'assigned_to',
  ];
  const updates = [];
  const values = [];

  for (const field of allowedFields) {
    if (!Object.prototype.hasOwnProperty.call(req.body, field)) continue;

    const value = req.body[field];

    if (field === 'title') {
      if (typeof value !== 'string' || !value.trim() || value.trim().length > 150) {
        return res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: 'Title must contain 1 to 150 characters' },
        });
      }
      updates.push('title = ?');
      values.push(value.trim());
      continue;
    }

    if (field === 'status' && !ALLOWED_STATUSES.includes(value)) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Invalid task status' },
      });
    }

    if (field === 'priority' && !ALLOWED_PRIORITIES.includes(value)) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Invalid task priority' },
      });
    }

    updates.push(`${field} = ?`);
    values.push(value);
  }

  if (updates.length === 0) {
    return res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Provide at least one supported field to update',
      },
    });
  }

  try {
    values.push(req.params.id);
    const [result] = await pool.execute(
      `UPDATE tasks
       SET ${updates.join(', ')}, updated_at = UTC_TIMESTAMP()
       WHERE id = ? AND deleted_at IS NULL`,
      values
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        error: { code: 'TASK_NOT_FOUND', message: 'Task not found' },
      });
    }

    const [tasks] = await pool.execute(
      `SELECT id, project_id, created_by, assigned_to, category_id,
              title, description, status, priority, due_date, created_at, updated_at
       FROM tasks
       WHERE id = ? AND deleted_at IS NULL`,
      [req.params.id]
    );

    return res.json({ data: tasks[0] });
  } catch (error) {
    console.error('Update task failed:', error.message);
    return res.status(500).json({
      error: { code: 'INTERNAL_SERVER_ERROR', message: 'Unable to update task' },
    });
  }
}

async function deleteTask(req, res) {
  try {
    const [result] = await pool.execute(
      `UPDATE tasks
       SET deleted_at = UTC_TIMESTAMP(),
           updated_at = UTC_TIMESTAMP()
       WHERE id = ? AND deleted_at IS NULL`,
      [req.params.id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        error: { code: 'TASK_NOT_FOUND', message: 'Task not found' },
      });
    }

    return res.status(200).json({ message: 'Task moved to trash successfully' });
  } catch (error) {
    console.error('Delete task failed:', error.message);
    return res.status(500).json({
      error: { code: 'INTERNAL_SERVER_ERROR', message: 'Unable to delete task' },
    });
  }
}

async function restoreTask(req, res) {
  try {
    const [result] = await pool.execute(
      `UPDATE tasks
       SET deleted_at = NULL,
           updated_at = UTC_TIMESTAMP()
       WHERE id = ?
         AND deleted_at IS NOT NULL
         AND deleted_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 30 DAY)`,
      [req.params.id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        error: {
          code: 'TASK_NOT_FOUND_OR_EXPIRED',
          message: 'Task not found, not deleted, or its 30-day restore period has expired',
        },
      });
    }

    return res.json({ message: 'Task restored successfully' });
  } catch (error) {
    console.error('Restore task failed:', error.message);
    return res.status(500).json({
      error: { code: 'INTERNAL_SERVER_ERROR', message: 'Unable to restore task' },
    });
  }
}

// GET /api/v1/tasks/export.csv
async function exportTasksCsv(req, res) {
  try {
    const conditions = ['deleted_at IS NULL'];
    const params = [];

    if (req.query.projectId) {
      conditions.push('project_id = ?');
      params.push(req.query.projectId);
    }

    if (req.query.status) {
      if (!ALLOWED_STATUSES.includes(req.query.status)) {
        return res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: 'Invalid task status' },
        });
      }
      conditions.push('status = ?');
      params.push(req.query.status);
    }

    if (req.query.priority) {
      if (!ALLOWED_PRIORITIES.includes(req.query.priority)) {
        return res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: 'Invalid task priority' },
        });
      }
      conditions.push('priority = ?');
      params.push(req.query.priority);
    }

    const [tasks] = await pool.execute(
      `SELECT id, project_id, title, description, status, priority,
              due_date, created_at, updated_at
       FROM tasks
       WHERE ${conditions.join(' AND ')}
       ORDER BY created_at DESC`,
      params
    );

    const columns = [
      'id', 'project_id', 'title', 'description', 'status',
      'priority', 'due_date', 'created_at', 'updated_at',
    ];

    const escapeCsv = (value) => {
      let text = value == null ? '' : String(value);

      // Prevent spreadsheet formula injection for text beginning with formula characters.
      if (/^[\t\r ]*[=+\-@]/.test(text)) {
        text = `'${text}`;
      }

      return `"${text.replace(/"/g, '""')}"`;
    };

    const lines = [
      columns.join(','),
      ...tasks.map((task) =>
        columns.map((column) => escapeCsv(task[column])).join(',')
      ),
    ];

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="tasks.csv"');
    return res.status(200).send(`\uFEFF${lines.join('\r\n')}`);
  } catch (error) {
    console.error('Export tasks failed:', error.message);
    return res.status(500).json({
      error: { code: 'INTERNAL_SERVER_ERROR', message: 'Unable to export tasks' },
    });
  }
}

module.exports = {
  listTasks,
  listDeletedTasks,
  createTask,
  getTaskById,
  updateTask,
  deleteTask,
  restoreTask,
  exportTasksCsv,
};
