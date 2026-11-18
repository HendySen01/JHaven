import { randomUUID } from 'node:crypto';
import { Router, type Request, type Response, type RequestHandler } from 'express';
import type { Pool, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { z } from 'zod';
import {
  accountPreset,
  journalEntry,
  journalInput,
  journalRange,
  presetInput,
  spacePreferences,
} from '@jhaven/shared';
import { AppError } from '../middleware/error-handler.js';

const uuid = z.uuid();
const empty = z.strictObject({});
const diaryColumns =
  'id, CAST(entry_date AS CHAR) AS date, timezone, bedtime, asleep, wake, rest, note';
const sqlTime = (value: string | null) => value?.slice(0, 19).replace('T', ' ') ?? null;
const isoTime = (value: Date | null) => value?.toISOString().replace('.000Z', 'Z') ?? null;
function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new AppError(400, 'INVALID_INPUT', '请检查日期、时间顺序、时区或表单字段。');
  return result.data;
}
function missing(): never {
  throw new AppError(404, 'ENTRY_NOT_FOUND', '此记录不存在。');
}
function duplicate(error: unknown, message: string): never {
  if (typeof error === 'object' && error && 'code' in error && error.code === 'ER_DUP_ENTRY')
    throw new AppError(409, 'ENTRY_CONFLICT', message);
  throw error;
}
function preset(row: RowDataPacket) {
  return accountPreset.parse({ id: row.id, name: row.name, mix: row.mix });
}
function diary(row: RowDataPacket) {
  return journalEntry.parse({
    id: row.id,
    date: row.date,
    timezone: row.timezone,
    bedtime: isoTime(row.bedtime),
    asleep: isoTime(row.asleep),
    wake: isoTime(row.wake),
    rest: row.rest,
    note: row.note,
  });
}

export function createSpaceRouter(
  database: () => Pool,
  csrf: RequestHandler,
  limit: RequestHandler,
) {
  const router = Router();
  const write = [csrf, limit];
  router.get('/', async (request, response) => {
    parse(empty, request.query);
    const user = String(response.locals.account.id);
    const db = database();
    const [[presets], [settings]] = await Promise.all([
      db.execute<RowDataPacket[]>(
        'SELECT id, name, mix FROM sound_presets WHERE user_id = ? ORDER BY name, id',
        [user],
      ),
      db.execute<RowDataPacket[]>(
        'SELECT p.builtin_id, s.id AS preset_id, p.volume, p.timer_minutes FROM user_preferences p LEFT JOIN sound_presets s ON s.id=p.preset_id AND s.user_id=p.user_id WHERE p.user_id=?',
        [user],
      ),
    ]);
    const p = settings[0];
    response.json({
      presets: presets.map(preset),
      preferences: p
        ? spacePreferences.parse({
            scene: p.preset_id
              ? { kind: 'preset', id: p.preset_id }
              : p.builtin_id
                ? { kind: 'builtin', id: p.builtin_id }
                : null,
            volume: p.volume,
            timerMinutes: p.timer_minutes,
          })
        : null,
    });
  });
  router.post('/presets', write, async (request: Request, response: Response) => {
    parse(empty, request.query);
    const input = parse(presetInput, request.body);
    const id = randomUUID();
    try {
      await database().execute('INSERT INTO sound_presets (id,user_id,name,mix) VALUES (?,?,?,?)', [
        id,
        String(response.locals.account.id),
        input.name,
        JSON.stringify(input.mix),
      ]);
    } catch (error) {
      duplicate(error, '已有同名场景，请改名后重试。');
    }
    response.status(201).json({ id, ...input });
  });
  router.put('/presets/:id', write, async (request: Request, response: Response) => {
    parse(empty, request.query);
    const id = parse(uuid, request.params.id);
    const input = parse(presetInput, request.body);
    try {
      const [result] = await database().execute<ResultSetHeader>(
        'UPDATE sound_presets SET name=?,mix=? WHERE id=? AND user_id=?',
        [input.name, JSON.stringify(input.mix), id, String(response.locals.account.id)],
      );
      if (!result.affectedRows) missing();
    } catch (error) {
      duplicate(error, '已有同名场景，请改名后重试。');
    }
    response.json({ id, ...input });
  });
  router.delete('/presets/:id', write, async (request: Request, response: Response) => {
    parse(empty, request.query);
    parse(empty, request.body);
    const [result] = await database().execute<ResultSetHeader>(
      'DELETE FROM sound_presets WHERE id=? AND user_id=?',
      [parse(uuid, request.params.id), String(response.locals.account.id)],
    );
    if (!result.affectedRows) missing();
    response.status(204).end();
  });
  router.put('/preferences', write, async (request: Request, response: Response) => {
    parse(empty, request.query);
    const input = parse(spacePreferences, request.body);
    const user = String(response.locals.account.id);
    const builtin = input.scene?.kind === 'builtin' ? input.scene.id : null;
    const id = input.scene?.kind === 'preset' ? input.scene.id : null;
    const connection = await database().getConnection();
    try {
      await connection.beginTransaction();
      if (id) {
        const [owned] = await connection.execute<RowDataPacket[]>(
          'SELECT id FROM sound_presets WHERE id=? AND user_id=? FOR SHARE',
          [id, user],
        );
        if (!owned.length) missing();
      }
      const fields = [builtin, id, input.volume, input.timerMinutes];
      await connection.execute(
        'INSERT INTO user_preferences (user_id,builtin_id,preset_id,volume,timer_minutes) VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE builtin_id=?,preset_id=?,volume=?,timer_minutes=?',
        [user, ...fields, ...fields],
      );
      await connection.commit();
    } catch (error) {
      await connection.rollback().catch(() => connection.destroy());
      throw error;
    } finally {
      connection.release();
    }
    response.json(input);
  });
  router.delete('/preferences', write, async (request: Request, response: Response) => {
    parse(empty, request.query);
    parse(empty, request.body);
    await database().execute('DELETE FROM user_preferences WHERE user_id=?', [
      String(response.locals.account.id),
    ]);
    response.status(204).end();
  });
  router.get('/diary', async (request, response) => {
    const { from, to } = parse(journalRange, request.query);
    const [rows] = await database().execute<RowDataPacket[]>(
      `SELECT ${diaryColumns} FROM sleep_diaries WHERE user_id=? AND entry_date BETWEEN ? AND ? ORDER BY entry_date DESC`,
      [String(response.locals.account.id), from, to],
    );
    response.json(rows.map(diary));
  });
  function saveDiary(edit: boolean): RequestHandler {
    return async (request, response) => {
      parse(empty, request.query);
      const input = parse(journalInput, request.body);
      const id = edit ? parse(uuid, request.params.id) : randomUUID();
      const user = String(response.locals.account.id);
      const values = [
        input.date,
        input.timezone,
        sqlTime(input.bedtime),
        sqlTime(input.asleep),
        sqlTime(input.wake),
        input.rest,
        input.note,
      ];
      try {
        const [result] = edit
          ? await database().execute<ResultSetHeader>(
              'UPDATE sleep_diaries SET entry_date=?,timezone=?,bedtime=?,asleep=?,wake=?,rest=?,note=? WHERE id=? AND user_id=?',
              [...values, id, user],
            )
          : await database().execute<ResultSetHeader>(
              'INSERT INTO sleep_diaries (id,user_id,entry_date,timezone,bedtime,asleep,wake,rest,note) VALUES (?,?,?,?,?,?,?,?,?)',
              [id, user, ...values],
            );
        if (edit && !result.affectedRows) missing();
      } catch (error) {
        duplicate(error, '该日期已有日记，请编辑原记录或选择其他日期。');
      }
      response.status(edit ? 200 : 201).json({ id, ...input });
    };
  }
  router.post('/diary', write, saveDiary(false));
  router.put('/diary/:id', write, saveDiary(true));
  router.delete('/diary/:id', write, async (request: Request, response: Response) => {
    parse(empty, request.query);
    parse(empty, request.body);
    const [result] = await database().execute<ResultSetHeader>(
      'DELETE FROM sleep_diaries WHERE id=? AND user_id=?',
      [parse(uuid, request.params.id), String(response.locals.account.id)],
    );
    if (!result.affectedRows) missing();
    response.status(204).end();
  });
  return router;
}
