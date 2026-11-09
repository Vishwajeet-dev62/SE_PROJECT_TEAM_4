
-- Required for project-scoped task/tag foreign keys.
ALTER TABLE tasks
    ADD UNIQUE KEY uq_tasks_project_id_id (project_id, id);

-- Project-specific tags.
CREATE TABLE tags (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    project_id BIGINT UNSIGNED NOT NULL,
    name VARCHAR(80) NOT NULL,

    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
        ON UPDATE CURRENT_TIMESTAMP(3),

    PRIMARY KEY (id),

    UNIQUE KEY uq_tags_project_name (project_id, name),
    UNIQUE KEY uq_tags_project_id (project_id, id),

    CONSTRAINT fk_tags_project
        FOREIGN KEY (project_id)
        REFERENCES projects(id)
        ON DELETE CASCADE
        ON UPDATE CASCADE
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;

-- Many-to-many relationship between tasks and tags.
CREATE TABLE task_tags (
    project_id BIGINT UNSIGNED NOT NULL,
    task_id BIGINT UNSIGNED NOT NULL,
    tag_id BIGINT UNSIGNED NOT NULL,

    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (task_id, tag_id),

    KEY idx_task_tags_project_task (project_id, task_id),
    KEY idx_task_tags_project_tag (project_id, tag_id),

    CONSTRAINT fk_task_tags_task
        FOREIGN KEY (project_id, task_id)
        REFERENCES tasks(project_id, id)
        ON DELETE CASCADE
        ON UPDATE CASCADE,

    CONSTRAINT fk_task_tags_tag
        FOREIGN KEY (project_id, tag_id)
        REFERENCES tags(project_id, id)
        ON DELETE CASCADE
        ON UPDATE CASCADE
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;
