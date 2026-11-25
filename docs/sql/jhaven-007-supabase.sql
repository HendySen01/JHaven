-- 仅在确认生产项目及可恢复的备份后，整段执行。
BEGIN;
SET LOCAL lock_timeout = '10s';
SELECT pg_advisory_xact_lock(hashtext('jhaven.schema_migrations'));

DO $preflight$
DECLARE
  baseline jsonb;
  expected constant jsonb := '{
    "001_users.sql":"895b8b0be82def3447718ffe46b42376da474c77144c83ef999643c65d37f3ed",
    "002_auth_sessions.sql":"89e2c26ec9a5801a6cda0aba3610aaaf4ac90808d1e22aa93f62929781818a2a",
    "003_sound_presets.sql":"8c6f8ea0a75492557c0c4d487f05ef2c9921094bd82836fa448141058b0fa413",
    "004_sleep_diaries.sql":"3d5f863075d5f9cdce0521d5f22198abb6da2854ba7e08298334c560f966a176",
    "005_user_preferences.sql":"f7b37adcfa2570e36d16ca211f4fd28c78e0857a5e64438cede5cfb2324f32e0",
    "006_relaxation_sessions.sql":"20b552d75697624cb4623f465c147d716dd44dc097707bf8475fc1f89c00e393"
  }';
BEGIN
  IF current_user <> 'postgres' OR session_user <> 'postgres' OR NOT EXISTS (
    SELECT 1 FROM pg_namespace WHERE nspname = 'jhaven'
      AND nspowner = 'postgres'::regrole
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_class WHERE oid = to_regclass('jhaven.schema_migrations')
      AND relowner = 'postgres'::regrole AND relkind = 'r'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_class WHERE oid = to_regclass('jhaven.users')
      AND relowner = 'postgres'::regrole AND relkind = 'r'
  ) THEN
    RAISE EXCEPTION 'JHaven 数据库身份、schema 或关键对象所有者与预检不符';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles
    WHERE rolname = 'jhaven_app' AND rolcanlogin
      AND NOT (rolsuper OR rolcreatedb OR rolcreaterole OR rolbypassrls))
    OR NOT has_schema_privilege('jhaven_app', 'jhaven', 'USAGE')
    OR has_schema_privilege('jhaven_app', 'jhaven', 'CREATE')
    OR has_table_privilege('jhaven_app', 'jhaven.schema_migrations',
      'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
  THEN
    RAISE EXCEPTION 'JHaven 运行角色与预检不符';
  END IF;

  IF EXISTS (SELECT 1 FROM jhaven.schema_migrations WHERE name = '007_chat_history.sql') THEN
    RAISE EXCEPTION '007 已登记，请执行只读验收';
  END IF;

  SELECT jsonb_object_agg(name, trim(checksum)) INTO baseline
  FROM jhaven.schema_migrations WHERE applied_at IS NOT NULL;
  IF baseline IS DISTINCT FROM expected
    OR (SELECT count(*) FROM jhaven.schema_migrations) <> 6
  THEN
    RAISE EXCEPTION '001–006 的版本或校验和与发布源码不一致';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_class AS c JOIN pg_namespace AS n ON n.oid = c.relnamespace
    WHERE n.nspname = 'jhaven' AND c.relname IN (
      'chat_history_settings', 'chat_conversations', 'chat_messages',
      'chat_history_settings_pkey', 'chat_conversations_pkey',
      'chat_messages_pkey', 'idx_chat_recent'
    )
  ) THEN
    RAISE EXCEPTION '发现 007 残留对象或名称冲突';
  END IF;
END;
$preflight$;

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

INSERT INTO jhaven.schema_migrations (name, checksum, applied_at)
VALUES (
  '007_chat_history.sql',
  '6b4775be7ca64231592f975e07dc8675f413cf60c57ca744e6be727ef5bbc596',
  CURRENT_TIMESTAMP
);

GRANT SELECT, INSERT, UPDATE ON jhaven.chat_history_settings TO jhaven_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON jhaven.chat_conversations TO jhaven_app;
GRANT SELECT, INSERT, DELETE ON jhaven.chat_messages TO jhaven_app;

DO $acl$
DECLARE
  entry record;
BEGIN
  -- 发现角色继承或默认授权带来的额外权限时回滚，保留人工审查机会。
  FOR entry IN
    SELECT t.name, p.privilege, p.privilege = ANY(t.allowed) AS expected
    FROM (VALUES
      ('chat_history_settings', ARRAY['SELECT', 'INSERT', 'UPDATE']),
      ('chat_conversations', ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE']),
      ('chat_messages', ARRAY['SELECT', 'INSERT', 'DELETE'])
    ) AS t(name, allowed)
    CROSS JOIN (VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'),
      ('TRUNCATE'), ('REFERENCES'), ('TRIGGER'), ('MAINTAIN')
    ) AS p(privilege)
  LOOP
    IF has_table_privilege('jhaven_app', 'jhaven.' || entry.name, entry.privilege)
          IS DISTINCT FROM entry.expected
      OR has_table_privilege('jhaven_app', 'jhaven.' || entry.name,
         entry.privilege || ' WITH GRANT OPTION')
    THEN
      RAISE EXCEPTION '007 运行角色权限偏离预期：% %', entry.name, entry.privilege;
    END IF;
  END LOOP;
END;
$acl$;

COMMIT;
