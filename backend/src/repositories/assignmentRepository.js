class AssignmentRepository {
  constructor(pool) {
    this.pool = pool;
  }

  // Changes the assignee only if the task is still active, its project is
  // not archived and the assignee is still the one the caller saw. Returns
  // false when any of those no longer holds, so concurrent changes are never
  // silently overwritten.
  async setAssignee({ taskId, assigneeId, expectedAssigneeId }) {
    const [result] = await this.pool.execute(
      `UPDATE tasks t
       INNER JOIN projects p ON p.id = t.project_id
       SET t.assigned_to = ?,
           t.updated_at = GREATEST(
             UTC_TIMESTAMP(3),
             t.updated_at + INTERVAL 1 MICROSECOND
           )
       WHERE t.id = ?
         AND t.deleted_at IS NULL
         AND p.is_archived = 0
         AND t.assigned_to <=> ?`,
      [assigneeId, taskId, expectedAssigneeId],
    );
    return result.affectedRows > 0;
  }
}

module.exports = { AssignmentRepository };
