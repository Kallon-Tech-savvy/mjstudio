CREATE TABLE IF NOT EXISTS gallery_selections (
  id UUID PRIMARY KEY,
  gallery_access_id UUID NOT NULL REFERENCES gallery_access(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted')),
  submitted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK ((status = 'draft' AND submitted_at IS NULL) OR (status = 'submitted' AND submitted_at IS NOT NULL)),
  UNIQUE (gallery_access_id)
);

CREATE TABLE IF NOT EXISTS gallery_selection_items (
  id UUID PRIMARY KEY,
  gallery_selection_id UUID NOT NULL REFERENCES gallery_selections(id) ON DELETE CASCADE,
  photo_id UUID NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
  selected BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (gallery_selection_id, photo_id)
);

CREATE INDEX IF NOT EXISTS idx_gallery_selection_items_selection_id
  ON gallery_selection_items (gallery_selection_id);

CREATE INDEX IF NOT EXISTS idx_gallery_selection_items_photo_id
  ON gallery_selection_items (photo_id);

INSERT INTO gallery_selections (id, gallery_access_id, status, created_at, updated_at)
SELECT gen_random_uuid(), ps.gallery_access_id, 'draft', MIN(ps.created_at), MAX(ps.updated_at)
FROM photo_selections ps
GROUP BY ps.gallery_access_id
ON CONFLICT (gallery_access_id) DO NOTHING;

INSERT INTO gallery_selection_items (id, gallery_selection_id, photo_id, selected, created_at, updated_at)
SELECT gen_random_uuid(), gs.id, ps.photo_id, (ps.selection = 'favourite'), ps.created_at, ps.updated_at
FROM photo_selections ps
JOIN gallery_selections gs ON gs.gallery_access_id = ps.gallery_access_id
ON CONFLICT (gallery_selection_id, photo_id)
DO UPDATE SET selected = EXCLUDED.selected, updated_at = EXCLUDED.updated_at;
