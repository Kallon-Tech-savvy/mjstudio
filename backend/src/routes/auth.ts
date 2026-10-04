import { Router } from 'express';
import { z } from 'zod';
import { ValidationError } from '../errors.js';
import { optionalPhotographerAuth, PHOTOGRAPHER_COOKIE, requirePhotographerAuth, type AuthenticatedRequest } from '../middleware/authentication.js';
import type { ApplicationServices } from '../services/container.js';
import { env } from '../config/env.js';
import { successEnvelope } from '../utils/response.js';

const loginSchema = z.object({
  email: z.string().trim().email({ message: 'Email is required.' }),
  password: z.string().min(8, 'Password must be at least 8 characters long.'),
});

export function validateLoginPayload(input: unknown) {
  const parsed = loginSchema.safeParse(input);

  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? 'Invalid credentials.';
    throw new ValidationError('INVALID_CREDENTIALS', message);
  }

  return parsed.data;
}

export function authRouter(services: ApplicationServices) {
  const router = Router();

  router.post('/login', async (req, res, next) => {
    try {
      const payload = validateLoginPayload(req.body);
      await services.rateLimits.assertAllowed(`login:${req.ip}`, 'login');
      const result = await services.auth.login(payload.email, payload.password);
      res.cookie(PHOTOGRAPHER_COOKIE, result.sessionToken, {
        httpOnly: true, secure: true, sameSite: 'lax', path: '/', expires: result.expiresAt,
      });
      const { userId, email, displayName, studioId, role } = result.context;
      res.status(200).json(successEnvelope({ user: { userId, email, displayName, studioId, role }, authenticated: true }));
    } catch (error) { next(error); }
  });

  router.post('/logout', async (req, res, next) => {
    try {
      const token = req.cookies?.[PHOTOGRAPHER_COOKIE];
      if (token) await services.auth.logout(token);
      res.clearCookie(PHOTOGRAPHER_COOKIE, { httpOnly: true, secure: true, sameSite: 'lax', path: '/' });
      res.status(204).send();
    } catch (error) { next(error); }
  });

  router.get('/me', optionalPhotographerAuth(services), (req: AuthenticatedRequest, res) => {
    const user = req.user;
    res.json(successEnvelope({ user: user ? { userId: user.userId, email: user.email, displayName: user.displayName, studioId: user.studioId, role: user.role } : null }));
  });

  router.get('/protected-check', requirePhotographerAuth(services), (req: AuthenticatedRequest, res) => {
    const user = req.user!;
    res.json(successEnvelope({ user: { userId: user.userId, email: user.email, displayName: user.displayName, studioId: user.studioId, role: user.role } }));
  });

  return router;
}
