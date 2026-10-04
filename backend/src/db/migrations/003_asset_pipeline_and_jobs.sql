ALTER TABLE photo_assets
  ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'original',
  ADD COLUMN IF NOT EXISTS state TEXT NOT NULL DEFAULT 'current',
  ADD COLUMN IF NOT EXISTS upload_status TEXT,
  ADD COLUMN IF NOT EXISTS processing_status TEXT;

UPDATE photo_assets
   SET upload_status = CASE WHEN status = 'ready' THEN 'uploaded' WHEN status = 'failed' THEN 'failed' ELSE 'pending' END,
       processing_status = CASE
         WHEN type = 'original' THEN 'not_required'
         WHEN status = 'ready' THEN 'ready'
         WHEN status = 'failed' THEN 'failed'
         ELSE 'pending'
       END
 WHERE upload_status IS NULL OR processing_status IS NULL;

ALTER TABLE photo_assets
  ALTER COLUMN upload_status SET DEFAULT 'pending',
  ALTER COLUMN upload_status SET NOT NULL,
  ALTER COLUMN processing_status SET DEFAULT 'not_required',
  ALTER COLUMN processing_status SET NOT NULL;

ALTER TABLE photo_assets DROP CONSTRAINT IF EXISTS photo_assets_status_check;
ALTER TABLE photo_assets DROP COLUMN IF EXISTS status;
ALTER TABLE photo_assets
  ADD CONSTRAINT photo_assets_type_check CHECK (type IN ('original', 'preview', 'thumbnail')),
  ADD CONSTRAINT photo_assets_state_check CHECK (state IN ('current', 'superseded')),
  ADD CONSTRAINT photo_assets_upload_status_check CHECK (upload_status IN ('pending', 'uploaded', 'failed')),
  ADD CONSTRAINT photo_assets_processing_status_check CHECK (processing_status IN ('not_required', 'pending', 'processing', 'ready', 'failed')),
  ADD CONSTRAINT photo_assets_original_processing_check CHECK (type <> 'original' OR processing_status = 'not_required'),
  ADD CONSTRAINT photo_assets_derivative_processing_check CHECK (type = 'original' OR upload_status <> 'pending' OR processing_status <> 'ready');

CREATE UNIQUE INDEX IF NOT EXISTS uq_photo_assets_current_type
  ON photo_assets (photo_id, type)
  WHERE state = 'current';

CREATE TABLE IF NOT EXISTS application_jobs (
  id UUID PRIMARY KEY,
  job_type TEXT NOT NULL CHECK (job_type IN ('PROCESS_PHOTO_ASSETS', 'CLEANUP_PHOTO_ASSETS', 'RECONCILE_PHOTO_ASSET')),
  dedupe_key TEXT NOT NULL,
  payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  max_attempts INTEGER NOT NULL DEFAULT 5 CHECK (max_attempts > 0),
  available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  locked_until TIMESTAMPTZ,
  lock_token UUID,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (job_type, dedupe_key),
  CHECK ((status = 'processing') = (locked_until IS NOT NULL AND lock_token IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_application_jobs_claim
  ON application_jobs (available_at, created_at)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_application_jobs_expired_lease
  ON application_jobs (locked_until)
  WHERE status = 'processing';

INSERT INTO application_jobs (id, job_type, dedupe_key, payload, status, attempts, created_at, updated_at)
SELECT j.id, 'PROCESS_PHOTO_ASSETS', j.photo_asset_id::text,
       jsonb_build_object('photoId', j.photo_id, 'sourceAssetId', j.photo_asset_id),
      CASE WHEN j.status = 'complete' THEN 'completed' WHEN j.status = 'processing' THEN 'pending' ELSE j.status END,
       0, j.created_at, j.updated_at
  FROM photo_processing_jobs j
ON CONFLICT (job_type, dedupe_key) DO NOTHING;

INSERT INTO application_jobs (id, job_type, dedupe_key, payload, status, created_at, updated_at)
SELECT j.id, 'CLEANUP_PHOTO_ASSETS', j.storage_key,
       jsonb_build_object('photoId', pa.photo_id),
      CASE WHEN j.status = 'complete' THEN 'completed' WHEN j.status = 'processing' THEN 'pending' ELSE j.status END,
       j.created_at, j.updated_at
  FROM storage_cleanup_jobs j
  LEFT JOIN photo_assets pa ON pa.storage_key = j.storage_key
 WHERE pa.photo_id IS NOT NULL
ON CONFLICT (job_type, dedupe_key) DO NOTHING;

DROP TABLE photo_processing_jobs;
DROP TABLE storage_cleanup_jobs;

CREATE OR REPLACE FUNCTION validate_photo_asset_state_transition()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.upload_status <> OLD.upload_status AND NOT (
    (OLD.upload_status = 'pending' AND NEW.upload_status IN ('uploaded', 'failed')) OR
    (OLD.upload_status = 'failed' AND NEW.upload_status = 'pending')
  ) THEN
    RAISE EXCEPTION 'invalid photo asset upload_status transition: % -> %', OLD.upload_status, NEW.upload_status;
  END IF;
  IF NEW.processing_status <> OLD.processing_status AND NOT (
    (OLD.processing_status = 'pending' AND NEW.processing_status IN ('processing', 'failed')) OR
    (OLD.processing_status = 'processing' AND NEW.processing_status IN ('ready', 'failed')) OR
    (OLD.processing_status = 'failed' AND NEW.processing_status = 'pending')
  ) THEN
    RAISE EXCEPTION 'invalid photo asset processing_status transition: % -> %', OLD.processing_status, NEW.processing_status;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS photo_asset_state_transition ON photo_assets;
CREATE TRIGGER photo_asset_state_transition
  BEFORE UPDATE OF upload_status, processing_status ON photo_assets
  FOR EACH ROW EXECUTE FUNCTION validate_photo_asset_state_transition();