ALTER TABLE users
  ADD COLUMN password_changed_at DATETIME(3) NULL AFTER password_hash;
