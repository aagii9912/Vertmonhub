-- Add subscription tracking fields to shops and message counting to customers
-- For plan-based AI routing with message limits

-- ============================================
-- SHOPS: Subscription fields
-- ============================================

ALTER TABLE shops 
ADD COLUMN IF NOT EXISTS subscription_plan VARCHAR(50) DEFAULT 'starter',
ADD COLUMN IF NOT EXISTS subscription_status VARCHAR(50) DEFAULT 'trial',
ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '14 days');

-- Set default values for existing shops
UPDATE shops 
SET 
    subscription_plan = COALESCE(subscription_plan, 'starter'),
    subscription_status = COALESCE(subscription_status, 'trial'),
    trial_ends_at = COALESCE(trial_ends_at, NOW() + INTERVAL '14 days')
WHERE subscription_plan IS NULL OR subscription_status IS NULL;

-- ============================================
-- CUSTOMERS: Message counting fields
-- ============================================

ALTER TABLE customers
ADD COLUMN IF NOT EXISTS message_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS message_count_reset_at TIMESTAMPTZ DEFAULT date_trunc('month', NOW() + INTERVAL '1 month');

-- Set default values for existing customers
UPDATE customers
SET 
    message_count = COALESCE(message_count, 0),
    message_count_reset_at = COALESCE(message_count_reset_at, date_trunc('month', NOW() + INTERVAL '1 month'))
WHERE message_count IS NULL OR message_count_reset_at IS NULL;

-- ============================================
-- FUNCTION: Reset message count monthly
-- ============================================

CREATE OR REPLACE FUNCTION reset_monthly_message_count()
RETURNS TRIGGER AS $$
BEGIN
    -- Check if reset date has passed
    IF NEW.message_count_reset_at <= NOW() THEN
        NEW.message_count := 0;
        NEW.message_count_reset_at := date_trunc('month', NOW() + INTERVAL '1 month');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-reset on any customer update
DROP TRIGGER IF EXISTS trigger_reset_message_count ON customers;
CREATE TRIGGER trigger_reset_message_count
    BEFORE UPDATE ON customers
    FOR EACH ROW
    EXECUTE FUNCTION reset_monthly_message_count();

-- ============================================
-- FUNCTION: Increment message count
-- ============================================

CREATE OR REPLACE FUNCTION increment_customer_message_count(p_customer_id UUID)
RETURNS INTEGER AS $$
DECLARE
    v_new_count INTEGER;
BEGIN
    UPDATE customers
    SET message_count = message_count + 1
    WHERE id = p_customer_id
    RETURNING message_count INTO v_new_count;
    
    RETURN v_new_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- INDEXES for performance
-- ============================================

CREATE INDEX IF NOT EXISTS idx_shops_subscription_plan ON shops(subscription_plan);
CREATE INDEX IF NOT EXISTS idx_shops_subscription_status ON shops(subscription_status);
CREATE INDEX IF NOT EXISTS idx_customers_message_count ON customers(shop_id, message_count);

-- ============================================
-- Comments for documentation
-- ============================================

COMMENT ON COLUMN shops.subscription_plan IS 'Customer plan: trial, starter, pro, ultimate';
COMMENT ON COLUMN shops.subscription_status IS 'Subscription status: trial, active, inactive, cancelled';
COMMENT ON COLUMN shops.trial_ends_at IS 'Trial period end date';
COMMENT ON COLUMN customers.message_count IS 'Number of AI messages this month';
COMMENT ON COLUMN customers.message_count_reset_at IS 'Date to reset message count (1st of next month)';
