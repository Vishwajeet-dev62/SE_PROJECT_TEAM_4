
-- Associate audit entries with a project for scoped activity history.
ALTER TABLE audit_logs
  ADD COLUMN project_id BIGINT UNSIGNED NULL AFTER user_id,
  ADD KEY idx_audit_logs_project_created (project_id, created_at, id),
  ADD CONSTRAINT fk_audit_logs_project
    FOREIGN KEY (project_id) REFERENCES projects (id)
    ON DELETE SET NULL ON UPDATE CASCADE;
