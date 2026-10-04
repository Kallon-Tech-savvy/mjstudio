import { z } from 'zod';
import { BadRequestError, ValidationError } from '../errors.js';

export const uuidSchema = z.string().uuid();
export const idParamSchema = z.object({ id: uuidSchema });
export const galleryParamSchema = z.object({ galleryId: uuidSchema });
export const clientParamSchema = z.object({ clientId: uuidSchema });
export const photoParamSchema = z.object({ photoId: uuidSchema });
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
}).strict();

export function parseInput<T>(schema: z.ZodType<T>, input: unknown, code = 'INVALID_REQUEST'): T {
  const result = schema.safeParse(input);
  if (!result.success) throw new ValidationError(code, result.error.issues[0]?.message ?? 'Request validation failed.');
  return result.data;
}

export function requireJsonBody(body: unknown) {
  if (body === undefined || body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw new BadRequestError('INVALID_REQUEST_BODY', 'A JSON object request body is required.');
  }
}