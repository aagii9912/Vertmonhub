-- Vertmon Hub: Marketing Phase 4 — бэхжүүлэлт
-- (A) marketing_channels / channel_contracts-ийг shop-оор хязгаарлах (multi-tenant цоорхой засах)
-- (B) lead_attribution_events — multi-touch attribution-ийн суурь

-- ============================================
-- A) Shop scoping
-- ============================================
ALTER TABLE marketing_channels ADD COLUMN IF NOT EXISTS shop_id UUID REFERENCES shops(id) ON DELETE CASCADE;
ALTER TABLE channel_contracts ADD COLUMN IF NOT EXISTS shop_id UUID REFERENCES shops(id) ON DELETE CASCADE;

-- Ганц shop байгаа бол одоо байгаа мөрүүдийг түүнд холбоно
UPDATE marketing_channels SET shop_id = (SELECT id FROM shops ORDER BY created_at LIMIT 1)
WHERE shop_id IS NULL AND (SELECT count(*) FROM shops) = 1;
UPDATE channel_contracts SET shop_id = (SELECT id FROM shops ORDER BY created_at LIMIT 1)
WHERE shop_id IS NULL AND (SELECT count(*) FROM shops) = 1;

CREATE INDEX IF NOT EXISTS idx_marketing_channels_shop ON marketing_channels(shop_id);
CREATE INDEX IF NOT EXISTS idx_channel_contracts_shop ON channel_contracts(shop_id);

-- ============================================
-- B) Lead attribution events (multi-touch суурь)
-- ============================================
CREATE TABLE IF NOT EXISTS lead_attribution_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
    event_type VARCHAR(20) NOT NULL,   -- lead, qualified, won, lost, touch
    source VARCHAR(50),
    fbclid TEXT,
    utm_source TEXT,
    utm_medium TEXT,
    utm_campaign TEXT,
    facebook_campaign_id TEXT,
    value DECIMAL(18, 2),
    occurred_at TIMESTAMPTZ DEFAULT NOW(),
    meta JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lae_shop ON lead_attribution_events(shop_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_lae_lead ON lead_attribution_events(lead_id);
CREATE INDEX IF NOT EXISTS idx_lae_type ON lead_attribution_events(shop_id, event_type);

ALTER TABLE lead_attribution_events ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE lead_attribution_events IS 'Marketing: lead-ийн attribution үйл явдлууд (first/last/multi-touch тооцоонд)';
