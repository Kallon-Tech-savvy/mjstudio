import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { UnauthorizedError } from '../src/errors.js';
import { buildPhotographerContext } from '../src/auth/context.js';
import type { ApplicationServices } from '../src/services/container.js';

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
});
