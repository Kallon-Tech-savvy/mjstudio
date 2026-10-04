import { Router } from 'express';
import { z } from 'zod';
import { requirePhotographerAuth, type AuthenticatedRequest } from '../middleware/authentication.js';
import type { ApplicationServices } from '../services/container.js';
import { collectionEnvelope, successEnvelope } from '../utils/response.js';
import { clientParamSchema, paginationSchema, parseInput, requireJsonBody } from '../http/validation.js';

const createSchema = z.object({ name: z.string().trim().min(1).max(200), email: z.string().trim().email().optional(), phone: z.string().trim().max(40).optional() }).strict();
const updateSchema = z.object({ name: z.string().trim().min(1).max(200).optional(), email: z.union([z.string().trim().email(), z.null()]).optional(), phone: z.union([z.string().trim().max(40), z.null()]).optional() }).strict().refine((value) => Object.keys(value).length > 0);

export function clientsRouter(services: ApplicationServices) {
  const router = Router();
  const auth = requirePhotographerAuth(services);
  router.post('/', auth, async (req: AuthenticatedRequest, res, next) => {
    try { requireJsonBody(req.body); const input = parseInput(createSchema, req.body, 'INVALID_CLIENT_DATA'); res.status(201).json(successEnvelope(await services.catalog.createClient(req.user!, input))); }
    catch (error) { next(error); }
  });
  router.get('/', auth, async (req: AuthenticatedRequest, res, next) => {
    try { const page = parseInput(paginationSchema, req.query); const currentPage = page.page ?? 1; const limit = page.limit ?? 20; const result = await services.catalog.listClients(req.user!, currentPage, limit); res.json({ ...collectionEnvelope(result.items), meta: { count: result.items.length, total: result.total, page: currentPage, limit } }); }
    catch (error) { next(error); }
  });
  router.get('/:clientId', auth, async (req: AuthenticatedRequest, res, next) => {
    try { const { clientId } = parseInput(clientParamSchema, req.params); res.json(successEnvelope(await services.catalog.getClient(req.user!, clientId))); }
    catch (error) { next(error); }
  });
  router.patch('/:clientId', auth, async (req: AuthenticatedRequest, res, next) => {
    try { const { clientId } = parseInput(clientParamSchema, req.params); requireJsonBody(req.body); const input = parseInput(updateSchema, req.body, 'INVALID_CLIENT_DATA'); res.json(successEnvelope(await services.catalog.updateClient(req.user!, clientId, input))); }
    catch (error) { next(error); }
  });
  return router;
}