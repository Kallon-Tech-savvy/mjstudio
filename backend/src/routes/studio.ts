import { Router } from 'express';
import { requirePhotographerAuth, type AuthenticatedRequest } from '../middleware/authentication.js';
import type { ApplicationServices } from '../services/container.js';
import { collectionEnvelope, successEnvelope } from '../utils/response.js';
import { z } from 'zod';

const pageSchema = z.object({ page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(20) });

export function studioRouter(services: ApplicationServices) {
  const router = Router();
  const auth = requirePhotographerAuth(services);
  router.get('/', auth, async (req: AuthenticatedRequest, res, next) => {
    try { res.json(successEnvelope(await services.catalog.getStudioSummary(req.user!))); }
    catch (error) { next(error); }
  });
  router.get('/members', auth, async (req: AuthenticatedRequest, res, next) => {
    try {
      const query = pageSchema.parse(req.query);
      const result = await services.catalog.listStudioMembers(req.user!, query.page, query.limit);
      res.json({ ...collectionEnvelope(result.items), meta: { count: result.items.length, total: result.total, page: query.page, limit: query.limit } });
    } catch (error) { next(error); }
  });
  return router;
}
