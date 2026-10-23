'use strict';

const { pool } = require('../config/db');

const ALLOWED_STATUSES = new Set(['TODO', 'IN_PROGRESS', 'DONE']);
const ALLOWED_PRIORITIES = new Set(['LOW', 'MEDIUM', 'HIGH']);
const MAX_PAGE_SIZE = 100;
const MAX_TITLE_LENGTH = 150;
const RESTORE_DAYS = 30;

function apiError(res, status, code, message, details) {
  const error = { code, message };
  if (details !== undefined) error.details = details;
  return res.status(status).json({ error });
}

function parsePositiveInteger(value, fallback) {
  if (value === undefined || value === '') return fallback;
  if (!/^[1-9]\d*$/.test(String(value))) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function parseTaskId(value) {
  return parsePositiveInteger(value, null);
}

function parsePagination(query) {
  const page = parsePositiveInteger(query.page, 1);
  const limit = parsePositiveInteger(query.limit, 20);
  if (page === null || limit === null || limit > MAX_PAGE_SIZE) return null;
  const offset = (page - 1) * limit;
  if (!Number.isSafeInteger(offset)) return null;
  return { page, limit, offset };
}

function validateEnum(value, allowed, field) {
  if (value === undefined) return null;
  if (typeof value !== 'string' || !allowed.has(value)) {
    return `${field} must be one of: ${Array.from(allowed).join(', ')}`;
  }
  return null;
}

function validateOptionalId(value, field, { nullable = true } = {}) {
  if (value === undefined) return null;
  if (value === null && nullable) return null;
  if (parsePositiveInteger(value, null) === null) return `${field} must be a positive integer${nullable ? ' or null' : ''}`;
  return null;
}

function validateDueDate(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2})?)?$/.test(value)) {
    return 'due_date must be a valid date or datetime string';
  }
  const datePart = value.slice(0, 10);
  const date = new Date(`${datePart}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== datePart) {
    return 'due_date must contain a valid calendar date';
  }
  return null;
}

function validateTaskBody(body, { partial = false } = {}) {
  const input = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
  const errors = [];
  const allowedFields = new Set([
    'project_id', 'created_by', 'assigned_to', 'category_id',
    'title', 'description', 'status', 'priority', 'due_date',
  ]);

  for (const key of Object.keys(input)) {
    if (!allowedFields.has(key)) errors.push({ field: key, message: 'Unknown field' });
  }

  if (!partial) {
    for (const field of ['project_id', 'created_by', 'title']) {
      if (input[field] === undefined || input[field] === null || input[field] === '') {
        errors.push({ field, message: `${field} is required` });
      }
    }
  }

  for (const field of ['project_id', 'created_by']) {
    if (!partial || input[field] !== undefined) {
      const error = validateOptionalId(input[field], field, { nullable: false });
      if (error) errors.push({ field, message: error });
    }
  }
  for (const field of ['assigned_to', 'category_id']) {
    if (input[field] !== undefined) {
      const error = validateOptionalId(input[field], field);
      if (error) errors.push({ field, message: error });
    }
  }

  if (!partial || input.title !== undefined) {
    if (typeof input.title !== 'string' || !input.title.trim()) {
      errors.push({ field: 'title', message: 'title must be a non-empty string' });
    } else if (input.title.trim().length > MAX_TITLE_LENGTH) {
      errors.push({ field: 'title', message: `title must be at most ${MAX_TITLE_LENGTH} characters` });
    }
  }

  if (input.description !== undefined && input.description !== null && typeof input.description !== 'string') {
    errors.push({ field: 'description', message: 'description must be a string or null' });
  }

  const statusError = validateEnum(input.status, ALLOWED_STATUSES, 'status');
  if (statusError) errors.push({ field: 'status', message: statusError });
  const priorityError = validateEnum(input.priority, ALLOWED_PRIORITIES, 'priority');
  if (priorityError) errors.push({ field: 'priority', message: priorityError });
  const dueDateError = validateDueDate(input.due_date);
  if (dueDateError) errors.push({ field: 'due_date', message: dueDateError });

  if (partial) {
    const mutable = ['title', 'description', 'status', 'priority', 'due_date', 'category_id', 'assigned_to'];
    if (!mutable.some((field) => Object.prototype.hasOwnProperty.call(input, field))) {
      errors.push({ field: 'body', message: 'Provide at least one supported field to update' });
    }
    for (const field of ['project_id', 'created_by']) {
      if (Object.prototype.hasOwnProperty.call(input, field)) {
        errors.push({ field, message: `${field} cannot be changed after task creation` });
      }
    }
  }

  return { input, errors };
}

function databaseFailure(res, action, error) {
  // Log the technical error server-side; do not expose SQL or credentials in API responses.
  console.error(`${action} failed:`, error && error.message ? error.message : error);
  return apiError(res, 500, 'INTERNAL_SERVER_ERROR', `Unable to ${action}`);
}

function buildListFilters(query, { includeDeleted = false } = {}) {
  const conditions = [];
  const params = [];
  conditions.push(includeDeleted ? 't.deleted_at IS NOT NULL' : 't.deleted_at IS NULL');

  if (query.projectId !== undefined && query.projectId !== '') {
    const projectId = parsePositiveInteger(query.projectId, null);
    if (projectId === null) return { error: 'projectId must be a positive integer' };
    conditions.push('t.project_id = ?');
    params.push(projectId);
  }

  if (query.status !== undefined && query.status !== '') {
    if (!ALLOWED_STATUSES.has(query.status)) return { error: 'Invalid task status filter' };
    conditions.push('t.status = ?');
    params.push(query.status);
  }

  if (query.priority !== undefined && query.priority !== '') {
    if (!ALLOWED_PRIORITIES.has(query.priority)) return { error: 'Invalid task priority filter' };
    conditions.push('t.priority = ?');
    params.push(query.priority);
  }

  if (query.assignedTo !== undefined && query.assignedTo !== '') {
    const assignedTo = parsePositiveInteger(query.assignedTo, null);
    if (assignedTo === null) return { error: 'assignedTo must be a positive integer' };
    conditions.push('t.assigned_to = ?');
    params.push(assignedTo);
  }

  if (query.createdBy !== undefined && query.createdBy !== '') {
    const createdBy = parsePositiveInteger(query.createdBy, null);
    if (createdBy === null) return { error: 'createdBy must be a positive integer' };
    conditions.push('t.created_by = ?');
    params.push(createdBy);
  }

  if (query.dueBefore !== undefined && query.dueBefore !== '') {
    const err = validateDueDate(query.dueBefore);
    if (err) return { error: 'dueBefore must be a valid date' };
    conditions.push('t.due_date IS NOT NULL AND t.due_date <= ?');
    params.push(query.dueBefore);
  }

  if (query.dueAfter !== undefined && query.dueAfter !== '') {
    const err = validateDueDate(query.dueAfter);
    if (err) return { error: 'dueAfter must be a valid date' };
    conditions.push('t.due_date IS NOT NULL AND t.due_date >= ?');
    params.push(query.dueAfter);
  }

  if (query.search !== undefined && query.search !== '') {
    if (typeof query.search !== 'string' || query.search.length > 150) {
      return { error: 'search must be at most 150 characters' };
    }
    conditions.push('(t.title LIKE ? OR t.description LIKE ?)');
    const escaped = query.search.replace(/[\\%_]/g, '\\$&');
    params.push(`%${escaped}%`, `%${escaped}%`);
  }

  return { where: conditions.join(' AND '), params };
}

async function listTasks(req, res) {
  const pagination = parsePagination(req.query);
  if (!pagination) return apiError(res, 400, 'VALIDATION_ERROR', 'page must be a positive integer and limit must be between 1 and 100');

  const filters = buildListFilters(req.query);
  if (filters.error) return apiError(res, 400, 'VALIDATION_ERROR', filters.error);

  try {
    const [countRows] = await pool.execute(
      `SELECT COUNT(*) AS total FROM tasks t WHERE ${filters.where}`,
      filters.params,
    );
    const [rows] = await pool.execute(
      `SELECT t.id, t.project_id, t.created_by, t.assigned_to, t.category_id,
              t.title, t.description, t.status, t.priority, t.due_date,
              t.created_at, t.updated_at
       FROM tasks t
       WHERE ${filters.where}
       ORDER BY t.created_at DESC, t.id DESC
       LIMIT ? OFFSET ?`,
      [...filters.params, pagination.limit, pagination.offset],
    );

    const total = Number(countRows[0].total);
    return res.json({
      data: rows,
      pagination: {
        page: pagination.page,
        limit: pagination.limit,
        total,
        totalPages: Math.ceil(total / pagination.limit),
      },
    });
  } catch (error) {
    return databaseFailure(res, 'retrieve tasks', error);
  }
}

async function listDeletedTasks(req, res) {
  const pagination = parsePagination(req.query);
  if (!pagination) return apiError(res, 400, 'VALIDATION_ERROR', 'page must be a positive integer and limit must be between 1 and 100');

  const filters = buildListFilters(req.query, { includeDeleted: true });
  if (filters.error) return apiError(res, 400, 'VALIDATION_ERROR', filters.error);
  filters.where += ' AND t.deleted_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 30 DAY)';

  try {
    const [countRows] = await pool.execute(
      `SELECT COUNT(*) AS total FROM tasks t WHERE ${filters.where}`,
      filters.params,
    );
    const [rows] = await pool.execute(
      `SELECT t.id, t.project_id, t.created_by, t.assigned_to, t.category_id,
              t.title, t.description, t.status, t.priority, t.due_date,
              t.created_at, t.updated_at, t.deleted_at
       FROM tasks t
       WHERE ${filters.where}
       ORDER BY t.deleted_at DESC, t.id DESC
       LIMIT ? OFFSET ?`,
      [...filters.params, pagination.limit, pagination.offset],
    );

    const total = Number(countRows[0].total);
    return res.json({
      data: rows,
      pagination: {
        page: pagination.page,
        limit: pagination.limit,
        total,
        totalPages: Math.ceil(total / pagination.limit),
      },
    });
  } catch (error) {
    return databaseFailure(res, 'retrieve deleted tasks', error);
  }
}

async function createTask(req, res) {
  const { input, errors } = validateTaskBody(req.body);
  if (errors.length) return apiError(res, 400, 'VALIDATION_ERROR', 'Task validation failed', errors);

  const task = {
    project_id: Number(input.project_id),
    created_by: Number(input.created_by),
    assigned_to: input.assigned_to == null ? null : Number(input.assigned_to),
    category_id: input.category_id == null ? null : Number(input.category_id),
    title: input.title.trim(),
    description: input.description == null ? null : input.description.trim(),
    status: input.status || 'TODO',
    priority: input.priority || 'MEDIUM',
    due_date: input.due_date || null,
  };

  try {
    const [result] = await pool.execute(
      `INSERT INTO tasks
       (project_id, created_by, assigned_to, category_id, title, description, status, priority, due_date)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        task.project_id, task.created_by, task.assigned_to, task.category_id,
        task.title, task.description, task.status, task.priority, task.due_date,
      ],
    );
    const [rows] = await pool.execute(
      `SELECT id, project_id, created_by, assigned_to, category_id, title,
              description, status, priority, due_date, created_at, updated_at
       FROM tasks WHERE id = ?`,
      [result.insertId],
    );
    return res.status(201).json({ data: rows[0] || { id: result.insertId, ...task } });
  } catch (error) {
    if (error && error.code === 'ER_NO_REFERENCED_ROW_2') {
      return apiError(res, 400, 'INVALID_REFERENCE', 'project_id, created_by, assigned_to, or category_id references a record that does not exist');
    }
    return databaseFailure(res, 'create task', error);
  }
}

async function getTaskById(req, res) {
  const id = parseTaskId(req.params.id);
  if (id === null) return apiError(res, 400, 'VALIDATION_ERROR', 'Task ID must be a positive integer');

  try {
    const [rows] = await pool.execute(
      `SELECT id, project_id, created_by, assigned_to, category_id, title,
              description, status, priority, due_date, created_at, updated_at
       FROM tasks WHERE id = ? AND deleted_at IS NULL`,
      [id],
    );
    if (!rows.length) return apiError(res, 404, 'TASK_NOT_FOUND', 'Task not found');
    return res.json({ data: rows[0] });
  } catch (error) {
    return databaseFailure(res, 'retrieve task', error);
  }
}

async function updateTask(req, res) {
  const id = parseTaskId(req.params.id);
  if (id === null) return apiError(res, 400, 'VALIDATION_ERROR', 'Task ID must be a positive integer');

  const { input, errors } = validateTaskBody(req.body, { partial: true });
  if (errors.length) return apiError(res, 400, 'VALIDATION_ERROR', 'Task validation failed', errors);

  const allowed = ['title', 'description', 'status', 'priority', 'due_date', 'category_id', 'assigned_to'];
  const assignments = [];
  const values = [];

  for (const field of allowed) {
    if (!Object.prototype.hasOwnProperty.call(input, field)) continue;
    let value = input[field];
    if (field === 'title') value = value.trim();
    if (field === 'description' && typeof value === 'string') value = value.trim();
    if (['assigned_to', 'category_id'].includes(field) && value !== null) value = Number(value);
    if (field === 'due_date' && value === '') value = null;
    assignments.push(`${field} = ?`);
    values.push(value);
  }

  try {
    values.push(id);
    const [result] = await pool.execute(
      `UPDATE tasks SET ${assignments.join(', ')}, updated_at = UTC_TIMESTAMP()
       WHERE id = ? AND deleted_at IS NULL`,
      values,
    );
    if (!result.affectedRows) return apiError(res, 404, 'TASK_NOT_FOUND', 'Task not found');

    const [rows] = await pool.execute(
      `SELECT id, project_id, created_by, assigned_to, category_id, title,
              description, status, priority, due_date, created_at, updated_at
       FROM tasks WHERE id = ? AND deleted_at IS NULL`,
      [id],
    );
    return res.json({ data: rows[0] });
  } catch (error) {
    if (error && error.code === 'ER_NO_REFERENCED_ROW_2') {
      return apiError(res, 400, 'INVALID_REFERENCE', 'assigned_to or category_id references a record that does not exist');
    }
    return databaseFailure(res, 'update task', error);
  }
}

async function deleteTask(req, res) {
  const id = parseTaskId(req.params.id);
  if (id === null) return apiError(res, 400, 'VALIDATION_ERROR', 'Task ID must be a positive integer');

  try {
    const [result] = await pool.execute(
      `UPDATE tasks SET deleted_at = UTC_TIMESTAMP(), updated_at = UTC_TIMESTAMP()
       WHERE id = ? AND deleted_at IS NULL`,
      [id],
    );
    if (!result.affectedRows) return apiError(res, 404, 'TASK_NOT_FOUND', 'Task not found');
    return res.status(200).json({ data: { id, deleted: true }, message: 'Task moved to trash' });
  } catch (error) {
    return databaseFailure(res, 'delete task', error);
  }
}

async function restoreTask(req, res) {
  const id = parseTaskId(req.params.id);
  if (id === null) return apiError(res, 400, 'VALIDATION_ERROR', 'Task ID must be a positive integer');

  try {
    const [result] = await pool.execute(
      `UPDATE tasks SET deleted_at = NULL, updated_at = UTC_TIMESTAMP()
       WHERE id = ? AND deleted_at IS NOT NULL
         AND deleted_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL ${RESTORE_DAYS} DAY)`,
      [id],
    );
    if (!result.affectedRows) {
      return apiError(res, 404, 'TASK_NOT_FOUND_OR_EXPIRED', 'Task not found, not deleted, or its 30-day restore period has expired');
    }
    return res.json({ data: { id, restored: true }, message: 'Task restored successfully' });
  } catch (error) {
    return databaseFailure(res, 'restore task', error);
  }
}

function csvCell(value) {
  let text = value == null ? '' : String(value);
  if (/^[\t\r ]*[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

async function exportTasksCsv(req, res) {
  const filters = buildListFilters(req.query);
  if (filters.error) return apiError(res, 400, 'VALIDATION_ERROR', filters.error);

  try {
    const [rows] = await pool.execute(
      `SELECT t.id, t.project_id, t.title, t.description, t.status, t.priority,
              t.due_date, t.created_at, t.updated_at
       FROM tasks t WHERE ${filters.where}
       ORDER BY t.created_at DESC, t.id DESC`,
      filters.params,
    );
    const columns = ['id', 'project_id', 'title', 'description', 'status', 'priority', 'due_date', 'created_at', 'updated_at'];
    const csv = [
      columns.join(','),
      ...rows.map((row) => columns.map((column) => csvCell(row[column])).join(',')),
    ].join('\r\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="tasks.csv"');
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).send(`\uFEFF${csv}`);
  } catch (error) {
    return databaseFailure(res, 'export tasks', error);
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
  // Export validation helpers to make deterministic unit testing possible.
  validateTaskBody,
  parsePagination,
  buildListFilters,
};
