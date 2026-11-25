CREATE TABLE jhaven.chat_history_settings (
  user_id bigint PRIMARY KEY REFERENCES jhaven.users (id) ON DELETE CASCADE,
  auto_save boolean NOT NULL DEFAULT false,
  epoch integer NOT NULL DEFAULT 0 CHECK (epoch >= 0)
);

CREATE TABLE jhaven.chat_conversations (
  user_id bigint NOT NULL REFERENCES jhaven.users (id) ON DELETE CASCADE,
  id uuid NOT NULL,
  title varchar(100) NOT NULL,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, id)
);
CREATE INDEX idx_chat_recent ON jhaven.chat_conversations (user_id, updated_at DESC, id);

CREATE TABLE jhaven.chat_messages (
  user_id bigint NOT NULL,
  conversation_id uuid NOT NULL,
  position integer NOT NULL CHECK (position >= 0),
  role varchar(9) NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (user_id, conversation_id, position),
  FOREIGN KEY (user_id, conversation_id) REFERENCES jhaven.chat_conversations (user_id, id) ON DELETE CASCADE
);
