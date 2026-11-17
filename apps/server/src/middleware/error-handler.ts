import type { ApiErrorResponse } from '@jhaven/shared';
import type { ErrorRequestHandler } from 'express';

export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export const errorHandler: ErrorRequestHandler = (error: unknown, _request, response, next) => {
  if (response.headersSent) {
    next(error);
    return;
  }

  let status = 500;
  let code = 'INTERNAL_ERROR';
  let message = '服务暂时无法处理请求，请稍后重试。';
  if (error instanceof AppError) {
    ({ status, code, message } = error);
  } else if (typeof error === 'object' && error !== null && 'type' in error) {
    if (error.type === 'entity.parse.failed') {
      status = 400;
      code = 'INVALID_JSON';
      message = '请求正文必须是有效的 JSON。';
    } else if (error.type === 'entity.too.large') {
      status = 413;
      code = 'PAYLOAD_TOO_LARGE';
      message = '请求正文超过大小限制。';
    } else if (error.type === 'charset.unsupported' || error.type === 'encoding.unsupported') {
      status = 415;
      code = 'UNSUPPORTED_ENCODING';
      message = '请求编码不受支持。';
    }
  }

  const requestId = String(response.locals.requestId);
  if (status === 500) {
    // 不记录请求正文、Cookie、私人内容或未经处理的异常信息。
    console.error('请求处理失败', { requestId });
  }
  const body: ApiErrorResponse = { error: { code, message, requestId } };
  response.status(status).json(body);
};
