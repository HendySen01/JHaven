CREATE TABLE jhaven.relaxation_sessions (
  user_id bigint NOT NULL REFERENCES jhaven.users (id) ON DELETE CASCADE,
  id uuid NOT NULL,
  practice varchar(16) NOT NULL CHECK (practice IN ('thoughts', 'body', 'breathing', 'unwind')),
  duration_seconds smallint NOT NULL CHECK (duration_seconds BETWEEN 0 AND 600),
  completed boolean NOT NULL,
  created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, id)
);
CREATE INDEX idx_relaxation_user_created ON jhaven.relaxation_sessions (user_id, created_at DESC, id DESC);
