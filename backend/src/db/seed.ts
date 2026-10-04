import { db } from './client.js';

async function main() {
  await db.query(`
    INSERT INTO users (id, email, password_hash, display_name)
    VALUES
      ('11111111-1111-4111-8111-111111111111', 'owner@example.com', '$2b$10$abcdefghijklmnopqrstuv', 'Owner User')
    ON CONFLICT (id) DO NOTHING;
  `);

  await db.query(`
    INSERT INTO studios (id, name)
    VALUES ('22222222-2222-4222-8222-222222222222', 'MJ Creative Art')
    ON CONFLICT (id) DO NOTHING;
  `);

  await db.query(`
    INSERT INTO studio_members (id, studio_id, user_id, role)
    VALUES ('33333333-3333-4333-8333-333333333333', '22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111', 'owner')
    ON CONFLICT (studio_id, user_id) DO NOTHING;
  `);

  await db.query(`
    INSERT INTO clients (id, studio_id, name, email, phone)
    VALUES
      ('44444444-4444-4444-8444-444444444444', '22222222-2222-4222-8222-222222222222', 'Ava Stone', 'ava@example.com', '+1-555-0101')
    ON CONFLICT (id) DO NOTHING;
  `);

  await db.query(`
    INSERT INTO galleries (id, studio_id, client_id, name, workflow_status, publication_status)
    VALUES
      ('55555555-5555-4555-8555-555555555555', '22222222-2222-4222-8222-222222222222', '44444444-4444-4444-8444-444444444444', 'Summer Portraits', 'reviewing', 'published')
    ON CONFLICT (id) DO NOTHING;
  `);

  await db.query(`
    INSERT INTO gallery_access (id, gallery_id, secret_token_hash, pin_hash, permission, expires_at)
    VALUES
      ('66666666-6666-4666-8666-666666666666', '55555555-5555-4555-8555-555555555555', 'hash-secret', 'hash-pin', 'view_download', NOW() + INTERVAL '30 days')
    ON CONFLICT (id) DO NOTHING;
  `);

  await db.query(`
    INSERT INTO photos (id, gallery_id, position, status)
    VALUES
      ('77777777-7777-4777-8777-777777777777', '55555555-5555-4555-8555-555555555555', 1, 'active'),
      ('88888888-8888-4888-8888-888888888888', '55555555-5555-4555-8555-555555555555', 2, 'active')
    ON CONFLICT (id) DO NOTHING;
  `);

  await db.query(`
    INSERT INTO photo_assets (id, photo_id, type, storage_key, state, mime_type, file_size, upload_status, processing_status)
    VALUES
      ('99999999-9999-4999-8999-999999999999', '77777777-7777-4777-8777-777777777777', 'original', 'photos/1/original.jpg', 'current', 'image/jpeg', 125000, 'uploaded', 'not_required'),
      ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '88888888-8888-4888-8888-888888888888', 'preview', 'photos/2/preview.jpg', 'current', 'image/jpeg', 75000, 'uploaded', 'ready')
    ON CONFLICT (id) DO NOTHING;
  `);

  await db.query(`
    INSERT INTO photo_selections (id, gallery_access_id, photo_id, selection)
    VALUES
      ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '66666666-6666-4666-8666-666666666666', '77777777-7777-4777-8777-777777777777', 'favourite')
    ON CONFLICT (id) DO NOTHING;
  `);

  await db.query(`
    INSERT INTO gallery_feedback (id, gallery_access_id, message)
    VALUES
      ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', '66666666-6666-4666-8666-666666666666', 'Beautiful work, thank you.')
    ON CONFLICT (id) DO NOTHING;
  `);

  console.log('Seed data inserted.');
}

main().finally(() => {
  void db.end();
});
