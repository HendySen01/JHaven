CREATE TABLE IF NOT EXISTS sleep_diaries (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  entry_date DATE NOT NULL,
  timezone VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  bedtime DATETIME NULL,
  asleep DATETIME NULL,
  wake DATETIME NULL,
  rest TINYINT UNSIGNED NULL CHECK (rest BETWEEN 1 AND 5),
  note VARCHAR(2000) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_diaries_user_date (user_id, entry_date),
  CONSTRAINT fk_diaries_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
