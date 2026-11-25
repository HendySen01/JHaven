-- 只读：整段执行，返回一行 JSON。不会读取账户或聊天正文。
WITH chat(table_name) AS (
  VALUES ('chat_history_settings'), ('chat_conversations'), ('chat_messages')
),
objects AS (
  SELECT t.table_name, c.oid, pg_get_userbyid(c.relowner) AS owner
  FROM chat AS t
  LEFT JOIN pg_namespace AS n ON n.nspname = 'jhaven'
  LEFT JOIN pg_class AS c ON c.relnamespace = n.oid
    AND c.relname = t.table_name AND c.relkind = 'r'
),
runtime AS (
  SELECT oid, rolname, rolcanlogin, rolsuper, rolcreatedb, rolcreaterole, rolbypassrls
  FROM pg_roles WHERE rolname = 'jhaven_app'
),
table_reports AS (
  SELECT o.table_name, o.oid IS NOT NULL AS present, o.owner,
    ARRAY(SELECT format('%I %s%s%s', a.attname, format_type(a.atttypid, a.atttypmod),
      CASE WHEN a.attnotnull THEN ' NOT NULL' ELSE '' END,
      coalesce(' DEFAULT ' || pg_get_expr(d.adbin, d.adrelid), ''))
      FROM pg_attribute AS a LEFT JOIN pg_attrdef AS d
        ON d.adrelid = a.attrelid AND d.adnum = a.attnum
      WHERE a.attrelid = o.oid AND a.attnum > 0 AND NOT a.attisdropped
      ORDER BY a.attnum) AS columns,
    ARRAY(SELECT pg_get_constraintdef(c.oid)
      FROM pg_constraint AS c WHERE c.conrelid = o.oid ORDER BY c.conname) AS constraints,
    ARRAY(SELECT pg_get_indexdef(i.indexrelid) ||
      CASE WHEN i.indisvalid AND i.indisready THEN '' ELSE ' [INVALID]' END
      FROM pg_index AS i WHERE i.indrelid = o.oid ORDER BY i.indexrelid::regclass::text) AS indexes,
    CASE WHEN r.oid IS NOT NULL AND o.oid IS NOT NULL THEN ARRAY(
      SELECT p FROM unnest(ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE',
        'TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN']) AS privileges(p)
      WHERE has_table_privilege(r.oid, o.oid, p)
    ) END AS runtime_privileges,
    CASE WHEN r.oid IS NOT NULL AND o.oid IS NOT NULL THEN ARRAY(
      SELECT p FROM unnest(ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE',
        'TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN']) AS privileges(p)
      WHERE has_table_privilege(r.oid, o.oid, p || ' WITH GRANT OPTION')
    ) END AS runtime_grant_options
  FROM objects AS o LEFT JOIN runtime AS r ON true
)
SELECT jsonb_pretty(jsonb_build_object(
  'database', current_database(),
  'role', current_user,
  'server_version', current_setting('server_version'),
  'schema_owner', (SELECT pg_get_userbyid(nspowner) FROM pg_namespace WHERE nspname = 'jhaven'),
  'ledger_owner', (SELECT pg_get_userbyid(relowner) FROM pg_class
    WHERE oid = 'jhaven.schema_migrations'::regclass),
  'migration_count', (SELECT count(*) FROM jhaven.schema_migrations),
  'migrations', (SELECT jsonb_agg(jsonb_build_object(
    'name', name, 'checksum', trim(checksum), 'applied_at', applied_at
  ) ORDER BY name) FROM jhaven.schema_migrations),
  '007_checksum_matches', coalesce((SELECT
    trim(checksum) = '6b4775be7ca64231592f975e07dc8675f413cf60c57ca744e6be727ef5bbc596'
    FROM jhaven.schema_migrations WHERE name = '007_chat_history.sql'), false),
  'chat_objects', (SELECT jsonb_agg(to_jsonb(t) ORDER BY t.table_name) FROM table_reports AS t),
  'runtime_role', (SELECT jsonb_build_object(
    'name', rolname, 'can_login', rolcanlogin, 'superuser', rolsuper,
    'create_database', rolcreatedb, 'create_role', rolcreaterole, 'bypass_rls', rolbypassrls,
    'schema_usage', has_schema_privilege(oid, 'jhaven', 'USAGE'),
    'schema_create', has_schema_privilege(oid, 'jhaven', 'CREATE'),
    'ledger_access', has_table_privilege(oid, 'jhaven.schema_migrations',
      'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
  ) FROM runtime)
)) AS jhaven_007_verification;
