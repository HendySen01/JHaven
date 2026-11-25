-- 先创建独立 LOGIN 角色 jhaven_app，再由迁移对象所有者执行。
GRANT USAGE ON SCHEMA jhaven TO jhaven_app;
GRANT SELECT, INSERT ON jhaven.users TO jhaven_app;
GRANT USAGE ON SEQUENCE jhaven.users_id_seq TO jhaven_app;
GRANT SELECT, INSERT, DELETE ON jhaven.auth_sessions, jhaven.relaxation_sessions TO jhaven_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON jhaven.sound_presets, jhaven.sleep_diaries, jhaven.user_preferences TO jhaven_app;
GRANT SELECT, INSERT, UPDATE ON jhaven.chat_history_settings TO jhaven_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON jhaven.chat_conversations TO jhaven_app;
GRANT SELECT, INSERT, DELETE ON jhaven.chat_messages TO jhaven_app;
