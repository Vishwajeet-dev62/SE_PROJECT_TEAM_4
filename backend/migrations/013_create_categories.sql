CREATE TABLE categories (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    project_id BIGINT UNSIGNED NOT NULL,
    name VARCHAR(80) NOT NULL,

    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
        ON UPDATE CURRENT_TIMESTAMP(3),

    PRIMARY KEY (id),

    UNIQUE KEY uq_categories_project_name (project_id, name),
    UNIQUE KEY uq_categories_project_id (project_id, id),

    CONSTRAINT fk_categories_project
        FOREIGN KEY (project_id)
        REFERENCES projects(id)
        ON DELETE CASCADE
        ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


ALTER TABLE tasks
    ADD KEY idx_tasks_project_category (project_id, category_id),

    ADD CONSTRAINT fk_tasks_project_category
        FOREIGN KEY (project_id, category_id)
        REFERENCES categories(project_id, id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE;