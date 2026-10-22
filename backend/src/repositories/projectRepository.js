const DUPLICATE_KEY = "ER_DUP_ENTRY";
const FOREIGN_KEY_MISSING = "ER_NO_REFERENCED_ROW_2";

class ProjectRepository {
  constructor(pool) {
    this.pool = pool;
  }

  async listVisible(user, { limit, offset }) {
    const query = user.role === "ADMIN"
      ? {
        sql: `SELECT p.id, p.owner_id, p.name, p.description, p.archived,
                     p.created_at, p.updated_at
              FROM projects p
              ORDER BY p.updated_at DESC, p.id DESC
              LIMIT ? OFFSET ?`,
        values: [limit, offset],
      }
      : {
        sql: `SELECT p.id, p.owner_id, p.name, p.description, p.archived,
                     p.created_at, p.updated_at
              FROM projects p
              WHERE p.owner_id = ?
                 OR EXISTS (
                   SELECT 1 FROM project_members pm
                   WHERE pm.project_id = p.id AND pm.user_id = ?
                 )
              ORDER BY p.updated_at DESC, p.id DESC
              LIMIT ? OFFSET ?`,
        values: [user.id, user.id, limit, offset],
      };
    const [rows] = await this.pool.execute(query.sql, query.values);
    return rows.map(mapProject);
  }

  async countVisible(user) {
    const query = user.role === "ADMIN"
      ? {
        sql: "SELECT COUNT(*) AS total FROM projects",
        values: [],
      }
      : {
        sql: `SELECT COUNT(*) AS total
              FROM projects p
              WHERE p.owner_id = ?
                 OR EXISTS (
                   SELECT 1 FROM project_members pm
                   WHERE pm.project_id = p.id AND pm.user_id = ?
                 )`,
        values: [user.id, user.id],
      };
    const [rows] = await this.pool.execute(query.sql, query.values);
    return Number(rows[0].total);
  }

  async findById(projectId) {
    const [rows] = await this.pool.execute(
      `SELECT id, owner_id, name, description, archived, created_at, updated_at
       FROM projects WHERE id = ?`,
      [projectId],
    );
    return rows.length === 0 ? null : mapProject(rows[0]);
  }

  async isMember(projectId, userId) {
    const [rows] = await this.pool.execute(
      `SELECT 1 FROM project_members
       WHERE project_id = ? AND user_id = ? LIMIT 1`,
      [projectId, userId],
    );
    return rows.length > 0;
  }

  async createProject({ ownerId, name, description }) {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const [result] = await connection.execute(
        `INSERT INTO projects (owner_id, name, description)
         VALUES (?, ?, ?)`,
        [ownerId, name, description],
      );
      const projectId = String(result.insertId);
      await connection.execute(
        `INSERT INTO project_members (project_id, user_id, member_role)
         VALUES (?, ?, 'OWNER')`,
        [projectId, ownerId],
      );
      await connection.commit();
      return this.findById(projectId);
    } catch (error) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        throw new AggregateError(
          [error, rollbackError],
          "Project creation failed and the transaction could not be rolled back",
          { cause: error },
        );
      }
      throw error;
    } finally {
      connection.release();
    }
  }

  async updateProject(projectId, changes) {
    const columns = [];
    const values = [];
    if (Object.hasOwn(changes, "name")) {
      columns.push("name = ?");
      values.push(changes.name);
    }
    if (Object.hasOwn(changes, "description")) {
      columns.push("description = ?");
      values.push(changes.description);
    }
    columns.push("updated_at = UTC_TIMESTAMP(3)");
    values.push(projectId);

    const [result] = await this.pool.execute(
      `UPDATE projects SET ${columns.join(", ")}
       WHERE id = ? AND archived = 0`,
      values,
    );
    return result.affectedRows > 0;
  }

  async archiveProject(projectId) {
    const [result] = await this.pool.execute(
      `UPDATE projects
       SET archived = 1, updated_at = UTC_TIMESTAMP(3)
       WHERE id = ? AND archived = 0`,
      [projectId],
    );
    return result.affectedRows > 0;
  }

  async userExists(userId) {
    const [rows] = await this.pool.execute(
      "SELECT 1 FROM users WHERE id = ? LIMIT 1",
      [userId],
    );
    return rows.length > 0;
  }

  async listMembers(projectId, { limit, offset }) {
    const [rows] = await this.pool.execute(
      `SELECT u.id, u.name, pm.member_role, pm.joined_at
       FROM project_members pm
       INNER JOIN users u ON u.id = pm.user_id
       WHERE pm.project_id = ?
       ORDER BY CASE WHEN pm.member_role = 'OWNER' THEN 0 ELSE 1 END,
                u.name ASC, u.id ASC
       LIMIT ? OFFSET ?`,
      [projectId, limit, offset],
    );
    return rows.map((row) => ({
      id: String(row.id),
      name: row.name,
      role: row.member_role,
      joinedAt: toIso(row.joined_at),
    }));
  }

  async countMembers(projectId) {
    const [rows] = await this.pool.execute(
      "SELECT COUNT(*) AS total FROM project_members WHERE project_id = ?",
      [projectId],
    );
    return Number(rows[0].total);
  }

  async addMember(projectId, userId) {
    const [result] = await this.pool.execute(
      `INSERT INTO project_members (project_id, user_id, member_role)
       SELECT p.id, ?, 'MEMBER'
       FROM projects p
       WHERE p.id = ? AND p.archived = 0`,
      [userId, projectId],
    );
    return result.affectedRows > 0;
  }

  async removeMember(projectId, userId) {
    const [result] = await this.pool.execute(
      `DELETE pm FROM project_members pm
       INNER JOIN projects p ON p.id = pm.project_id
       WHERE p.id = ? AND p.archived = 0
         AND pm.user_id = ? AND pm.member_role <> 'OWNER'`,
      [projectId, userId],
    );
    return result.affectedRows > 0;
  }

  async listActiveTasks(projectId, { limit, offset }) {
    const [rows] = await this.pool.execute(
      `SELECT id, project_id, created_by, assigned_to, category_id, title,
              description, status, priority, due_date, created_at, updated_at
       FROM tasks
       WHERE project_id = ? AND deleted_at IS NULL
       ORDER BY status ASC, created_at DESC, id DESC
       LIMIT ? OFFSET ?`,
      [projectId, limit, offset],
    );
    return rows.map(mapTask);
  }

  async countActiveTasks(projectId) {
    const [rows] = await this.pool.execute(
      `SELECT COUNT(*) AS total FROM tasks
       WHERE project_id = ? AND deleted_at IS NULL`,
      [projectId],
    );
    return Number(rows[0].total);
  }

  async getDashboardCounts(projectId) {
    const [rows] = await this.pool.execute(
      `SELECT
         SUM(CASE WHEN status = 'TODO' THEN 1 ELSE 0 END) AS todo,
         SUM(CASE WHEN status = 'IN_PROGRESS' THEN 1 ELSE 0 END) AS in_progress,
         SUM(CASE WHEN status = 'DONE' THEN 1 ELSE 0 END) AS done,
         COUNT(*) AS total,
         SUM(CASE WHEN status NOT IN ('TODO', 'IN_PROGRESS', 'DONE')
                  THEN 1 ELSE 0 END) AS unknown_status,
         SUM(CASE WHEN due_date IS NOT NULL
                       AND due_date < UTC_DATE()
                       AND status <> 'DONE'
                  THEN 1 ELSE 0 END) AS overdue
       FROM tasks
       WHERE project_id = ? AND deleted_at IS NULL`,
      [projectId],
    );
    const row = rows[0];
    return {
      TODO: Number(row.todo || 0),
      IN_PROGRESS: Number(row.in_progress || 0),
      DONE: Number(row.done || 0),
      total: Number(row.total || 0),
      unknownStatus: Number(row.unknown_status || 0),
      overdue: Number(row.overdue || 0),
    };
  }

  async findActiveTaskProject(taskId) {
    const [rows] = await this.pool.execute(
      `SELECT t.id, t.project_id
       FROM tasks t
       WHERE t.id = ? AND t.deleted_at IS NULL`,
      [taskId],
    );
    if (rows.length === 0) {
      return null;
    }
    return { id: String(rows[0].id), projectId: String(rows[0].project_id) };
  }
}

function mapProject(row) {
  return {
    id: String(row.id),
    ownerId: String(row.owner_id),
    name: row.name,
    description: row.description,
    archived: row.archived === 1 || row.archived === true || row.archived === "1",
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

function mapTask(row) {
  return {
    id: String(row.id),
    projectId: String(row.project_id),
    createdBy: String(row.created_by),
    assignedTo: row.assigned_to === null ? null : String(row.assigned_to),
    categoryId: row.category_id === null ? null : String(row.category_id),
    title: row.title,
    description: row.description,
    status: row.status,
    priority: row.priority,
    dueDate: row.due_date,
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

module.exports = {
  DUPLICATE_KEY,
  FOREIGN_KEY_MISSING,
  ProjectRepository,
  mapProject,
  mapTask,
};
