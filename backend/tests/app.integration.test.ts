import request from 'supertest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { UnauthorizedError } from '../src/errors.js';
import { buildClientContext, buildPhotographerContext } from '../src/auth/context.js';
import type { ApplicationServices } from '../src/services/container.js';
import { LocalPhotoStorage } from '../src/services/local-photo-storage.js';

const baseServices = () => ({
  auth: {
    login: async () => { throw new UnauthorizedError('Invalid email or password.'); },
    resolve: async () => buildPhotographerContext(),
    logout: async () => undefined,
  },
  galleries: { create: async (_actor: unknown, input: unknown) => {
    if (JSON.stringify(input).includes('studioId') || JSON.stringify(input).includes('role')) throw new Error('forged authority reached service');
    return { id: '55555555-5555-4555-8555-555555555555', name: 'Portraits' };
  }, get: async () => ({}), update: async () => ({}), publish: async () => ({}), archive: async () => ({}) },
  photos: {}, galleryAccess: {}, clientSessions: {}, selections: {}, recommendations: {}, downloads: {}, feedback: {},
  catalog: {},
  rateLimits: { assertAllowed: async () => undefined },
}) as unknown as ApplicationServices;

describe('API foundation', () => {
  it('serves client previews through a session-authorized, no-store route', async () => {
    const client = buildClientContext();
    const bytes = Buffer.from('verified-preview-bytes');
    const readObjectBytes = vi.fn(async (key: string) => {
      expect(key).toBe('studios/studio-1/galleries/gallery-1/photos/photo-1/preview');
      return bytes;
    });
    const services = {
      ...baseServices(),
      clientSessions: {
        resolve: async () => client,
        assertGallery: async () => undefined,
      },
      catalog: {
        getClientRepresentation: async () => ({
          storageKey: 'studios/studio-1/galleries/gallery-1/photos/photo-1/preview',
          mimeType: 'image/webp',
        }),
      },
      photoStorage: { readObjectBytes },
    } as unknown as ApplicationServices;

    const response = await request(createApp(services, { allowedOrigins: ['http://localhost:3000'] }))
      .get('/api/client/galleries/55555555-5555-4555-8555-555555555555/photos/44444444-4444-4444-8444-444444444444/representations/preview')
      .set('Cookie', '__Secure-mj_client_session=valid-session');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({});
    expect(response.headers['content-type']).toContain('image/webp');
    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.body).toEqual(bytes);
    expect(readObjectBytes).toHaveBeenCalledTimes(1);
  });

  it('does not expose originals through the client representation route', async () => {
    const client = buildClientContext();
    const services = {
      ...baseServices(),
      clientSessions: { resolve: async () => client, assertGallery: async () => undefined },
      catalog: { getClientRepresentation: async () => { throw new Error('must not be called'); } },
      photoStorage: { readObjectBytes: async () => { throw new Error('must not be called'); } },
    } as unknown as ApplicationServices;
    const response = await request(createApp(services))
      .get('/api/client/galleries/55555555-5555-4555-8555-555555555555/photos/44444444-4444-4444-8444-444444444444/representations/original')
      .set('Cookie', '__Secure-mj_client_session=valid-session');
    expect(response.status).toBe(422);
  });

  it('rate-limits credential resend before calling the access service', async () => {
    const actor = buildPhotographerContext();
    const rateLimitCalls: Array<{ key: string; scope: string }> = [];
    let resendCalled = false;
    const services = {
      ...baseServices(),
      auth: {
        login: async () => { throw new UnauthorizedError('Invalid email or password.'); },
        resolve: async () => actor,
        logout: async () => undefined,
      },
      galleryAccess: {
        resend: async () => {
          resendCalled = true;
          return { resent: true, accessId: 'new-grant' };
        },
      },
      rateLimits: {
        assertAllowed: async (key: string, scope: string) => {
          rateLimitCalls.push({ key, scope });
        },
      },
    } as unknown as ApplicationServices;

    const response = await request(createApp(services, { allowedOrigins: ['http://localhost:3000'] }))
      .post('/api/galleries/55555555-5555-4555-8555-555555555555/access/resend')
      .set('Origin', 'http://localhost:3000')
      .set('Cookie', '__Host-mj_session=valid');

    expect(response.status).toBe(200);
    expect(rateLimitCalls).toHaveLength(1);
    expect(rateLimitCalls[0]?.scope).toBe('access-reset');
    expect(rateLimitCalls[0]?.key).toMatch(new RegExp('^access-resend:' + actor.userId + ':'));
    expect(resendCalled).toBe(true);
  });

  it('does not claim provider readiness from the API root endpoint', async () => {
    const response = await request(createApp()).get('/api');

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe('running');
    expect(response.body.data.status).not.toBe('ready');
  });

  it('GET /api/health should return the API health envelope', async () => {
    const response = await request(createApp()).get('/api/health');

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe('ok');
    expect(response.headers['x-request-id']).toBeDefined();
  });

  it('POST /api/auth/login fails closed when the configured password provider rejects credentials', async () => {
    const response = await request(createApp(undefined, { allowedOrigins: ['http://localhost:3000'] }))
      .post('/api/auth/login')
      .set('Origin', 'http://localhost:3000')
      .send({ email: 'studio@example.com', password: 'password123' });

    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe('SERVICE_UNAVAILABLE');
  });

  it('POST /api/auth/login should reject invalid input with a stable error code', async () => {
    const response = await request(createApp(baseServices(), { allowedOrigins: ['http://localhost:3000'] }))
      .post('/api/auth/login')
      .set('Origin', 'http://localhost:3000')
      .send({ email: 'not-an-email', password: 'short' });

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('INVALID_CREDENTIALS');
    expect(response.body.error.request_id).toMatch(/^req_/);
    expect(response.headers['x-request-id']).toBe(response.body.error.request_id);
  });

  it('POST /api/client/access/verify returns the gallery resolved from the verified grant', async () => {
    const services = {
      ...baseServices(),
      clientSessions: {
        create: async () => ({
          sessionId: 'session-1',
          sessionToken: 'opaque-session-token',
          expiresAt: new Date('2026-10-05T12:00:00.000Z'),
          galleryId: '55555555-5555-4555-8555-555555555555',
        }),
      },
    } as unknown as ApplicationServices;
    const response = await request(createApp(services, { allowedOrigins: ['http://localhost:3000'] }))
      .post('/api/client/access/verify')
      .set('Origin', 'http://localhost:3000')
      .send({ secret: 'a'.repeat(32), pin: '123456' });

    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({
      authenticated: true,
      galleryId: '55555555-5555-4555-8555-555555555555',
    });
  });

  it('does not trust a caller-supplied request ID', async () => {
    const response = await request(createApp()).get('/api/health').set('X-Request-ID', 'chosen-by-client');
    expect(response.headers['x-request-id']).not.toBe('chosen-by-client');
    expect(response.headers['x-request-id']).toMatch(/^req_/);
  });

  it('rejects protected requests without a server-resolved cookie session', async () => {
    const response = await request(createApp(baseServices())).get('/api/galleries');
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('AUTHENTICATION_REQUIRED');
  });

  it('rejects untrusted write origins and non-JSON writes', async () => {
    const app = createApp(baseServices(), { allowedOrigins: ['https://studio.example'] });
    const originResponse = await request(app).post('/api/auth/logout').set('Origin', 'https://attacker.example');
    expect(originResponse.status).toBe(403);
    expect(originResponse.body.error.code).toBe('FORBIDDEN');

    const mediaResponse = await request(app).post('/api/auth/logout').set('Origin', 'https://studio.example').set('Content-Type', 'text/plain').send('nope');
    expect(mediaResponse.status).toBe(415);
    expect(mediaResponse.body.error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
  });

  it('rejects oversized JSON bodies with a stable 413 response', async () => {
    const body = JSON.stringify({ padding: 'x'.repeat(1_050_000) });
    const response = await request(createApp(baseServices(), { allowedOrigins: ['http://localhost:3000'] }))
      .post('/api/auth/login')
      .set('Origin', 'http://localhost:3000')
      .set('Content-Type', 'application/json')
      .send(body);
    expect(response.status).toBe(413);
    expect(response.body.error.code).toBe('REQUEST_TOO_LARGE');
  });

  it('validates IDs and bounded pagination before service calls', async () => {
    const app = createApp(baseServices(), { allowedOrigins: ['http://localhost:3000'] });
    const invalidId = await request(app).get('/api/galleries/not-a-uuid').set('Cookie', '__Host-mj_session=opaque');
    expect(invalidId.status).toBe(422);
    expect(invalidId.body.error.code).toBe('INVALID_REQUEST');

    const pageTooLarge = await request(app).get('/api/clients?page=1&limit=1000').set('Cookie', '__Host-mj_session=opaque');
    expect(pageTooLarge.status).toBe(422);
    expect(pageTooLarge.body.error.code).toBe('INVALID_REQUEST');
  });

  it('rejects forged studio and role fields from ordinary gallery creation input', async () => {
    const response = await request(createApp(baseServices(), { allowedOrigins: ['http://localhost:3000'] }))
      .post('/api/galleries')
      .set('Origin', 'http://localhost:3000')
      .set('Cookie', '__Host-mj_session=valid')
      .send({ clientId: '44444444-4444-4444-8444-444444444444', name: 'Portraits', studioId: 'attacker', role: 'owner' });
    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('INVALID_GALLERY_DATA');
  });

  it('returns generic service-unavailable errors without leaking internal details', async () => {
    const response = await request(createApp()).get('/api/galleries');
    expect(response.body.error.code).toBe('AUTHENTICATION_REQUIRED');
    expect(JSON.stringify(response.body)).not.toContain('stack');
  });

  it('accepts a binary photo upload and serves it through a view capability', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mjstudio-api-upload-'));
    try {
      const storage = new LocalPhotoStorage(root, 'http://localhost:3001', 'integration-test-secret-that-is-long-enough');
      const app = createApp(baseServices(), {
        allowedOrigins: ['http://localhost:3000'],
        localPhotoStorage: storage,
      });
      const bytes = await sharp({
        create: { width: 40, height: 30, channels: 3, background: { r: 80, g: 120, b: 160 } },
      }).jpeg().toBuffer();
      const key = 'studios/studio-1/galleries/gallery-1/photos/photo-1/original';
      const uploadCapability = await storage.createUploadCapability(key, 60);
      const uploadPath = new URL(uploadCapability.url).pathname;

      const uploaded = await request(app)
        .put(uploadPath)
        .set('Origin', 'http://localhost:3000')
        .set('Content-Type', 'image/jpeg')
        .send(bytes);
      expect(uploaded.status).toBe(204);
      await expect(storage.verifyObject(key)).resolves.toMatchObject({
        mimeType: 'image/jpeg',
        fileSize: bytes.length,
      });

      const viewCapability = await storage.createViewCapability(key, 60);
      const viewPath = new URL(viewCapability.url).pathname;
      const viewed = await request(app).get(viewPath);
      expect(viewed.status).toBe(200);
      expect(viewed.headers['content-type']).toContain('image/jpeg');
      expect(viewed.body).toEqual(bytes);
      expect(viewed.headers['cache-control']).toBe('private, no-store');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

});
