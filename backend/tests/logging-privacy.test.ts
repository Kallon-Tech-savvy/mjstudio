import request from 'supertest';
import { gzipSync } from 'node:zlib';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { logger } from '../src/logging/logger.js';

afterEach(() => vi.restoreAllMocks());

describe('parser error logging privacy', () => {
  it.each(['identity', 'gzip'])('keeps malformed %s credentials out of the complete warning record', async (encoding) => {
    const warning = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
    const values = ['fixture-password', 'fixture-pin', 'fixture-secret', 'fixture-private-note'];
    const malformed = JSON.stringify({ password: values[0], pin: values[1], secret: values[2], note: values[3] }).slice(0, -1);
    const response = await request(createApp(undefined, { allowedOrigins: ['http://review.invalid'] }))
      .post('/api/auth/login')
      .set('Origin', 'http://review.invalid')
      .set('Content-Type', 'application/json')
      .set('Content-Encoding', encoding)
      .serialize((body) => body)
      .send(encoding === 'gzip' ? gzipSync(Buffer.from(malformed)) : malformed);
    expect(response.status).toBe(400);
    expect(warning).toHaveBeenCalledOnce();
    const logged = JSON.stringify(warning.mock.calls);
    for (const value of values) expect(logged).not.toContain(value);
    expect(warning.mock.calls[0]?.[0]).toMatchObject({ errorCode: 'MALFORMED_JSON', method: 'POST', path: '/api/auth/login' });
    expect(warning.mock.calls[0]?.[0]).toHaveProperty('requestId');
    expect(response.body.error.code).toBe('MALFORMED_JSON');
  });
});
