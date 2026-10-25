import { randomBytes, scryptSync } from 'node:crypto';
import { db } from './client.js';

const OWNER_ID = '11111111-1111-4111-8111-111111111111';
const STUDIO_ID = '22222222-2222-4222-8222-222222222222';
const OWNER_EMAIL = process.env.SEED_EMAIL;
const OWNER_PASSWORD = process.env.SEED_PASSWORD;

// Same format the login verifier reads: scrypt$<salt>$<hex digest>, 32-byte digest.
function hashPassword(password: string): string {
  const salt = randomBytes(8).toString('hex');
  return `scrypt$${salt}$${scryptSync(password, salt, 32).toString('hex')}`;
}

async function main() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to seed demo data in production.');
  }
  if (!OWNER_EMAIL || !OWNER_PASSWORD || OWNER_PASSWORD.length < 12) {
    throw new Error('Set SEED_EMAIL and SEED_PASSWORD (at least 12 characters) before running the seed script.');
  }
  // Running the seed script in a non-production environment intentionally resets the seed owner's password.
  await db.query(
    `INSERT INTO users (id, email, password_hash, display_name)
     VALUES ($1, $2, $3, 'Owner User')
     ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, password_hash = EXCLUDED.password_hash`,
    [OWNER_ID, OWNER_EMAIL, hashPassword(OWNER_PASSWORD)],
  );

  await db.query(`INSERT INTO studios (id, name) VALUES ($1, 'MJ Creative Art') ON CONFLICT (id) DO NOTHING`, [STUDIO_ID]);
  await db.query(
    `INSERT INTO studio_members (id, studio_id, user_id, role)
     VALUES ('33333333-3333-4333-8333-333333333333', $1, $2, 'owner')
     ON CONFLICT (studio_id, user_id) DO NOTHING`,
    [STUDIO_ID, OWNER_ID],
  );

  await db.query(
    `INSERT INTO clients (id, studio_id, name, email, phone) VALUES
       ('44444444-4444-4444-8444-444444444444', $1, 'Ava Stone', 'ava@example.com', '+15550101'),
       ('44444444-4444-4444-8444-444444444445', $1, 'Mariatu Kamara', NULL, '+23276000000')
     ON CONFLICT (id) DO NOTHING`,
    [STUDIO_ID],
  );

  // A published gallery must carry published_at (check constraint); a draft must not.
  await db.query(
    `INSERT INTO galleries (id, studio_id, client_id, name, workflow_status, publication_status, published_at) VALUES
       ('55555555-5555-4555-8555-555555555555', $1, '44444444-4444-4444-8444-444444444444', 'Summer Portraits', 'reviewing', 'published', NOW()),
       ('55555555-5555-4555-8555-555555555556', $1, '44444444-4444-4444-8444-444444444445', 'Graduation Day', 'draft', 'unpublished', NULL)
     ON CONFLICT (id) DO NOTHING`,
    [STUDIO_ID],
  );
  // gallery_members has a deferrable unique constraint, which ON CONFLICT cannot arbitrate: use NOT EXISTS.
  await db.query(
    `INSERT INTO gallery_members (id, gallery_id, user_id, role)
     SELECT v.id::uuid, v.gallery_id::uuid, $1::uuid, 'owner'
       FROM (VALUES
         ('dddddddd-dddd-4ddd-8ddd-ddddddddddd1', '55555555-5555-4555-8555-555555555555'),
         ('dddddddd-dddd-4ddd-8ddd-ddddddddddd2', '55555555-5555-4555-8555-555555555556')
       ) AS v(id, gallery_id)
      WHERE NOT EXISTS (SELECT 1 FROM gallery_members m WHERE m.gallery_id = v.gallery_id::uuid AND m.user_id = $1::uuid)`,
    [OWNER_ID],
  );

  await db.query(
    `INSERT INTO photos (id, gallery_id, filename, position, status) VALUES
       ('77777777-7777-4777-8777-777777777777', '55555555-5555-4555-8555-555555555555', 'portrait-01.jpg', 1, 'active'),
       ('88888888-8888-4888-8888-888888888888', '55555555-5555-4555-8555-555555555555', 'portrait-02.jpg', 2, 'active')
     ON CONFLICT (id) DO NOTHING`,
  );
  await db.query(
    `INSERT INTO photo_assets (id, photo_id, type, storage_key, state, mime_type, file_size, upload_status, processing_status) VALUES
       ('99999999-9999-4999-8999-999999999999', '77777777-7777-4777-8777-777777777777', 'original', 'photos/1/original.jpg', 'current', 'image/jpeg', 125000, 'uploaded', 'not_required'),
       ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '88888888-8888-4888-8888-888888888888', 'preview', 'photos/2/preview.jpg', 'current', 'image/jpeg', 75000, 'uploaded', 'ready')
     ON CONFLICT (id) DO NOTHING`,
  );

  // Client access links (token + PIN) are created through the app so that you receive them once.
  console.log('Seed data inserted.');
  console.log(`Seed owner email: ${OWNER_EMAIL}. Password was supplied through SEED_PASSWORD and is not printed.`);
}

main().finally(() => {
  void db.end();
});
