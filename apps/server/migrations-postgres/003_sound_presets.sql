CREATE COLLATION jhaven.preset_name (provider = icu, locale = 'und-u-ks-level2', deterministic = false);
CREATE TABLE jhaven.sound_presets (
  id uuid PRIMARY KEY,
  user_id bigint NOT NULL REFERENCES jhaven.users (id) ON DELETE CASCADE,
  name varchar(40) COLLATE jhaven.preset_name NOT NULL,
  mix jsonb NOT NULL,
  CONSTRAINT uq_presets_user_name UNIQUE (user_id, name)
);
