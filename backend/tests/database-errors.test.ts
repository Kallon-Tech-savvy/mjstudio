import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { DatabaseUnavailableError, isDatabaseConnectionError } from '../src/errors.js';
import { serializeError } from '../src/logging/serialize-error.js';
import { errorHandler } from '../src/middleware/error-handler.js';

const withCode = (message: string, code: string) => Object.assign(new Error(message), { code });

describe('database connection errors', () => {
  it('recognises connection-level failures, including AggregateError from dual-stack lookups', () => {
    expect(isDatabaseConnectionError(withCode('connect ECONNREFUSED', 'ECONNREFUSED'))).toBe(true);
    expect(isDatabaseConnectionError(withCode('getaddrinfo ENOTFOUND', 'ENOTFOUND'))).toBe(true);
    expect(isDatabaseConnectionError(withCode('terminating connection', '57P01'))).toBe(true);
    expect(isDatabaseConnectionError(new Error('timeout exceeded when trying to connect'))).toBe(true);
    expect(isDatabaseConnectionError(new AggregateError([withCode('x', 'ECONNREFUSED')], 'multi'))).toBe(true);
  });

  it('does not misclassify ordinary failures', () => {
    expect(isDatabaseConnectionError(new Error('boom'))).toBe(false);
    expect(isDatabaseConnectionError(withCode('unique violation', '23505'))).toBe(false);
    expect(isDatabaseConnectionError('ECONNREFUSED')).toBe(false);
  });

  it('serialises message and code while redacting connection strings and omitting row detail', () => {
    const err = Object.assign(new Error('bad url postgresql://user:hunter2@host:5432/db'), { code: 'X', detail: 'Key (email)=(a@b.c)' });
    const out = JSON.stringify(serializeError(err));
    expect(out).toContain('"code":"X"');
    expect(out).toContain('[REDACTED_URL]');
    expect(out).not.toContain('hunter2');
    expect(out).not.toContain('a@b.c');
  });

  it('returns a stable 503 DATABASE_UNAVAILABLE without leaking internals', async () => {
    const app = express();
    app.get('/boom', (_req, _res, next) => next(withCode('connect ECONNREFUSED 10.0.0.5:5432', 'ECONNREFUSED')));
    app.use(errorHandler);
    const res = await request(app).get('/boom');
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe(new DatabaseUnavailableError().code);
    expect(JSON.stringify(res.body)).not.toContain('10.0.0.5');
  });

  it('still returns a generic 500 for unexpected errors', async () => {
    const app = express();
    app.get('/boom', (_req, _res, next) => next(new Error('boom')));
    app.use(errorHandler);
    const res = await request(app).get('/boom');
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL_SERVER_ERROR');
  });
});
