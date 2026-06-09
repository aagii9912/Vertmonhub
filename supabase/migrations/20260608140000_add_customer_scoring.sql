-- Vertmon Hub: Харилцагчийн чанарын скоринг + lifecycle шат (Phase 3)
-- "Чанартай харилцагчийг арчлах" зорилгод харилцагч тус бүрийг автоматаар үнэлж,
-- амьдралын мөчлөгийн шатыг тогтооно. Скорыг recompute API/cron-оор шинэчилнэ.

ALTER TABLE customers ADD COLUMN IF NOT EXISTS lifecycle_stage TEXT
    CHECK (lifecycle_stage IN (
        'prospect', 'engaged', 'qualified', 'viewing', 'negotiating', 'won', 'lost', 'dormant'
    ));

ALTER TABLE customers ADD COLUMN IF NOT EXISTS quality_score INTEGER DEFAULT 0;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS quality_tier TEXT
    CHECK (quality_tier IN ('A', 'B', 'C'));
ALTER TABLE customers ADD COLUMN IF NOT EXISTS score_breakdown JSONB DEFAULT '{}'::jsonb;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS last_scored_at TIMESTAMPTZ;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS next_followup_at TIMESTAMPTZ;

-- Эрэмбэлэх / сегмент шүүх индексүүд (shop тус бүрд)
CREATE INDEX IF NOT EXISTS idx_customers_quality_score
    ON customers(shop_id, quality_score DESC);
CREATE INDEX IF NOT EXISTS idx_customers_lifecycle_stage
    ON customers(shop_id, lifecycle_stage);
CREATE INDEX IF NOT EXISTS idx_customers_quality_tier
    ON customers(shop_id, quality_tier);
CREATE INDEX IF NOT EXISTS idx_customers_next_followup_at
    ON customers(shop_id, next_followup_at)
    WHERE next_followup_at IS NOT NULL;

COMMENT ON COLUMN customers.lifecycle_stage IS 'prospect→engaged→qualified→viewing→negotiating→won/lost, идэвхгүй бол dormant';
COMMENT ON COLUMN customers.quality_score IS 'Тооцоолсон чанарын оноо 0-100 (recency/engagement/funnel/viewing/intent)';
COMMENT ON COLUMN customers.quality_tier IS 'A: >=70, B: >=40, C: <40';
COMMENT ON COLUMN customers.score_breakdown IS 'Оноог бүрдүүлсэн дэд оноо + temperature (hot/nurturing/dormant)';
