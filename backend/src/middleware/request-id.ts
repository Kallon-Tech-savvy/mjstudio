import type { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction) {
  const requestId = `req_${randomUUID()}`;
  (req as Request & { id?: string }).id = requestId;
  res.setHeader('x-request-id', requestId);
  next();
}
