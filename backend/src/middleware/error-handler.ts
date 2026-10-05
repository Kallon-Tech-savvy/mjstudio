import type { NextFunction, Request, Response } from 'express';
import { AppError, BadRequestError, ForbiddenError } from '../errors.js';
import { sanitizeForLogging } from '../logging/audit.js';
import { logger } from '../logging/logger.js';
import { errorEnvelope } from '../utils/response.js';

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  const requestId = String(req.id ?? 'unknown');

  if (err instanceof SyntaxError && 'body' in err) {
    const error = new BadRequestError('MALFORMED_JSON', 'Request body contains malformed JSON.');
    logger.warn({ err: sanitizeForLogging(err), requestId, path: req.originalUrl }, 'request parse error');
    res.status(error.statusCode).json(errorEnvelope(error.code, error.message, requestId));
    return;
  }

  if (err instanceof Error && err.message === 'CORS origin is not allowed.') {
    const error = new ForbiddenError('Request origin is not allowed.');
    res.status(error.statusCode).json(errorEnvelope(error.code, error.message, requestId));
    return;
  }

  if (typeof err === 'object' && err !== null && 'type' in err && err.type === 'entity.too.large') {
    res.status(413).json(errorEnvelope('REQUEST_TOO_LARGE', 'Request body exceeds the allowed size.', requestId));
    return;
  }


  if (err instanceof AppError) {
    logger.warn({ err: sanitizeForLogging(err), requestId, path: req.originalUrl }, 'request error');
    res.status(err.statusCode).json(errorEnvelope(err.code, err.message, requestId));
    return;
  }

  logger.error({ err: sanitizeForLogging(err), requestId, path: req.originalUrl }, 'unhandled error');
  res.status(500).json(errorEnvelope('INTERNAL_SERVER_ERROR', 'Unexpected server error.', requestId));
}
