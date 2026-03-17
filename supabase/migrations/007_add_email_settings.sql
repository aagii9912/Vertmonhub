-- Add email settings and customer email tracking

-- ============================================
-- ADD EMAIL SETTINGS TO SHOPS
-- ============================================
ALTER TABLE shops
    ADD COLUMN IF NOT EXISTS email_from TEXT,
    ADD COLUMN IF NOT EXISTS email_notifications_enabled BOOLEAN DEFAULT true,
    ADD COLUMN IF NOT EXISTS email_settings JSONB DEFAULT '{}';

-- Update demo shop with email settings
UPDATE shops 
SET 
    email_from = 'orders@smarthub.mn',
    email_notifications_enabled = true,
    email_settings = jsonb_build_object(
        'send_order_confirmation', true,
        'send_payment_confirmation', true,
        'send_shipping_update', true,
        'send_delivery_confirmation', true
    )
WHERE id = '00000000-0000-0000-0000-000000000001';

-- ============================================
-- ADD EMAIL TO CUSTOMERS
-- ============================================
ALTER TABLE customers
    ADD COLUMN IF NOT EXISTS email TEXT,
    ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT false;

-- Create index for email lookups
CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(email) WHERE email IS NOT NULL;

-- ============================================
-- EMAIL LOGS TABLE (Optional - for tracking)
-- ============================================
CREATE TABLE IF NOT EXISTS email_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id UUID REFERENCES shops(id) ON DELETE CASCADE,
    customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
    order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
    
    -- Email details
    email_type TEXT NOT NULL, -- 'order_confirmation', 'payment_confirmation', etc.
    recipient_email TEXT NOT NULL,
    subject TEXT,
    
    -- Status tracking
    status TEXT DEFAULT 'sent', -- 'sent', 'delivered', 'failed', 'bounced'
    error_message TEXT,
    
    -- Metadata
    metadata JSONB DEFAULT '{}',
    
    -- Timestamps
    sent_at TIMESTAMPTZ DEFAULT NOW(),
    delivered_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_email_logs_shop ON email_logs(shop_id);
CREATE INDEX IF NOT EXISTS idx_email_logs_customer ON email_logs(customer_id);
CREATE INDEX IF NOT EXISTS idx_email_logs_order ON email_logs(order_id);
CREATE INDEX IF NOT EXISTS idx_email_logs_status ON email_logs(status);

SELECT 'Email settings schema created successfully! ✅' as result;
