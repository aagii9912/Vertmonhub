-- Fix missing subscription columns in shops table
-- These should have been added by 009_add_subscription_system.sql but were missing

ALTER TABLE shops 
ADD COLUMN IF NOT EXISTS plan_id UUID REFERENCES plans(id),
ADD COLUMN IF NOT EXISTS subscription_id UUID REFERENCES subscriptions(id);

-- Set default free plan for shops that have no plan
DO $$
DECLARE
    v_free_plan_id UUID;
BEGIN
    SELECT id INTO v_free_plan_id FROM plans WHERE slug = 'free' LIMIT 1;
    
    IF v_free_plan_id IS NOT NULL THEN
        UPDATE shops 
        SET plan_id = v_free_plan_id
        WHERE plan_id IS NULL;
    END IF;
END $$;
