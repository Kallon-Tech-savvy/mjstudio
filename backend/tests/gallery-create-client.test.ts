import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { buildPhotographerContext } from '../src/auth/context.js';
import { UnauthorizedError } from '../src/errors.js';
import type { ApplicationServices } from '../src/services/container.js';

const EXISTING = '44444444-4444-4444-8444-444444444444';

function servicesCapturing(captured: unknown[]) {
  return {
    auth: {
      login: async () => { throw new UnauthorizedError('Invalid email or password.'); },
      resolve: async () => buildPhotographerContext(),
      logout: async () => undefined,
    },
    galleries: { create: async (_actor: unknown, input: unknown) => { captured.push(input); return { id: '55555555-5555-4555-8555-555555555555', name: 'Portraits' }; } },
    catalog: {}, rateLimits: { assertAllowed: async () => undefined },
  } as unknown as ApplicationServices;
}

const post = (captured: unknown[], body: unknown) =>
  request(createApp(servicesCapturing(captured), { allowedOrigins: ['http://localhost:3000'] }))
    .post('/api/galleries')
    .set('Origin', 'http://localhost:3000')
    .set('Cookie', '__Host-mj_session=valid')
    .send(body as object);

describe('POST /api/galleries with an inline new client', () => {
  it('accepts an existing clientId', async () => {
    const seen: unknown[] = [];
    const res = await post(seen, { clientId: EXISTING, name: 'Portraits' });
    expect(res.status).toBe(201);
    expect(seen).toHaveLength(1);
  });

  it('accepts a new client with only a name (email and phone optional)', async () => {
    const seen: any[] = [];
    const res = await post(seen, { newClient: { name: 'Ava Stone' }, name: 'Portraits' });
    expect(res.status).toBe(201);
    expect(seen[0].newClient).toEqual({ name: 'Ava Stone' });
    expect(seen[0].clientId).toBeUndefined();
  });

  it('forwards optional email and phone when provided', async () => {
    const seen: any[] = [];
    const res = await post(seen, { newClient: { name: 'Ava', email: 'ava@example.com', phone: '+23276000000' }, name: 'Portraits' });
    expect(res.status).toBe(201);
    expect(seen[0].newClient).toEqual({ name: 'Ava', email: 'ava@example.com', phone: '+23276000000' });
  });

  it('rejects supplying both clientId and newClient', async () => {
    const seen: unknown[] = [];
    const res = await post(seen, { clientId: EXISTING, newClient: { name: 'Ava' }, name: 'Portraits' });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('INVALID_GALLERY_DATA');
    expect(seen).toHaveLength(0);
  });

  it('rejects supplying neither', async () => {
    const seen: unknown[] = [];
    const res = await post(seen, { name: 'Portraits' });
    expect(res.status).toBe(422);
    expect(seen).toHaveLength(0);
  });

  it('rejects a new client with a blank name or an invalid email', async () => {
    const seen: unknown[] = [];
    expect((await post(seen, { newClient: { name: '   ' }, name: 'Portraits' })).status).toBe(422);
    expect((await post(seen, { newClient: { name: 'Ava', email: 'not-an-email' }, name: 'Portraits' })).status).toBe(422);
    expect(seen).toHaveLength(0);
  });

  it('still rejects forged authority fields inside newClient', async () => {
    const seen: unknown[] = [];
    const res = await post(seen, { newClient: { name: 'Ava', studioId: 'attacker' }, name: 'Portraits' });
    expect(res.status).toBe(422);
    expect(seen).toHaveLength(0);
  });
});
