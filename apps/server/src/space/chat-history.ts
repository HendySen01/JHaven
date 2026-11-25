import { json, Router, type RequestHandler } from 'express';
import type { Pool, PoolClient } from 'pg';
import { z } from 'zod';
import {
  chatDetail,
  chatFilter,
  chatSettings,
  chatSnapshot,
  chatSummary,
  chatTitle,
  chatTurn,
} from '@jhaven/shared';
import { inTransaction } from '../db/pool.js';
import { AppError } from '../middleware/error-handler.js';

const query = z.strictObject({
  search: z.string().trim().max(120).default(''),
  filter: chatFilter.default('all'),
});
function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new AppError(400, 'INVALID_INPUT', '聊天记录格式有误。');
  return result.data;
}
function missing(): never {
  throw new AppError(404, 'ENTRY_NOT_FOUND', '此对话不存在。');
}
function conflict(): never {
  throw new AppError(
    409,
    'ENTRY_CONFLICT',
    '聊天历史已在其他页面更新。请保留当前对话并重新打开历史。',
  );
}
async function settings(db: Pool | PoolClient, user: string) {
  const { rows } = await db.query(
    'SELECT auto_save AS "autoSave", epoch FROM jhaven.chat_history_settings WHERE user_id = $1',
    [user],
  );
  return chatSettings.parse(rows[0] ?? { autoSave: false, epoch: 0 });
}
function write<T>(db: Pool, user: string, run: (client: PoolClient) => Promise<T>) {
  return inTransaction(db, async (client) => {
    // 同一账户不同设备的设置、保存和清空按顺序提交。
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 71493))', [user]);
    return run(client);
  });
}
const summary = `SELECT c.id, c.revision, c.title, c.updated_at,
    count(m.position)::int AS "messageCount",
    array_remove(array_agg(DISTINCT m.metadata ->> 'source'), NULL) AS sources,
    array_remove(array_agg(DISTINCT CASE WHEN m.metadata ->> 'source' = 'ai'
      THEN lower(split_part(m.metadata ->> 'recipient', ' · ', 1)) END), NULL) AS providers
    FROM jhaven.chat_conversations c JOIN jhaven.chat_messages m
    ON (m.user_id, m.conversation_id) = (c.user_id, c.id)`;
function summaryRow(row: { updated_at: Date }) {
  return chatSummary.parse({ ...row, updatedAt: row.updated_at.toISOString() });
}
async function detail(client: PoolClient, user: string, id: string) {
  const { rows } = await client.query(
    `${summary} WHERE c.user_id = $1 AND c.id = $2 GROUP BY c.user_id, c.id`,
    [user, id],
  );
  if (!rows[0]) missing();
  const { rows: messages } = await client.query(
    `SELECT u.content AS question, u.metadata ->> 'sentOn' AS "sentOn", a.content AS text,
            a.metadata
       FROM jhaven.chat_messages u JOIN jhaven.chat_messages a
       ON (a.user_id, a.conversation_id, a.position) = (u.user_id, u.conversation_id, u.position + 1)
       WHERE u.user_id = $1 AND u.conversation_id = $2 AND u.role = 'user' AND a.role = 'assistant'
       ORDER BY u.position`,
    [user, id],
  );
  return chatDetail.parse({
    ...summaryRow(rows[0]),
    turns: messages.map(({ metadata, ...turn }) => chatTurn.parse({ ...turn, ...metadata })),
  });
}

export function createChatHistoryRouter(
  database: () => Pool,
  csrf: RequestHandler,
  limit: RequestHandler,
) {
  const router = Router();
  router.get('/settings', limit, async (_request, response) => {
    response.json(await settings(database(), response.locals.account.id));
  });
  router.put('/settings', csrf, limit, json({ limit: '1kb' }), async (request, response) => {
    const { autoSave } = parse(z.strictObject({ autoSave: z.boolean() }), request.body);
    const user = response.locals.account.id;
    response.json(
      await write(database(), user, async (client) => {
        await client.query(
          `INSERT INTO jhaven.chat_history_settings (user_id, auto_save)
        VALUES ($1, $2) ON CONFLICT (user_id) DO UPDATE SET auto_save = EXCLUDED.auto_save`,
          [user, autoSave],
        );
        return settings(client, user);
      }),
    );
  });
  const list: RequestHandler = async (request, response) => {
    const { search, filter } = parse(query, request.method === 'POST' ? request.body : {});
    const { rows } = await database().query(
      `SELECT * FROM (${summary} WHERE c.user_id = $1
        AND ($2 = '' OR strpos(lower(c.title), lower($2)) > 0 OR EXISTS (
          SELECT 1 FROM jhaven.chat_messages s WHERE s.user_id = c.user_id
          AND s.conversation_id = c.id AND strpos(lower(s.content), lower($2)) > 0))
        GROUP BY c.user_id, c.id) h
       WHERE $3 = 'all' OR ($3 = 'deepseek' AND 'deepseek' = ANY(providers))
          OR ($3 = 'local' AND sources && ARRAY['local','fallback'])
          OR ($3 = 'mixed' AND 'ai' = ANY(sources) AND sources && ARRAY['local','fallback'])
       ORDER BY updated_at DESC, id`,
      [response.locals.account.id, search, filter],
    );
    response.json(rows.map(summaryRow));
  };
  router.get('/', limit, list);
  // 搜索词放在正文，避免私人片段进入访问日志和 URL 历史。
  router.post('/search', csrf, limit, json({ limit: '1kb' }), list);
  router.get('/:id', limit, async (request, response) => {
    const id = parse(z.uuid(), request.params.id);
    const user = response.locals.account.id;
    const value = await inTransaction(database(), async (client) => {
      await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
      return detail(client, user, id);
    });
    response.json(value);
  });
  router.put('/:id', csrf, limit, json({ limit: '2mb' }), async (request, response) => {
    const id = parse(z.uuid(), request.params.id);
    const { revision, epoch, automatic, turns } = parse(chatSnapshot, request.body);
    const user = response.locals.account.id;
    const saved = await write(database(), user, async (client) => {
      const state = await settings(client, user);
      if (state.epoch !== epoch) conflict();
      if (automatic && !state.autoSave)
        throw new AppError(409, 'AUTO_SAVE_DISABLED', '自动保存已关闭。');
      const { rows } = await client.query(
        'SELECT revision FROM jhaven.chat_conversations WHERE user_id = $1 AND id = $2',
        [user, id],
      );
      if (rows[0]) {
        const current = await detail(client, user, id);
        if (JSON.stringify(current.turns) === JSON.stringify(turns)) return current;
        if (rows[0].revision !== revision) conflict();
        await client.query(
          `UPDATE jhaven.chat_conversations SET revision = revision + 1, updated_at = now()
          WHERE user_id = $1 AND id = $2`,
          [user, id],
        );
        await client.query(
          'DELETE FROM jhaven.chat_messages WHERE user_id = $1 AND conversation_id = $2',
          [user, id],
        );
      } else {
        if (revision !== 0) missing();
        const {
          rows: [count],
        } = await client.query(
          'SELECT count(*)::int AS total FROM jhaven.chat_conversations WHERE user_id = $1',
          [user],
        );
        if (count.total >= 200)
          throw new AppError(409, 'HISTORY_FULL', '历史已有 200 条对话，请删除旧对话后再保存。');
        const clean = turns[0]!.question
          .replace(/\s+/g, ' ')
          .trim()
          .replaceAll(String.fromCharCode(0), '');
        const title = Array.from(clean).slice(0, 48).join('').trim() || '新的对话';
        await client.query(
          'INSERT INTO jhaven.chat_conversations (user_id, id, title) VALUES ($1, $2, $3)',
          [user, id, title],
        );
      }
      const messages = turns.flatMap(({ question, sentOn, text, ...metadata }, index) => [
        { position: index * 2, role: 'user', content: question, metadata: { sentOn } },
        { position: index * 2 + 1, role: 'assistant', content: text, metadata },
      ]);
      await client.query(
        `INSERT INTO jhaven.chat_messages (user_id, conversation_id, position, role, content, metadata)
        SELECT $1, $2, position, role, content, metadata
        FROM jsonb_to_recordset($3::jsonb) AS m(position int, role text, content text, metadata jsonb)`,
        [user, id, JSON.stringify(messages)],
      );
      return detail(client, user, id);
    });
    response.json(saved);
  });
  router.patch('/:id', csrf, limit, json({ limit: '1kb' }), async (request, response) => {
    const id = parse(z.uuid(), request.params.id);
    const { title } = parse(z.strictObject({ title: chatTitle }), request.body);
    const user = response.locals.account.id;
    const value = await write(database(), user, async (client) => {
      const { rowCount } = await client.query(
        'UPDATE jhaven.chat_conversations SET title = $3, updated_at = now() WHERE user_id = $1 AND id = $2',
        [user, id, title],
      );
      if (!rowCount) missing();
      return detail(client, user, id);
    });
    response.json(chatSummary.parse(value));
  });
  router.delete('/:id', csrf, limit, async (request, response) => {
    const id = parse(z.uuid(), request.params.id);
    const user = response.locals.account.id;
    await write(database(), user, async (client) => {
      const { rowCount } = await client.query(
        'DELETE FROM jhaven.chat_conversations WHERE user_id = $1 AND id = $2',
        [user, id],
      );
      if (!rowCount) missing();
    });
    response.status(204).end();
  });
  router.delete('/', csrf, limit, async (_request, response) => {
    const user = response.locals.account.id;
    response.json(
      await write(database(), user, async (client) => {
        await client.query('DELETE FROM jhaven.chat_conversations WHERE user_id = $1', [user]);
        await client.query(
          `INSERT INTO jhaven.chat_history_settings (user_id, epoch)
        VALUES ($1, 1) ON CONFLICT (user_id) DO UPDATE SET epoch = chat_history_settings.epoch + 1`,
          [user],
        );
        return settings(client, user);
      }),
    );
  });
  return router;
}
