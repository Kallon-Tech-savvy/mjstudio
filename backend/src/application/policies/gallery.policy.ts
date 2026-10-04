import { ForbiddenError } from '../../errors.js';
import type { PhotographerContext } from '../../auth/context.js';

export type GalleryRole = 'owner' | 'collaborator' | 'uploader';
export type GalleryPermission =
  | 'gallery.view'
  | 'gallery.update'
  | 'gallery.publish'
  | 'gallery.archive'
  | 'gallery.access.view'
  | 'gallery.access.create'
  | 'gallery.access.reset'
  | 'gallery.access.revoke'
  | 'photo.view'
  | 'photo.create'
  | 'photo.update'
  | 'photo.delete'
  | 'photo.reorder'
  | 'photo.recommend'
  | 'photo.upload'
  | 'activity.view';

export type GalleryResource = {
  id: string;
  studioId: string;
};

export const galleryRolePermissions: Record<GalleryRole, readonly GalleryPermission[]> = {
  owner: [
    'gallery.view',
    'gallery.update',
    'gallery.publish',
    'gallery.archive',
    'gallery.access.view',
    'gallery.access.create',
    'gallery.access.reset',
    'gallery.access.revoke',
    'photo.view',
    'photo.create',
    'photo.update',
    'photo.delete',
    'photo.reorder',
    'photo.recommend',
    'photo.upload',
    'activity.view',
  ],
  collaborator: [
    'gallery.view',
    'gallery.update',
    'photo.view',
    'photo.create',
    'photo.update',
    'photo.recommend',
    'photo.upload',
    'activity.view',
  ],
  uploader: ['gallery.view', 'photo.view', 'photo.create', 'photo.upload'],
} as const;

export function hasGalleryPermission(galleryRole: GalleryRole, requiredPermission: GalleryPermission): boolean {
  return galleryRolePermissions[galleryRole].includes(requiredPermission);
}

export function ensureGalleryPermission(
  user: PhotographerContext,
  gallery: GalleryResource,
  galleryRole: GalleryRole,
  permission: GalleryPermission,
): void {
  ensureUserCanAccessGallery(user, gallery);

  if (!hasGalleryPermission(galleryRole, permission)) {
    throw new ForbiddenError(`Permission ${permission} is not granted for this gallery role.`);
  }
}

export function ensureUserCanAccessGallery(user: PhotographerContext, gallery: GalleryResource): void {
  if (!user || user.studioId !== gallery.studioId) {
    throw new ForbiddenError('Gallery is outside the authenticated studio scope.');
  }
}

export function canManageGalleryMetadata(user: PhotographerContext, gallery: GalleryResource, galleryRole: GalleryRole): void {
  ensureUserCanAccessGallery(user, gallery);

  if (!hasGalleryPermission(galleryRole, 'gallery.update')) {
    throw new ForbiddenError('Gallery metadata management is not permitted for this gallery role.');
  }
}

export function canManageGalleryAccess(user: PhotographerContext, gallery: GalleryResource, galleryRole: GalleryRole): void {
  ensureUserCanAccessGallery(user, gallery);

  if (!hasGalleryPermission(galleryRole, 'gallery.access.create') && !hasGalleryPermission(galleryRole, 'gallery.access.reset') && !hasGalleryPermission(galleryRole, 'gallery.access.revoke')) {
    throw new ForbiddenError('Gallery access management is not permitted for this gallery role.');
  }
}

export function canPublishGallery(user: PhotographerContext, gallery: GalleryResource, galleryRole: GalleryRole): void {
  ensureUserCanAccessGallery(user, gallery);

  if (!hasGalleryPermission(galleryRole, 'gallery.publish')) {
    throw new ForbiddenError('Gallery publishing is not permitted for this gallery role.');
  }
}
