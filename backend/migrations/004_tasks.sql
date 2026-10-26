CREATE TABLE tasks (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    project_id BIGINT UNSIGNED NOT NULL,
    created_by BIGINT UNSIGNED NOT NULL,
    assigned_to BIGINT UNSIGNED NULL,
    category_id BIGINT UNSIGNED NULL,

    title VARCHAR(150) NOT NULL,
    description TEXT NULL,

    status ENUM('TODO', 'IN_PROGRESS', 'DONE')
        NOT NULL DEFAULT 'TODO',

    priority ENUM('LOW', 'MEDIUM', 'HIGH')
        NOT NULL DEFAULT 'MEDIUM',

    due_date DATETIME NULL,
    deleted_at DATETIME NULL,

    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
        ON UPDATE CURRENT_TIMESTAMP(3),

    PRIMARY KEY (id),

    KEY idx_tasks_project_id (project_id),
    KEY idx_tasks_created_by (created_by),
    KEY idx_tasks_assigned_to (assigned_to),
    KEY idx_tasks_category_id (category_id),
    KEY idx_tasks_project_status (project_id, status),
    KEY idx_tasks_due_date (due_date),
    KEY idx_tasks_deleted_at (deleted_at),

    CONSTRAINT fk_tasks_project
        FOREIGN KEY (project_id)
        REFERENCES projects(id)
        ON DELETE RESTRICT ON UPDATE CASCADE,

    CONSTRAINT fk_tasks_creator
        FOREIGN KEY (created_by)
        REFERENCES users(id)
        ON DELETE RESTRICT ON UPDATE CASCADE,

    CONSTRAINT fk_tasks_assignee
        FOREIGN KEY (assigned_to)
        REFERENCES users(id)
        ON DELETE SET NULL ON UPDATE CASCADE

) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;
