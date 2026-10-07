ALTER TABLE photo_assets
  ADD COLUMN IF NOT EXISTS width INTEGER,
  ADD COLUMN IF NOT EXISTS height INTEGER;

ALTER TABLE photo_assets
  DROP CONSTRAINT IF EXISTS photo_assets_dimensions_check;

ALTER TABLE photo_assets
  ADD CONSTRAINT photo_assets_dimensions_check
  CHECK (
    (width IS NULL AND height IS NULL)
    OR (width > 0 AND height > 0)
  );
