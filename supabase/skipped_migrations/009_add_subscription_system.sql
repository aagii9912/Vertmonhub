-- ============================================
-- SmartHub Subscription System Migration
-- 009_add_subscription_system.sql
-- ============================================

-- ============================================
-- 1. PLANS TABLE
-- Admin-аас тохируулдаг үнийн багцууд
-- ============================================

CREATE TABLE IF NOT EXISTS plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(50) NOT NULL UNIQUE,
    description TEXT,
    
    -- Pricing (MNT)
    price_monthly INTEGER NOT NULL DEFAULT 0,
    price_yearly INTEGER, -- Optional yearly pricing with discount
    
    -- Features (Flexible JSON)
    features JSONB DEFAULT '{
        "messages_per_month": 100,
        "shops_limit": 1,
        "ai_enabled": true,
        "comment_reply": false,
        "analytics": "basic",
        "priority_support": false,
        "custom_branding": false
    }'::jsonb,
    
    -- Limits (For enforcement)
    limits JSONB DEFAULT '{
        "max_messages": 100,
        "max_shops": 1,
        "max_products": 50,
        "max_customers": 100
    }'::jsonb,
    
    -- Display
    is_active BOOLEAN DEFAULT true,
    is_featured BOOLEAN DEFAULT false, -- Highlight this plan
    sort_order INTEGER DEFAULT 0,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default plans
INSERT INTO plans (name, slug, description, price_monthly, price_yearly, features, limits, sort_order) VALUES
(
    'Free',
    'free',
    'Эхлэхэд тохиромжтой',
    0,
    0,
    '{"messages_per_month": 100, "shops_limit": 1, "ai_enabled": true, "comment_reply": false, "analytics": "basic", "priority_support": false}'::jsonb,
    '{"max_messages": 100, "max_shops": 1, "max_products": 20, "max_customers": 50}'::jsonb,
    1
),
(
    'Starter',
    'starter',
    'Жижиг бизнест',
    29900,
    299000,
    '{"messages_per_month": 1000, "shops_limit": 1, "ai_enabled": true, "comment_reply": true, "analytics": "basic", "priority_support": false}'::jsonb,
    '{"max_messages": 1000, "max_shops": 1, "max_products": 100, "max_customers": 500}'::jsonb,
    2
),
(
    'Professional',
    'professional',
    'Өсөж буй бизнест',
    79900,
    799000,
    '{"messages_per_month": 5000, "shops_limit": 3, "ai_enabled": true, "comment_reply": true, "analytics": "advanced", "priority_support": true}'::jsonb,
    '{"max_messages": 5000, "max_shops": 3, "max_products": 500, "max_customers": 2000}'::jsonb,
    3
),
(
    'Enterprise',
    'enterprise',
    'Том байгууллагад',
    199900,
    1999000,
    '{"messages_per_month": -1, "shops_limit": -1, "ai_enabled": true, "comment_reply": true, "analytics": "advanced", "priority_support": true, "custom_branding": true}'::jsonb,
    '{"max_messages": -1, "max_shops": -1, "max_products": -1, "max_customers": -1}'::jsonb,
    4
);

-- ============================================
-- 2. SUBSCRIPTIONS TABLE
-- Хэрэглэгчийн идэвхтэй subscription
-- ============================================

CREATE TABLE IF NOT EXISTS subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    plan_id UUID NOT NULL REFERENCES plans(id),
    
    -- Status
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'canceled', 'past_due', 'expired', 'trialing')),
    
    -- Billing
    billing_cycle VARCHAR(10) DEFAULT 'monthly' CHECK (billing_cycle IN ('monthly', 'yearly')),
    
    -- Period
    current_period_start TIMESTAMPTZ DEFAULT NOW(),
    current_period_end TIMESTAMPTZ DEFAULT NOW() + INTERVAL '1 month',
    
    -- Cancellation
    cancel_at_period_end BOOLEAN DEFAULT false,
    canceled_at TIMESTAMPTZ,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- One active subscription per shop
    UNIQUE(shop_id)
);

-- ============================================
-- 3. INVOICES TABLE
-- Төлбөрийн бичиг
-- ============================================

CREATE TABLE IF NOT EXISTS invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_number VARCHAR(50) UNIQUE,
    shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    subscription_id UUID REFERENCES subscriptions(id),
    
    -- Amount
    amount INTEGER NOT NULL, -- MNT
    currency VARCHAR(3) DEFAULT 'MNT',
    
    -- Status
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'failed', 'refunded', 'canceled')),
    
    -- QPay
    qpay_invoice_id VARCHAR(100),
    qpay_qr_code TEXT,
    qpay_urls JSONB, -- Deep links for banks
    
    -- Dates
    due_date TIMESTAMPTZ DEFAULT NOW() + INTERVAL '7 days',
    paid_at TIMESTAMPTZ,
    
    -- Details
    description TEXT,
    metadata JSONB DEFAULT '{}',
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Generate invoice number
CREATE OR REPLACE FUNCTION generate_invoice_number()
RETURNS TRIGGER AS $$
BEGIN
    NEW.invoice_number := 'INV-' || TO_CHAR(NOW(), 'YYYYMM') || '-' || LPAD(NEXTVAL('invoice_number_seq')::TEXT, 5, '0');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE SEQUENCE IF NOT EXISTS invoice_number_seq START 1;

CREATE TRIGGER set_invoice_number
    BEFORE INSERT ON invoices
    FOR EACH ROW
    WHEN (NEW.invoice_number IS NULL)
    EXECUTE FUNCTION generate_invoice_number();

-- ============================================
-- 4. USAGE TRACKING
-- Хэрэглээний тоо хянах
-- ============================================

CREATE TABLE IF NOT EXISTS usage_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    metric_type VARCHAR(50) NOT NULL, -- messages, orders, customers, api_calls
    count INTEGER DEFAULT 1,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_usage_logs_shop_date ON usage_logs(shop_id, created_at);
CREATE INDEX IF NOT EXISTS idx_usage_logs_metric ON usage_logs(metric_type, created_at);

-- Monthly usage summary (materialized view alternative)
CREATE TABLE IF NOT EXISTS usage_summary (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    period_start DATE NOT NULL, -- First day of month
    period_end DATE NOT NULL,   -- Last day of month
    
    -- Counts
    messages_count INTEGER DEFAULT 0,
    orders_count INTEGER DEFAULT 0,
    customers_count INTEGER DEFAULT 0,
    api_calls_count INTEGER DEFAULT 0,
    
    -- Timestamps
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(shop_id, period_start)
);

-- ============================================
-- 5. ADMINS TABLE
-- Super admin хандалт
-- ============================================

CREATE TABLE IF NOT EXISTS admins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL UNIQUE,
    role VARCHAR(20) DEFAULT 'admin' CHECK (role IN ('super_admin', 'admin', 'support')),
    is_active BOOLEAN DEFAULT true,
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 6. UPDATE SHOPS TABLE
-- Add subscription-related columns
-- ============================================

ALTER TABLE shops ADD COLUMN IF NOT EXISTS subscription_id UUID REFERENCES subscriptions(id);
ALTER TABLE shops ADD COLUMN IF NOT EXISTS plan_id UUID REFERENCES plans(id);

-- Set default free plan for existing shops
UPDATE shops 
SET plan_id = (SELECT id FROM plans WHERE slug = 'free' LIMIT 1)
WHERE plan_id IS NULL;

-- ============================================
-- 7. RLS POLICIES
-- ============================================

-- Plans (public read, admin write)
ALTER TABLE plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Plans are viewable by everyone"
    ON plans FOR SELECT
    USING (is_active = true);

CREATE POLICY "Admins can manage plans"
    ON plans FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM admins 
            WHERE user_id = auth.uid() 
            AND is_active = true
        )
    );

-- Subscriptions
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own subscription"
    ON subscriptions FOR SELECT
    USING (
        shop_id IN (
            SELECT id FROM shops WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Admins can manage subscriptions"
    ON subscriptions FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM admins 
            WHERE user_id = auth.uid() 
            AND is_active = true
        )
    );

-- Invoices
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own invoices"
    ON invoices FOR SELECT
    USING (
        shop_id IN (
            SELECT id FROM shops WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Admins can manage invoices"
    ON invoices FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM admins 
            WHERE user_id = auth.uid() 
            AND is_active = true
        )
    );

-- Usage logs
ALTER TABLE usage_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own usage"
    ON usage_logs FOR SELECT
    USING (
        shop_id IN (
            SELECT id FROM shops WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "System can insert usage"
    ON usage_logs FOR INSERT
    WITH CHECK (true);

-- Admins table
ALTER TABLE admins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view admins"
    ON admins FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM admins a
            WHERE a.user_id = auth.uid() 
            AND a.is_active = true
        )
    );

CREATE POLICY "Super admins can manage admins"
    ON admins FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM admins 
            WHERE user_id = auth.uid() 
            AND role = 'super_admin'
            AND is_active = true
        )
    );

-- ============================================
-- 8. HELPER FUNCTIONS
-- ============================================

-- Check if shop has exceeded limits
CREATE OR REPLACE FUNCTION check_shop_limits(p_shop_id UUID, p_metric VARCHAR)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_limit INTEGER;
    v_current INTEGER;
    v_period_start DATE;
BEGIN
    -- Get current period start (first day of month)
    v_period_start := DATE_TRUNC('month', NOW())::DATE;
    
    -- Get limit from shop's plan
    SELECT (p.limits->>('max_' || p_metric))::INTEGER
    INTO v_limit
    FROM shops s
    JOIN plans p ON s.plan_id = p.id
    WHERE s.id = p_shop_id;
    
    -- -1 means unlimited
    IF v_limit = -1 THEN
        RETURN true;
    END IF;
    
    -- Get current usage
    SELECT COALESCE(SUM(count), 0)
    INTO v_current
    FROM usage_logs
    WHERE shop_id = p_shop_id
    AND metric_type = p_metric
    AND created_at >= v_period_start;
    
    RETURN v_current < v_limit;
END;
$$;

-- Log usage
CREATE OR REPLACE FUNCTION log_usage(p_shop_id UUID, p_metric VARCHAR, p_count INTEGER DEFAULT 1)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO usage_logs (shop_id, metric_type, count)
    VALUES (p_shop_id, p_metric, p_count);
END;
$$;

-- Get current usage for shop
CREATE OR REPLACE FUNCTION get_shop_usage(p_shop_id UUID)
RETURNS TABLE (
    metric_type VARCHAR,
    current_usage BIGINT,
    limit_value INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_period_start DATE;
BEGIN
    v_period_start := DATE_TRUNC('month', NOW())::DATE;
    
    RETURN QUERY
    SELECT 
        u.metric_type,
        COALESCE(SUM(u.count), 0) as current_usage,
        CASE 
            WHEN p.limits->>(u.metric_type) = '-1' THEN -1
            ELSE (p.limits->>('max_' || REPLACE(u.metric_type, 's_count', 's')))::INTEGER
        END as limit_value
    FROM usage_logs u
    JOIN shops s ON s.id = u.shop_id
    JOIN plans p ON p.id = s.plan_id
    WHERE u.shop_id = p_shop_id
    AND u.created_at >= v_period_start
    GROUP BY u.metric_type, p.limits;
END;
$$;

-- ============================================
-- SUCCESS MESSAGE
-- ============================================

SELECT 'Subscription system tables created successfully!' as status;
