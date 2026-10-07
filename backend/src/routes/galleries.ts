import { Router } from 'express';
import { z } from 'zod';
import { requirePhotographerAuth, type AuthenticatedRequest } from '../middleware/authentication.js';
import type { ApplicationServices } from '../services/container.js';
import { collectionEnvelope, successEnvelope } from '../utils/response.js';
import { galleryParamSchema, paginationSchema, parseInput, requireJsonBody } from '../http/validation.js';

const updateSchema = z.object({ name: z.string().trim().min(1).max(200).optional(), expiresAt: z.string().datetime().nullable().optional() }).strict().refine((value) => Object.keys(value).length > 0);

const newClientSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  email: z.string().trim().email().max(320).optional(),
  phone: z.string().trim().min(1).max(50).optional(),
}).strict();

const createSchema = z.object({
  clientId: z.string().uuid().optional(),
  newClient: newClientSchema.optional(),
  name: z.string().trim().min(1).max(200),
  workflowStatus: z.enum(['draft', 'reviewing', 'completed']).optional(),
  expiresAt: z.string().datetime().nullable().optional(),
}).strict().refine((v) => (v.clientId !== undefined) !== (v.newClient !== undefined), {
  message: 'Provide either clientId or newClient.',
});

export function galleriesRouter(services: ApplicationServices) {
  const router = Router();
  const auth = requirePhotographerAuth(services);
  router.post('/', auth, async (req: AuthenticatedRequest, res, next) => {
    try { requireJsonBody(req.body); const input = parseInput(createSchema, req.body, 'INVALID_GALLERY_DATA'); 
      res.status(201).json(successEnvelope(await services.galleries.create(
        req.user!, {...input, expiresAt: input.expiresAt == null ? input.expiresAt : new Date(input.expiresAt) }))); }
    catch (error) { next(error); }
  });
  router.get('/', auth, async (req: AuthenticatedRequest, res, next) => {
    try { const page = parseInput(paginationSchema, req.query); const currentPage = page.page ?? 1; const limit = page.limit ?? 20; const result = await services.catalog.listGalleries(req.user!, currentPage, limit); res.json({ ...collectionEnvelope(result.items), meta: { count: result.items.length, total: result.total, page: currentPage, limit } }); }
    catch (error) { next(error); }
  });
  router.get('/:galleryId', auth, async (req: AuthenticatedRequest, res, next) => {
    try { const { galleryId } = parseInput(galleryParamSchema, req.params); res.json(successEnvelope(await services.galleries.get(req.user!, galleryId))); }
    catch (error) { next(error); }
  });
  router.patch('/:galleryId', auth, async (req: AuthenticatedRequest, res, next) => {
    try {
      const { galleryId } = parseInput(galleryParamSchema, req.params); requireJsonBody(req.body);
      const value = parseInput(updateSchema, req.body, 'INVALID_GALLERY_DATA');
      res.json(successEnvelope(await services.galleries.update(req.user!, galleryId, { ...value, expiresAt: value.expiresAt === undefined ? undefined : value.expiresAt === null ? null : new Date(value.expiresAt) })));
    } catch (error) { next(error); }
  });
  router.post('/:galleryId/publish', auth, async (req: AuthenticatedRequest, res, next) => {
    try { const { galleryId } = parseInput(galleryParamSchema, req.params); res.json(successEnvelope(await services.galleries.publish(req.user!, galleryId))); }
    catch (error) { next(error); }
  });
  router.post('/:galleryId/archive', auth, async (req: AuthenticatedRequest, res, next) => {
    try { const { galleryId } = parseInput(galleryParamSchema, req.params); res.json(successEnvelope(await services.galleries.archive(req.user!, galleryId))); }
    catch (error) { next(error); }
  });
  router.post('/:galleryId/access', auth, async (req: AuthenticatedRequest, res, next) => {
    try {
      const { galleryId } = parseInput(galleryParamSchema, req.params); requireJsonBody(req.body);
      const body = parseInput(z.object({ permission: z.enum(['view', 'view_download']), expiresAt: z.string().datetime().nullable().optional() }).strict(), req.body, 'INVALID_GALLERY_ACCESS');
      res.status(201).json(successEnvelope(await services.galleryAccess.create(req.user!, galleryId, { permission: body.permission, expiresAt: body.expiresAt == null ? body.expiresAt : new Date(body.expiresAt) })));
    } catch (error) { next(error); }
  });
  router.get('/:galleryId/access', auth, async (req: AuthenticatedRequest, res, next) => {
    try { const { galleryId } = parseInput(galleryParamSchema, req.params); const result = await services.galleryAccess.get(req.user!, galleryId); res.json(collectionEnvelope(result)); }
    catch (error) { next(error); }
  });
  router.post('/:galleryId/access/reset', auth, async (req: AuthenticatedRequest, res, next) => {
    try {
      const { galleryId } = parseInput(galleryParamSchema, req.params); requireJsonBody(req.body);
      await services.rateLimits.assertAllowed(`access-reset:${req.user!.userId}:${req.ip}`, 'access-reset');
      const body = parseInput(z.object({ permission: z.enum(['view', 'view_download']), expiresAt: z.string().datetime().nullable().optional() }).strict(), req.body, 'INVALID_GALLERY_ACCESS');
      res.json(successEnvelope(await services.galleryAccess.reset(req.user!, galleryId, body.permission, body.expiresAt == null ? body.expiresAt : new Date(body.expiresAt))));
    } catch (error) { next(error); }
  });
  router.post('/:galleryId/access/revoke', auth, async (req: AuthenticatedRequest, res, next) => {
    try { const { galleryId } = parseInput(galleryParamSchema, req.params); res.json(successEnvelope(await services.galleryAccess.revoke(req.user!, galleryId))); }
    catch (error) { next(error); }
  });
  router.post('/:galleryId/access/resend', auth, async (req: AuthenticatedRequest, res, next) => {
    try { const { galleryId } = parseInput(galleryParamSchema, req.params); res.json(successEnvelope(await services.galleryAccess.resend(req.user!, galleryId))); }
    catch (error) { next(error); }
  });
  return router;
}