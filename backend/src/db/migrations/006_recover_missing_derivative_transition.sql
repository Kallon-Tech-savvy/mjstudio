-- Allow a previously-ready derivative to be marked failed when its stored
-- object is discovered missing or corrupt, so the worker can regenerate it.
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
    (OLD.processing_status = 'ready' AND NEW.processing_status = 'failed') OR
    (OLD.processing_status = 'failed' AND NEW.processing_status = 'pending')
  ) THEN
    RAISE EXCEPTION 'invalid photo asset processing_status transition: % -> %', OLD.processing_status, NEW.processing_status;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
