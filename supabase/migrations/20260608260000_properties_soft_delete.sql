-- Vertmon Hub: Properties soft-delete
-- Hard delete нь сэргээх боломжгүй, audit мөшгилтийг алддаг. deleted_at-ээр soft-delete болгоно.

ALTER TABLE properties ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_properties_deleted_at ON properties(shop_id, deleted_at);

COMMENT ON COLUMN properties.deleted_at IS 'Soft-delete: устгасан огноо (NULL = идэвхтэй)';
