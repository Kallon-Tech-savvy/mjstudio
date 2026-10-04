import { ForbiddenError } from '../errors.js';
import type { ClientContext, PhotographerContext } from './context.js';

export type GalleryPermission = 'view' | 'view_download';

export function ensurePhotographerCanAccessStudio(user: PhotographerContext, studioId: string): void {
  if (user.studioId !== studioId) {
    throw new ForbiddenError('Photographer is not allowed to access this studio.');
  }
}

export function ensureGalleryAccessAllowed(client: ClientContext, requiredPermission: GalleryPermission): void {
  const permissionOrder: Record<GalleryPermission, number> = {
    view: 1,
    view_download: 2,
  };

  if (permissionOrder[client.permission] < permissionOrder[requiredPermission]) {
    throw new ForbiddenError('Gallery access does not allow this action.');
  }
}
