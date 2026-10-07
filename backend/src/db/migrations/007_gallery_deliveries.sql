CREATE TABLE IF NOT EXISTS gallery_deliveries (
  id UUID PRIMARY KEY,
  gallery_id UUID NOT NULL REFERENCES galleries(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'preparing', 'ready', 'completed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ready_at TIMESTAMPTZ,
  released_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  UNIQUE (gallery_id),
  CHECK ((status IN ('pending', 'preparing') AND released_at IS NULL) OR (status IN ('ready', 'completed') AND released_at IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS gallery_delivery_items (
  id UUID PRIMARY KEY,
  delivery_id UUID NOT NULL REFERENCES gallery_deliveries(id) ON DELETE CASCADE,
  photo_id UUID NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
  asset_id UUID REFERENCES photo_assets(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'ready' CHECK (status IN ('preparing', 'ready', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (delivery_id, photo_id)
);

CREATE INDEX IF NOT EXISTS idx_gallery_deliveries_gallery_id ON gallery_deliveries (gallery_id);
CREATE INDEX IF NOT EXISTS idx_gallery_deliveries_client_id ON gallery_deliveries (client_id);
CREATE INDEX IF NOT EXISTS idx_gallery_delivery_items_delivery_id ON gallery_delivery_items (delivery_id);
CREATE INDEX IF NOT EXISTS idx_gallery_delivery_items_photo_id ON gallery_delivery_items (photo_id);
