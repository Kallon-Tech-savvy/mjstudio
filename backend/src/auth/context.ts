import { UnauthorizedError } from '../errors.js';

export type PhotographerContext = {
  userId: string;
  email: string;
  displayName: string;
  studioId: string;
  membershipId: string;
  role: 'owner' | 'admin' | 'photographer' | 'assistant';
};

export type ClientContext = {
  sessionId: string;
  clientSessionId: string;
  galleryAccessId: string;
  galleryId: string;
  permission: 'view' | 'view_download';
  isAuthenticated: true;
  expiresAt?: string;
  revokedAt?: string | null;
};

export type AuthenticatedUserContext = PhotographerContext;

export const DEV_AUTH_CONTEXT: PhotographerContext = {
  userId: '11111111-1111-4111-8111-111111111111',
  email: 'owner@example.com',
  displayName: 'Owner User',
  studioId: '22222222-2222-4222-8222-222222222222',
  membershipId: '33333333-3333-4333-8333-333333333333',
  role: 'owner',
};

export const DEV_CLIENT_SESSION_CONTEXT: ClientContext = {
  sessionId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  clientSessionId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  galleryAccessId: '66666666-6666-4666-8666-666666666666',
  galleryId: '55555555-5555-4555-8555-555555555555',
  permission: 'view_download',
  isAuthenticated: true,
};

export function buildPhotographerContext(input: Partial<PhotographerContext> = {}): PhotographerContext {
  return {
    userId: input.userId ?? DEV_AUTH_CONTEXT.userId,
    email: input.email ?? DEV_AUTH_CONTEXT.email,
    displayName: input.displayName ?? DEV_AUTH_CONTEXT.displayName,
    studioId: input.studioId ?? DEV_AUTH_CONTEXT.studioId,
    membershipId: input.membershipId ?? DEV_AUTH_CONTEXT.membershipId,
    role: input.role ?? DEV_AUTH_CONTEXT.role,
  };
}

export function buildAuthenticatedUserContext(input: Partial<AuthenticatedUserContext> = {}): AuthenticatedUserContext {
  return buildPhotographerContext(input);
}

export function buildClientContext(input: Partial<ClientContext> = {}): ClientContext {
  return {
    sessionId: input.sessionId ?? input.clientSessionId ?? DEV_CLIENT_SESSION_CONTEXT.sessionId,
    clientSessionId: input.clientSessionId ?? DEV_CLIENT_SESSION_CONTEXT.clientSessionId,
    galleryAccessId: input.galleryAccessId ?? DEV_CLIENT_SESSION_CONTEXT.galleryAccessId,
    galleryId: input.galleryId ?? DEV_CLIENT_SESSION_CONTEXT.galleryId,
    permission: input.permission ?? DEV_CLIENT_SESSION_CONTEXT.permission,
    isAuthenticated: input.isAuthenticated ?? DEV_CLIENT_SESSION_CONTEXT.isAuthenticated,
    expiresAt: input.expiresAt ?? DEV_CLIENT_SESSION_CONTEXT.expiresAt,
    revokedAt: input.revokedAt ?? DEV_CLIENT_SESSION_CONTEXT.revokedAt,
  };
}

