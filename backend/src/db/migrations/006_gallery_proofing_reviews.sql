CREATE TABLE IF NOT EXISTS gallery_proofing_reviews (
  id UUID PRIMARY KEY,
  gallery_id UUID NOT NULL REFERENCES galleries(id) ON DELETE CASCADE,
  photo_id UUID NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'needs_revision')),
  note TEXT,
  reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (gallery_id, photo_id),
  CHECK ((status = 'pending' AND reviewed_at IS NULL) OR (status IN ('approved', 'needs_revision') AND reviewed_at IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_gallery_proofing_reviews_gallery_id ON gallery_proofing_reviews (gallery_id);
CREATE INDEX IF NOT EXISTS idx_gallery_proofing_reviews_photo_id ON gallery_proofing_reviews (photo_id);
