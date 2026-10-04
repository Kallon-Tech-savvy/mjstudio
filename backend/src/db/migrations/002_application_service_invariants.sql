ALTER TABLE client_sessions
  ADD COLUMN IF NOT EXISTS session_token_hash TEXT;

CREATE TABLE IF NOT EXISTS photographer_sessions (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (revoked_at IS NULL OR revoked_at >= created_at)
);

CREATE INDEX IF NOT EXISTS idx_photographer_sessions_user_active
  ON photographer_sessions (user_id, expires_at)
  WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS api_rate_limit_buckets (
  scope TEXT NOT NULL,
  subject_hash TEXT NOT NULL,
  bucket_start TIMESTAMPTZ NOT NULL,
  request_count INTEGER NOT NULL CHECK (request_count > 0),
  PRIMARY KEY (scope, subject_hash, bucket_start)
);

CREATE INDEX IF NOT EXISTS idx_api_rate_limit_buckets_start
  ON api_rate_limit_buckets (bucket_start);

ALTER TABLE galleries DROP CONSTRAINT IF EXISTS gallery_client_same_studio;

CREATE OR REPLACE FUNCTION enforce_gallery_client_same_studio()
RETURNS TRIGGER AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM clients c
    WHERE c.id = NEW.client_id AND c.studio_id = NEW.studio_id
  ) THEN
    RAISE EXCEPTION 'gallery client must belong to the same studio';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS gallery_client_same_studio ON galleries;
CREATE TRIGGER gallery_client_same_studio
  BEFORE INSERT OR UPDATE OF studio_id, client_id ON galleries
  FOR EACH ROW EXECUTE FUNCTION enforce_gallery_client_same_studio();

CREATE UNIQUE INDEX IF NOT EXISTS uq_client_sessions_token_hash
  ON client_sessions (session_token_hash)
  WHERE session_token_hash IS NOT NULL;

CREATE TABLE IF NOT EXISTS photo_downloads (
  id UUID PRIMARY KEY,
  gallery_access_id UUID NOT NULL REFERENCES gallery_access(id) ON DELETE CASCADE,
  client_session_id UUID NOT NULL REFERENCES client_sessions(id) ON DELETE CASCADE,
  photo_id UUID NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_photo_downloads_access_photo
  ON photo_downloads (gallery_access_id, photo_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_photos_gallery_position_active
  ON photos (gallery_id, position)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS photo_processing_jobs (
  id UUID PRIMARY KEY,
  photo_id UUID NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
  photo_asset_id UUID NOT NULL REFERENCES photo_assets(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'complete', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (photo_asset_id)
);

CREATE TABLE IF NOT EXISTS storage_cleanup_jobs (
  id UUID PRIMARY KEY,
  storage_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'complete', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);