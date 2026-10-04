CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT,
  auth_provider TEXT,
  display_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (email <> ''),
  CHECK (password_hash IS NOT NULL OR auth_provider IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS studios (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (name <> '')
);

CREATE TABLE IF NOT EXISTS studio_members (
  id UUID PRIMARY KEY,
  studio_id UUID NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'photographer', 'assistant')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (studio_id, user_id)
);

CREATE TABLE IF NOT EXISTS clients (
  id UUID PRIMARY KEY,
  studio_id UUID NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (name <> ''),
  CHECK (email IS NULL OR email <> ''),
  CHECK (phone IS NULL OR phone <> '')
);

CREATE TABLE IF NOT EXISTS galleries (
  id UUID PRIMARY KEY,
  studio_id UUID NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  workflow_status TEXT NOT NULL DEFAULT 'draft' CHECK (workflow_status IN ('draft', 'reviewing', 'completed')),
  publication_status TEXT NOT NULL DEFAULT 'unpublished' CHECK (publication_status IN ('unpublished', 'published', 'revoked')),
  expires_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (name <> ''),
  CHECK (expires_at IS NULL OR expires_at > created_at),
  CHECK (published_at IS NULL OR published_at >= created_at),
  CHECK (archived_at IS NULL OR archived_at >= created_at),
  CHECK (publication_status <> 'published' OR published_at IS NOT NULL),
  CHECK (workflow_status IN ('draft', 'reviewing', 'completed'))
);

CREATE TABLE IF NOT EXISTS gallery_members (
  id UUID PRIMARY KEY,
  gallery_id UUID NOT NULL REFERENCES galleries(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'collaborator', 'uploader')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (gallery_id, user_id),
  UNIQUE (gallery_id, role) DEFERRABLE INITIALLY IMMEDIATE
);

CREATE TABLE IF NOT EXISTS photos (
  id UUID PRIMARY KEY,
  gallery_id UUID NOT NULL REFERENCES galleries(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'active', 'failed')),
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (filename <> ''),
  CHECK (position >= 0),
  CHECK (deleted_at IS NULL OR deleted_at >= created_at)
);

CREATE TABLE IF NOT EXISTS photo_assets (
  id UUID PRIMARY KEY,
  photo_id UUID NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
  storage_key TEXT NOT NULL,
  mime_type TEXT,
  file_size BIGINT CHECK (file_size >= 0),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'ready', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (storage_key),
  UNIQUE (photo_id, storage_key),
  CHECK (storage_key <> ''),
  CHECK (mime_type IS NULL OR mime_type <> '')
);

CREATE TABLE IF NOT EXISTS gallery_access (
  id UUID PRIMARY KEY,
  gallery_id UUID NOT NULL REFERENCES galleries(id) ON DELETE CASCADE,
  secret_token_hash TEXT NOT NULL,
  pin_hash TEXT NOT NULL,
  permission TEXT NOT NULL CHECK (permission IN ('view', 'view_download')),
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (secret_token_hash <> ''),
  CHECK (pin_hash <> ''),
  CHECK (expires_at IS NULL OR expires_at > created_at),
  CHECK (revoked_at IS NULL OR revoked_at >= created_at)
);

CREATE TABLE IF NOT EXISTS client_sessions (
  id UUID PRIMARY KEY,
  gallery_access_id UUID NOT NULL REFERENCES gallery_access(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (expires_at IS NULL OR expires_at > created_at),
  CHECK (revoked_at IS NULL OR revoked_at >= created_at),
  CHECK (last_seen_at >= created_at)
);

CREATE TABLE IF NOT EXISTS photo_selections (
  id UUID PRIMARY KEY,
  gallery_access_id UUID NOT NULL REFERENCES gallery_access(id) ON DELETE CASCADE,
  photo_id UUID NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
  selection TEXT NOT NULL CHECK (selection IN ('neutral', 'favourite', 'not_for_me')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (gallery_access_id, photo_id)
);

CREATE TABLE IF NOT EXISTS recommendations (
  id UUID PRIMARY KEY,
  gallery_id UUID NOT NULL REFERENCES galleries(id) ON DELETE CASCADE,
  photo_id UUID NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (gallery_id, photo_id)
);

CREATE TABLE IF NOT EXISTS gallery_feedback (
  id UUID PRIMARY KEY,
  gallery_access_id UUID NOT NULL REFERENCES gallery_access(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (message <> '')
);

CREATE TABLE IF NOT EXISTS photo_feedback (
  id UUID PRIMARY KEY,
  gallery_access_id UUID NOT NULL REFERENCES gallery_access(id) ON DELETE CASCADE,
  photo_id UUID NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (message <> '')
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);
CREATE INDEX IF NOT EXISTS idx_studio_members_studio_id ON studio_members (studio_id);
CREATE INDEX IF NOT EXISTS idx_studio_members_user_id ON studio_members (user_id);
CREATE INDEX IF NOT EXISTS idx_clients_studio_id ON clients (studio_id);
CREATE INDEX IF NOT EXISTS idx_galleries_studio_id ON galleries (studio_id);
CREATE INDEX IF NOT EXISTS idx_galleries_client_id ON galleries (client_id);
CREATE INDEX IF NOT EXISTS idx_gallery_members_gallery_id ON gallery_members (gallery_id);
CREATE INDEX IF NOT EXISTS idx_gallery_members_user_id ON gallery_members (user_id);
CREATE INDEX IF NOT EXISTS idx_photos_gallery_id ON photos (gallery_id);
CREATE INDEX IF NOT EXISTS idx_photos_gallery_position ON photos (gallery_id, position);
CREATE INDEX IF NOT EXISTS idx_photo_assets_photo_id ON photo_assets (photo_id);
CREATE INDEX IF NOT EXISTS idx_gallery_access_gallery_id ON gallery_access (gallery_id);
CREATE INDEX IF NOT EXISTS idx_client_sessions_gallery_access_id ON client_sessions (gallery_access_id);
CREATE INDEX IF NOT EXISTS idx_photo_selections_gallery_access_id ON photo_selections (gallery_access_id);
CREATE INDEX IF NOT EXISTS idx_recommendations_gallery_id ON recommendations (gallery_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_gallery_access_current ON gallery_access (gallery_id) WHERE revoked_at IS NULL;

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
