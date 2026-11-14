
"use strict";

class TaskReminderRepository {
  constructor(pool) {
    this.pool = pool;
  }

  async findDueTasks() {
    const [rows] = await this.pool.execute(
      `SELECT
         t.id AS task_id,
         t.project_id,
         t.title,
         t.due_date,
         COALESCE(t.assigned_to, t.created_by) AS recipient_id
       FROM tasks t
       INNER JOIN projects p ON p.id = t.project_id
       WHERE t.due_date IS NOT NULL
         AND t.due_date >= UTC_TIMESTAMP(3) - INTERVAL 24 HOUR
         AND t.due_date <= UTC_TIMESTAMP(3) + INTERVAL 24 HOUR
         AND t.status <> 'DONE'
         AND t.deleted_at IS NULL
         AND p.is_archived = 0
       ORDER BY t.due_date ASC`,
    );

    return rows;
  }

  async createReminder(task) {
    const connection = await this.pool.getConnection();

    try {
      await connection.beginTransaction();

      // Insert the reminder, handling only duplicate-key errors.
      try {
        await connection.execute(
          `INSERT INTO task_reminders
           (task_id, user_id, due_date)
           VALUES (?, ?, ?)`,
          [task.task_id, task.recipient_id, task.due_date],
        );
      } catch (error) {
        if (error.code === "ER_DUP_ENTRY") {
          await connection.commit();
          return false;
        }

        throw error;
      }

      // Create the notification in the same transaction.
      await connection.execute(
        `INSERT INTO notifications
         (user_id, type, title, message, data)
         VALUES (?, ?, ?, ?, ?)`,
        [
          task.recipient_id,
          "TASK_REMINDER",
          "Task due soon",
          `Your task "${task.title}" is due within 24 hours or was recently overdue.`,
          JSON.stringify({
            taskId: String(task.task_id),
            projectId: String(task.project_id),
            dueDate: task.due_date,
          }),
        ],
      );

      await connection.commit();
      return true;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async sendDueReminders() {
    const tasks = await this.findDueTasks();
    let sentCount = 0;

    for (const task of tasks) {
      if (await this.createReminder(task)) {
        sentCount += 1;
      }
    }

    return sentCount;
  }
}

module.exports = { TaskReminderRepository };
