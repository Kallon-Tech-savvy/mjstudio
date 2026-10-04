import type { NextFunction, Request, Response } from 'express';
import type { ClientContext, PhotographerContext } from '../auth/context.js';
import { ForbiddenError, UnauthorizedError } from '../errors.js';
import type { ApplicationServices } from '../services/container.js';

export type AuthenticatedRequest = Request & { user?: PhotographerContext; client?: ClientContext };
export const PHOTOGRAPHER_COOKIE = '__Host-mj_session';
export const CLIENT_COOKIE = '__Secure-mj_client_session';

export function requirePhotographerAuth(services: ApplicationServices) {
  return async (req: AuthenticatedRequest, _res: Response, next: NextFunction) => {
    try {
      const token = req.cookies?.[PHOTOGRAPHER_COOKIE];
      if (!token) throw new UnauthorizedError();
      req.user = await services.auth.resolve(token);
      next();
    } catch (error) { next(error); }
  };
}

export function optionalPhotographerAuth(services: ApplicationServices) {
  return async (req: AuthenticatedRequest, _res: Response, next: NextFunction) => {
    const token = req.cookies?.[PHOTOGRAPHER_COOKIE];
    if (!token) { next(); return; }
    try { req.user = await services.auth.resolve(token); next(); }
    catch (error) { next(error); }
  };
}

export function requireClientAuth(services: ApplicationServices) {
  return async (req: AuthenticatedRequest, _res: Response, next: NextFunction) => {
    try {
      const token = req.cookies?.[CLIENT_COOKIE];
      if (!token) throw new UnauthorizedError('Client session required.');
      req.client = await services.clientSessions.resolve(token);
      next();
    } catch (error) { next(error); }
  };
}

export function requireTrustedOrigin(origins: readonly string[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) { next(); return; }
    const origin = req.get('origin');
    if (origins.length === 0 || !origin || !origins.includes(origin)) {
      next(new ForbiddenError('Request origin is not allowed.'));
      return;
    }
    next();
  };
}
