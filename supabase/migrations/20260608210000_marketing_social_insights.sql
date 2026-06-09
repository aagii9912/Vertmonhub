-- Vertmon Hub: Marketing Phase 3 — Organic social analytics-ийг түүхэсжүүлэх
-- Өмнө нь FB/IG post болон page insights-ийг зөвхөн live татдаг, хадгалдаггүй байсан.
-- `social_posts` хүснэгт аль хэдийн бий (20260317100000); энд insights-ийн цаг хугацааны
-- snapshot хадгалах `social_insights` хүснэгт нэмж trend боломжтой болгоно.

CREATE TABLE IF NOT EXISTS social_insights (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    platform VARCHAR(50) NOT NULL CHECK (platform IN ('facebook', 'instagram')),
    captured_at TIMESTAMPTZ DEFAULT NOW(),
    impressions INTEGER DEFAULT 0,
    reach INTEGER DEFAULT 0,
    engaged_users INTEGER DEFAULT 0,
    page_views INTEGER DEFAULT 0,
    followers INTEGER DEFAULT 0,
    raw JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_social_insights_shop ON social_insights(shop_id, platform, captured_at DESC);

ALTER TABLE social_insights ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE social_insights IS 'ERP/Marketing: FB/IG insights-ийн цаг хугацааны snapshot (trend-д)';
