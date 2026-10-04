import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

describe('studio and auth protection', () => {
  it('GET /api/auth/me should return null when unauthenticated', async () => {
    const response = await request(createApp()).get('/api/auth/me');

    expect(response.status).toBe(200);
    expect(response.body.data.user).toBeNull();
  });

  it('GET /api/studio without auth should return 401', async () => {
    const response = await request(createApp()).get('/api/studio');

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('AUTHENTICATION_REQUIRED');
  });

  it('does not accept the removed development bearer token', async () => {
    const response = await request(createApp())
      .get('/api/studio')
      .set('Authorization', 'Bearer dev-photographer-token');

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('AUTHENTICATION_REQUIRED');
  });
});
