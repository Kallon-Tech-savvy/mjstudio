import { ForbiddenError, NotFoundError } from '../../errors.js';
import type { ClientContext } from '../../auth/context.js';

export function canAccessGalleryBySession(client: ClientContext, galleryId: string): void {
  if (!client || client.galleryId !== galleryId) {
    throw new NotFoundError('GALLERY_NOT_FOUND', 'Gallery not found.');
  }
}

export function canReadClientGallery(client: ClientContext, galleryId: string): void {
  canAccessGalleryBySession(client, galleryId);
}

export function canDownloadFromGallery(client: ClientContext, galleryId: string): void {
  canAccessGalleryBySession(client, galleryId);

  if (client.permission !== 'view_download') {
    throw new ForbiddenError('DOWNLOAD_NOT_PERMITTED');
  }
}
