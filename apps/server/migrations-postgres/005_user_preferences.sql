CREATE TABLE jhaven.user_preferences (
  user_id bigint PRIMARY KEY REFERENCES jhaven.users (id) ON DELETE CASCADE,
  builtin_id varchar(16),
  preset_id uuid REFERENCES jhaven.sound_presets (id) ON DELETE SET NULL,
  volume double precision NOT NULL CHECK (volume BETWEEN 0 AND 100),
  timer_minutes smallint NOT NULL CHECK (timer_minutes BETWEEN 0 AND 180)
);
CREATE INDEX idx_preferences_preset ON jhaven.user_preferences (preset_id);
