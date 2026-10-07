export type StudioStatus = 'active' | 'suspended' | 'archived';
export type UserRole = 'owner' | 'editor' | 'viewer';
export type AssetKind = 'original' | 'preview';
export type AssetState = 'pending' | 'ready' | 'superseded' | 'failed';
export type GalleryAccessState = 'active' | 'revoked' | 'expired';

export interface Studio {
  id: string;
  name: string;
  status: StudioStatus;
  createdAt?: string;
  updatedAt?: string;
}

export interface User {
  id: string;
  email: string;
  studioId: string;
  role: UserRole;
  createdAt?: string;
  updatedAt?: string;
}

export interface StudioMembership {
  id: string;
  studioId: string;
  userId: string;
  role: UserRole;
  active: boolean;
}

export interface Client {
  id: string;
  studioId: string;
  name: string;
  email?: string;
  active: boolean;
}

export interface Gallery {
  id: string;
  studioId: string;
  title: string;
  published: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface GalleryAccess {
  id: string;
  galleryId: string;
  clientId: string;
  state: GalleryAccessState;
  issuedAt: string;
  expiresAt?: string;
}

export interface Photo {
  id: string;
  galleryId: string;
  studioId: string;
  title: string;
  order: number;
  active: boolean;
}

export interface PhotoAsset {
  id: string;
  photoId: string;
  kind: AssetKind;
  state: AssetState;
  objectKey: string;
  createdAt: string;
  updatedAt?: string;
}

export interface Recommendation {
  id: string;
  clientId: string;
  galleryId: string;
  body: string;
  createdAt: string;
}

export interface Feedback {
  id: string;
  clientId: string;
  galleryId?: string;
  photoId?: string;
  message: string;
  createdAt: string;
}
