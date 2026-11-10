-- Creation receipts are scoped to the authenticated studio and photographer.
-- Keep them for the gallery lifetime so delayed retries do not create duplicates.
CREATE TABLE gallery_creation_requests (
  studio_id UUID NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  request_id UUID NOT NULL,
  fingerprint TEXT NOT NULL,
  gallery_id UUID NOT NULL REFERENCES galleries(id) ON DELETE CASCADE,
  response JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (studio_id, user_id, request_id)
);
CREATE INDEX idx_gallery_creation_requests_gallery ON gallery_creation_requests(gallery_id);
