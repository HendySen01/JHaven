import { relaxationInput, relaxationRecord } from '@jhaven/shared';
import { Router, type RequestHandler } from 'express';
import type { Pool, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { z } from 'zod';
import { AppError } from '../middleware/error-handler.js';

const empty = z.strictObject({});
const uuid = z.uuid();

export function createRelaxationRouter(
  database: () => Pool,
  requireOrigin: RequestHandler,
  limit: RequestHandler,
) {
  const router = Router();
  router.get('/', async (request, response) => {
    if (!empty.safeParse(request.query).success)
      throw new AppError(400, 'INVALID_INPUT', '请检查请求字段。');
    const [rows] = await database().execute<RowDataPacket[]>(
      'SELECT id, practice, duration_seconds, completed, created_at FROM relaxation_sessions WHERE user_id=? ORDER BY created_at DESC, id DESC LIMIT 50',
      [response.locals.account.id],
    );
    response.json(
      rows.map((row) =>
        relaxationRecord.parse({
          id: row.id,
          practice: row.practice,
          seconds: row.duration_seconds,
          completed: row.completed === 1,
          createdAt: row.created_at.toISOString(),
        }),
      ),
    );
  });
  router.post('/', requireOrigin, limit, async (request, response) => {
    const record = relaxationInput.safeParse(request.body);
    if (!empty.safeParse(request.query).success || !record.success)
      throw new AppError(400, 'INVALID_INPUT', '请检查练习记录字段。');
    const { id, practice, seconds, completed } = record.data;
    try {
      await database().execute(
        'INSERT INTO relaxation_sessions (user_id, id, practice, duration_seconds, completed) VALUES (?, ?, ?, ?, ?)',
        [response.locals.account.id, id, practice, seconds, Number(completed)],
      );
      response.status(201).json({ id });
    } catch (error) {
      if (!(typeof error === 'object' && error && 'code' in error && error.code === 'ER_DUP_ENTRY'))
        throw error;
      const [rows] = await database().execute<RowDataPacket[]>(
        'SELECT id FROM relaxation_sessions WHERE user_id=? AND id=? AND practice=? AND duration_seconds=? AND completed=?',
        [response.locals.account.id, id, practice, seconds, Number(completed)],
      );
      if (!rows.length) throw new AppError(409, 'ENTRY_CONFLICT', '同一练习记录已经保存。');
      response.status(200).json({ id });
    }
  });
  router.delete('/:id', requireOrigin, limit, async (request, response) => {
    const id = uuid.safeParse(request.params.id);
    if (
      !id.success ||
      !empty.safeParse(request.query).success ||
      !empty.safeParse(request.body).success
    )
      throw new AppError(400, 'INVALID_INPUT', '请检查练习记录编号。');
    const [result] = await database().execute<ResultSetHeader>(
      'DELETE FROM relaxation_sessions WHERE user_id=? AND id=?',
      [response.locals.account.id, id.data],
    );
    if (!result.affectedRows) throw new AppError(404, 'ENTRY_NOT_FOUND', '此记录不存在。');
    response.status(204).end();
  });
  return router;
}
