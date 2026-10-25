import { describe, expect, it } from 'vitest';

import type { Gallery, PhotoAsset, Studio, User } from '../src/domain/index.js';
import type { AuthorizationDecision, AuthorizationRequest, AuthorizationService } from '../src/application/index.js';
import type { Clock, JobQueue, ObjectStorage } from '../src/infrastructure/index.js';

describe('phase 10 architecture scaffolding', () => {
  it('defines the domain and application contracts required by the architecture gate', () => {
    const studio: Studio = {
      id: 'studio_123',
      name: 'Studio One',
      status: 'active',
    };

    const user: User = {
      id: 'user_123',
      email: 'owner@example.com',
      studioId: studio.id,
      role: 'owner',
    };

    const gallery: Gallery = {
      id: 'gallery_123',
      studioId: studio.id,
      title: 'Spring Session',
      published: false,
    };

    const photoAsset: PhotoAsset = {
      id: 'asset_123',
      photoId: 'photo_123',
      kind: 'preview',
      state: 'ready',
      objectKey: 'photos/photo_123/preview.jpg',
      createdAt: new Date().toISOString(),
    };

    expect(studio.status).toBe('active');
    expect(user.studioId).toBe(studio.id);
    expect(gallery.studioId).toBe(studio.id);
    expect(photoAsset.kind).toBe('preview');
  });

  it('defines authorization and infrastructure abstractions', () => {
    const request: AuthorizationRequest = {
      actor: { type: 'studio_user', userId: 'user_123' },
      operation: 'gallery.update',
      resource: { type: 'gallery', id: 'gallery_123' },
      context: { studioId: 'studio_123' },
    };

    const decision: AuthorizationDecision = {
      allowed: true,
      reason: 'authorized',
      actor: request.actor,
      resource: request.resource,
    };

    const authorizationService: AuthorizationService = {
      authorize: async () => decision,
    };

    const clock: Clock = { now: () => new Date('2026-01-01T00:00:00.000Z') };
    const storage: ObjectStorage = {
      createUploadCapability: async () => ({ url: 'https://example.com/upload', expiresAt: '2026-01-01T00:05:00.000Z' }),
      verifyObject: async () => ({ ok: true, objectKey: 'photos/photo_123/preview.jpg' }),
    };
    const queue: JobQueue = {
      enqueue: async () => undefined,
    };

    expect(request.operation).toBe('gallery.update');
    expect(decision.allowed).toBe(true);
    expect(authorizationService.authorize).toBeTypeOf('function');
    expect(clock.now().toISOString()).toBe('2026-01-01T00:00:00.000Z');
    expect(storage.createUploadCapability).toBeTypeOf('function');
    expect(queue.enqueue).toBeTypeOf('function');
  });
});
