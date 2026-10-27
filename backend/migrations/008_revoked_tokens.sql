CREATE TABLE revoked_tokens (
  token_id CHAR(36) NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  revoked_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (token_id),
  KEY idx_revoked_tokens_user_expiry (user_id, expires_at),
  KEY idx_revoked_tokens_expiry (expires_at),
  CONSTRAINT fk_revoked_tokens_user
    FOREIGN KEY (user_id) REFERENCES users (id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
