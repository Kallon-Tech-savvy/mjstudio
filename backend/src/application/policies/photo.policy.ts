import { ForbiddenError } from '../../errors.js';
import type { PhotographerContext } from '../../auth/context.js';
import type { GalleryResource } from './gallery.policy.js';

export type PhotoResource = {
  id: string;
  galleryId: string;
};

export function ensurePhotoInGallery(photo: PhotoResource, galleryId: string): void {
  if (!photo || photo.galleryId !== galleryId) {
    throw new ForbiddenError('Photo does not belong to the requested gallery.');
  }
}

export function canRecommendPhoto(user: PhotographerContext, gallery: GalleryResource, photo: PhotoResource): void {
  if (!user || user.studioId !== gallery.studioId) {
    throw new ForbiddenError('Photographer is not authorized for this gallery.');
  }

  ensurePhotoInGallery(photo, gallery.id);

  if (!['owner', 'admin', 'photographer'].includes(user.role)) {
    throw new ForbiddenError('Recommendation management is not permitted for this role.');
  }
}
