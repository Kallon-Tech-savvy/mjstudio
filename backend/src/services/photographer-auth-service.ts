import { createHash, randomBytes, randomUUID, scrypt as callbackScrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import type { PhotographerContext } from '../auth/context.js';
import { UnauthorizedError } from '../errors.js';
import type { Database } from './service-common.js';

const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const scrypt = promisify(callbackScrypt);

export class PostgresScryptPasswordVerifier implements PasswordVerifier {
  constructor(private readonly database: Database) {}

  async verify(email: string, password: string): Promise<{ userId: string } | null> {
    const result = await this.database.query<{ id: string; password_hash: string | null }>(
      'SELECT id, password_hash FROM users WHERE lower(email) = lower($1)', [email]);
    const row = result.rows[0];
    if (!row?.password_hash) return null;
    const [scheme, salt, digest] = row.password_hash.split('$');
    if (scheme !== 'scrypt' || !salt || !digest) return null;
    const expected = Buffer.from(digest, 'hex');
    const actual = await scrypt(password, salt, expected.length) as Buffer;
    return expected.length === actual.length && timingSafeEqual(expected, actual) ? { userId: row.id } : null;
  }
}

export interface PasswordVerifier {
  verify(email: string, password: string): Promise<{ userId: string } | null>;
}

export class PhotographerAuthService {
  constructor(private readonly database: Database, private readonly passwords: PasswordVerifier, private readonly createId: () => string = randomUUID) {}

  async login(email: string, password: string) {
    const identity = await this.passwords.verify(email, password);
    if (!identity) throw new UnauthorizedError('Invalid email or password.', 'INVALID_CREDENTIALS');
    const sessionToken = randomBytes(32).toString('base64url');
    const sessionId = this.createId();
    const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000);
    const created = await this.database.query(
      `INSERT INTO photographer_sessions (id, user_id, token_hash, expires_at)
       VALUES ($1, $2, $3, $4) RETURNING id`, [sessionId, identity.userId, hash(sessionToken), expiresAt]);
    if (!created.rows[0]) throw new UnauthorizedError('Invalid email or password.');
    const context = await this.resolve(sessionToken);
    return { sessionToken, expiresAt, context };
  }

  async resolve(sessionToken: string): Promise<PhotographerContext> {
    const result = await this.database.query<{
      user_id: string; email: string; display_name: string; studio_id: string; membership_id: string; role: PhotographerContext['role'];
    }>(
      `SELECT u.id AS user_id, u.email, u.display_name, sm.id AS membership_id, sm.studio_id, sm.role
         FROM photographer_sessions ps
         JOIN users u ON u.id = ps.user_id
         JOIN studio_members sm ON sm.user_id = u.id
        WHERE ps.token_hash = $1 AND ps.revoked_at IS NULL AND ps.expires_at > NOW()
        ORDER BY sm.created_at LIMIT 1`, [hash(sessionToken)]);
    const row = result.rows[0];
    if (!row) throw new UnauthorizedError('Authentication required.');
    return { userId: row.user_id, email: row.email, displayName: row.display_name, studioId: row.studio_id, membershipId: row.membership_id, role: row.role };
  }

  async logout(sessionToken: string) {
    await this.database.query('UPDATE photographer_sessions SET revoked_at = NOW() WHERE token_hash = $1 AND revoked_at IS NULL', [hash(sessionToken)]);
  }
}