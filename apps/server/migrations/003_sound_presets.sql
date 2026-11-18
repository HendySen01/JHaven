CREATE TABLE IF NOT EXISTS sound_presets (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(40) COLLATE utf8mb4_0900_as_ci NOT NULL,
  mix JSON NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_presets_user_name (user_id, name),
  CONSTRAINT fk_presets_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
