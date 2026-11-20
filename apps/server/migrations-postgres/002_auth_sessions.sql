CREATE TABLE jhaven.auth_sessions (
  token_hash bytea PRIMARY KEY CHECK (octet_length(token_hash) = 32),
  user_id bigint NOT NULL REFERENCES jhaven.users (id) ON DELETE CASCADE,
  created_at timestamptz(3) NOT NULL,
  expires_at timestamptz(3) NOT NULL
);
CREATE INDEX idx_sessions_expiration ON jhaven.auth_sessions (expires_at);
CREATE INDEX idx_sessions_user ON jhaven.auth_sessions (user_id);
