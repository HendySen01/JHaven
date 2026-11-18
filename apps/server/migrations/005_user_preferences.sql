CREATE TABLE IF NOT EXISTS user_preferences (
  user_id BIGINT UNSIGNED NOT NULL,
  builtin_id VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin NULL,
  preset_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  volume DOUBLE NOT NULL CHECK (volume BETWEEN 0 AND 100),
  timer_minutes SMALLINT UNSIGNED NOT NULL CHECK (timer_minutes <= 180),
  PRIMARY KEY (user_id),
  CONSTRAINT fk_preferences_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_preferences_preset FOREIGN KEY (preset_id) REFERENCES sound_presets (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
