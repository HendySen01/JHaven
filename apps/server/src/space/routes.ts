import { randomUUID } from 'node:crypto';
import { Router, type Request, type Response, type RequestHandler } from 'express';
import type { Pool, QueryResultRow } from 'pg';
import { z } from 'zod';
import {
  accountPreset,
  journalEntry,
  journalInput,
  journalRange,
  presetInput,
  spacePreferences,
} from '@jhaven/shared';
import { inTransaction } from '../db/pool.js';
import { AppError } from '../middleware/error-handler.js';

const uuid = z.uuid();
const empty = z.strictObject({});
const diaryColumns =
  "id, to_char(entry_date, 'YYYY-MM-DD') AS date, timezone, bedtime, asleep, wake, rest, note";
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
  if (typeof error === 'object' && error && 'code' in error && error.code === '23505')
    throw new AppError(409, 'ENTRY_CONFLICT', message);
  throw error;
}
function preset(row: QueryResultRow) {
  return accountPreset.parse({ id: row.id, name: row.name, mix: row.mix });
}
function diary(row: QueryResultRow) {
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
    const [{ rows: presets }, { rows: settings }] = await Promise.all([
      db.query<QueryResultRow>(
        'SELECT id, name, mix FROM jhaven.sound_presets WHERE user_id = $1 ORDER BY name, id',
        [user],
      ),
      db.query<QueryResultRow>(
        'SELECT p.builtin_id, s.id AS preset_id, p.volume, p.timer_minutes FROM jhaven.user_preferences p LEFT JOIN jhaven.sound_presets s ON s.id=p.preset_id AND s.user_id=p.user_id WHERE p.user_id=$1',
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
      await database().query(
        'INSERT INTO jhaven.sound_presets (id,user_id,name,mix) VALUES ($1,$2,$3,$4)',
        [id, String(response.locals.account.id), input.name, JSON.stringify(input.mix)],
      );
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
      const result = await database().query(
        'UPDATE jhaven.sound_presets SET name=$1,mix=$2 WHERE id=$3 AND user_id=$4',
        [input.name, JSON.stringify(input.mix), id, String(response.locals.account.id)],
      );
      if (!result.rowCount) missing();
    } catch (error) {
      duplicate(error, '已有同名场景，请改名后重试。');
    }
    response.json({ id, ...input });
  });
  router.delete('/presets/:id', write, async (request: Request, response: Response) => {
    parse(empty, request.query);
    parse(empty, request.body);
    const result = await database().query(
      'DELETE FROM jhaven.sound_presets WHERE id=$1 AND user_id=$2',
      [parse(uuid, request.params.id), String(response.locals.account.id)],
    );
    if (!result.rowCount) missing();
    response.status(204).end();
  });
  router.put('/preferences', write, async (request: Request, response: Response) => {
    parse(empty, request.query);
    const input = parse(spacePreferences, request.body);
    const user = String(response.locals.account.id);
    const builtin = input.scene?.kind === 'builtin' ? input.scene.id : null;
    const id = input.scene?.kind === 'preset' ? input.scene.id : null;
    await inTransaction(database(), async (connection) => {
      if (id) {
        const { rows: owned } = await connection.query<QueryResultRow>(
          'SELECT id FROM jhaven.sound_presets WHERE id=$1 AND user_id=$2 FOR SHARE',
          [id, user],
        );
        if (!owned.length) missing();
      }
      await connection.query(
        'INSERT INTO jhaven.user_preferences (user_id,builtin_id,preset_id,volume,timer_minutes) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (user_id) DO UPDATE SET builtin_id=EXCLUDED.builtin_id,preset_id=EXCLUDED.preset_id,volume=EXCLUDED.volume,timer_minutes=EXCLUDED.timer_minutes',
        [user, builtin, id, input.volume, input.timerMinutes],
      );
    });
    response.json(input);
  });
  router.delete('/preferences', write, async (request: Request, response: Response) => {
    parse(empty, request.query);
    parse(empty, request.body);
    await database().query('DELETE FROM jhaven.user_preferences WHERE user_id=$1', [
      String(response.locals.account.id),
    ]);
    response.status(204).end();
  });
  router.get('/diary', async (request, response) => {
    const { from, to } = parse(journalRange, request.query);
    const { rows } = await database().query<QueryResultRow>(
      `SELECT ${diaryColumns} FROM jhaven.sleep_diaries WHERE user_id=$1 AND entry_date BETWEEN $2 AND $3 ORDER BY entry_date DESC`,
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
        input.bedtime,
        input.asleep,
        input.wake,
        input.rest,
        input.note,
      ];
      try {
        const result = edit
          ? await database().query(
              'UPDATE jhaven.sleep_diaries SET entry_date=$1,timezone=$2,bedtime=$3,asleep=$4,wake=$5,rest=$6,note=$7 WHERE id=$8 AND user_id=$9',
              [...values, id, user],
            )
          : await database().query(
              'INSERT INTO jhaven.sleep_diaries (id,user_id,entry_date,timezone,bedtime,asleep,wake,rest,note) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
              [id, user, ...values],
            );
        if (edit && !result.rowCount) missing();
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
    const result = await database().query(
      'DELETE FROM jhaven.sleep_diaries WHERE id=$1 AND user_id=$2',
      [parse(uuid, request.params.id), String(response.locals.account.id)],
    );
    if (!result.rowCount) missing();
    response.status(204).end();
  });
  return router;
}
