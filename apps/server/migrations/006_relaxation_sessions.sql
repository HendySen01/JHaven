CREATE TABLE IF NOT EXISTS relaxation_sessions (
  user_id BIGINT UNSIGNED NOT NULL,
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  practice VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL
    CHECK (practice IN ('thoughts', 'body', 'breathing', 'unwind')),
  duration_seconds SMALLINT UNSIGNED NOT NULL CHECK (duration_seconds <= 600),
  completed TINYINT UNSIGNED NOT NULL CHECK (completed IN (0, 1)),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (user_id, id),
  INDEX idx_relaxation_user_created (user_id, created_at DESC, id DESC),
  CONSTRAINT fk_relaxation_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
