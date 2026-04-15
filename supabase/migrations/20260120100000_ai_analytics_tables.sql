-- AI Analytics and A/B Testing Tables Migration
-- Run this migration to set up the required database tables

-- ===========================================
-- 1. AI Analytics Table
-- ===========================================
CREATE TABLE IF NOT EXISTS ai_analytics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type TEXT NOT NULL,
    shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
    tool_name TEXT,
    product_id UUID REFERENCES products(id) ON DELETE SET NULL,
    product_name TEXT,
    amount DECIMAL(12, 2),
    success BOOLEAN NOT NULL DEFAULT true,
    error_message TEXT,
    metadata JSONB DEFAULT '{}',
    response_time_ms INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for analytics queries
CREATE INDEX IF NOT EXISTS idx_ai_analytics_shop_id ON ai_analytics(shop_id);
CREATE INDEX IF NOT EXISTS idx_ai_analytics_created_at ON ai_analytics(created_at);
CREATE INDEX IF NOT EXISTS idx_ai_analytics_event_type ON ai_analytics(event_type);
CREATE INDEX IF NOT EXISTS idx_ai_analytics_shop_date ON ai_analytics(shop_id, created_at);

-- ===========================================
-- 2. Conversion Funnel Table
-- ===========================================
CREATE TABLE IF NOT EXISTS conversion_funnel (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    stage TEXT NOT NULL,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for funnel analysis
CREATE INDEX IF NOT EXISTS idx_conversion_funnel_shop ON conversion_funnel(shop_id);
CREATE INDEX IF NOT EXISTS idx_conversion_funnel_customer ON conversion_funnel(customer_id);
CREATE INDEX IF NOT EXISTS idx_conversion_funnel_stage ON conversion_funnel(stage);

-- ===========================================
-- 3. A/B Experiments Table
-- ===========================================
CREATE TABLE IF NOT EXISTS ab_experiments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    description TEXT,
    variants JSONB NOT NULL DEFAULT '[]',
    start_date TIMESTAMPTZ NOT NULL,
    end_date TIMESTAMPTZ,
    is_active BOOLEAN NOT NULL DEFAULT true,
    target_shop_ids UUID[],
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for active experiments
CREATE INDEX IF NOT EXISTS idx_ab_experiments_active ON ab_experiments(is_active, start_date, end_date);

-- ===========================================
-- 4. A/B Experiment Results Table
-- ===========================================
CREATE TABLE IF NOT EXISTS ab_experiment_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    experiment_id UUID NOT NULL REFERENCES ab_experiments(id) ON DELETE CASCADE,
    variant_id TEXT NOT NULL,
    shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
    event_type TEXT NOT NULL,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for result analysis
CREATE INDEX IF NOT EXISTS idx_ab_results_experiment ON ab_experiment_results(experiment_id);
CREATE INDEX IF NOT EXISTS idx_ab_results_variant ON ab_experiment_results(experiment_id, variant_id);

-- ===========================================
-- 5. Discount Schedules Table
-- ===========================================
CREATE TABLE IF NOT EXISTS discount_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    discount_percent INTEGER NOT NULL CHECK (discount_percent > 0 AND discount_percent <= 100),
    start_date TIMESTAMPTZ NOT NULL,
    end_date TIMESTAMPTZ NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT valid_date_range CHECK (end_date > start_date)
);

-- Indexes for discount queries
CREATE INDEX IF NOT EXISTS idx_discount_schedules_product ON discount_schedules(product_id);
CREATE INDEX IF NOT EXISTS idx_discount_schedules_active ON discount_schedules(is_active, start_date, end_date);

-- ===========================================
-- 6. Row Level Security (RLS)
-- ===========================================

-- Enable RLS
ALTER TABLE ai_analytics ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversion_funnel ENABLE ROW LEVEL SECURITY;
ALTER TABLE ab_experiments ENABLE ROW LEVEL SECURITY;
ALTER TABLE ab_experiment_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE discount_schedules ENABLE ROW LEVEL SECURITY;

-- Policies for ai_analytics
DROP POLICY IF EXISTS "Shop owners can view their analytics" ON ai_analytics;
CREATE POLICY "Shop owners can view their analytics"
    ON ai_analytics FOR SELECT
    USING (shop_id = get_user_shop_id());

DROP POLICY IF EXISTS "System can insert analytics" ON ai_analytics;
CREATE POLICY "System can insert analytics"
    ON ai_analytics FOR INSERT
    WITH CHECK (true);

-- Policies for conversion_funnel
DROP POLICY IF EXISTS "Shop owners can view their funnel data" ON conversion_funnel;
CREATE POLICY "Shop owners can view their funnel data"
    ON conversion_funnel FOR SELECT
    USING (shop_id = get_user_shop_id());

DROP POLICY IF EXISTS "System can insert funnel data" ON conversion_funnel;
CREATE POLICY "System can insert funnel data"
    ON conversion_funnel FOR INSERT
    WITH CHECK (true);

-- Policies for ab_experiments
DROP POLICY IF EXISTS "Admins can manage experiments" ON ab_experiments;
CREATE POLICY "Admins can manage experiments"
    ON ab_experiments FOR ALL
    USING (true);

-- Policies for ab_experiment_results
DROP POLICY IF EXISTS "Shop owners can view experiment results" ON ab_experiment_results;
CREATE POLICY "Shop owners can view experiment results"
    ON ab_experiment_results FOR SELECT
    USING (shop_id = get_user_shop_id());

DROP POLICY IF EXISTS "System can insert experiment results" ON ab_experiment_results;
CREATE POLICY "System can insert experiment results"
    ON ab_experiment_results FOR INSERT
    WITH CHECK (true);

-- Policies for discount_schedules
DROP POLICY IF EXISTS "Shop owners can manage discounts" ON discount_schedules;
CREATE POLICY "Shop owners can manage discounts"
    ON discount_schedules FOR ALL
    USING (product_id IN (
        SELECT id FROM products 
        WHERE shop_id = get_user_shop_id()
    ));

-- ===========================================
-- 7. Helper Functions
-- ===========================================

-- Function to get AI metrics summary for a shop
CREATE OR REPLACE FUNCTION get_ai_metrics_summary(
    p_shop_id UUID,
    p_days INTEGER DEFAULT 30
)
RETURNS JSON AS $$
DECLARE
    result JSON;
BEGIN
    SELECT json_build_object(
        'total_events', COUNT(*),
        'successful', COUNT(*) FILTER (WHERE success = true),
        'failed', COUNT(*) FILTER (WHERE success = false),
        'avg_response_time_ms', AVG(response_time_ms),
        'top_tools', (
            SELECT json_agg(row_to_json(t))
            FROM (
                SELECT tool_name, COUNT(*) as count
                FROM ai_analytics
                WHERE shop_id = p_shop_id
                AND created_at >= NOW() - (p_days || ' days')::INTERVAL
                AND tool_name IS NOT NULL
                GROUP BY tool_name
                ORDER BY count DESC
                LIMIT 5
            ) t
        )
    ) INTO result
    FROM ai_analytics
    WHERE shop_id = p_shop_id
    AND created_at >= NOW() - (p_days || ' days')::INTERVAL;

    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_ai_metrics_summary(UUID, INTEGER) TO authenticated;
