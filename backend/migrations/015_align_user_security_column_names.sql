SET @rename_active_sql = IF(
  EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'users'
      AND column_name = 'is_active'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'users'
      AND column_name = 'active'
  ),
  'ALTER TABLE users RENAME COLUMN is_active TO active',
  'SELECT 1'
);

PREPARE rename_active_stmt FROM @rename_active_sql;
EXECUTE rename_active_stmt;
DEALLOCATE PREPARE rename_active_stmt;

SET @rename_failed_attempts_sql = IF(
  EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'users'
      AND column_name = 'failed_login_attempts'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'users'
      AND column_name = 'failed_attempts'
  ),
  'ALTER TABLE users RENAME COLUMN failed_login_attempts TO failed_attempts',
  'SELECT 1'
);

PREPARE rename_failed_attempts_stmt FROM @rename_failed_attempts_sql;
EXECUTE rename_failed_attempts_stmt;
DEALLOCATE PREPARE rename_failed_attempts_stmt;