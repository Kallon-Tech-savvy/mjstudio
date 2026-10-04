import { ForbiddenError } from '../../errors.js';
import type { PhotographerContext } from '../../auth/context.js';

export type StudioResource = {
  id: string;
  studioId?: string;
};

export function ensureStudioScope(user: PhotographerContext, studioId: string): void {
  if (!user || user.studioId !== studioId) {
    throw new ForbiddenError('Studio scope mismatch.');
  }
}

export function ensureUserCanAccessStudio(user: PhotographerContext, studio: StudioResource): void {
  ensureStudioScope(user, studio.id);
}
