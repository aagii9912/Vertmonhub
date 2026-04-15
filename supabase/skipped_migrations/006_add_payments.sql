-- Add payment support to SmartHub
-- Supports QPay, cash, and bank transfer methods

-- ============================================
-- PAYMENT STATUS ENUM
-- ============================================
DO $$ BEGIN
    CREATE TYPE payment_status AS ENUM (
        'pending',
        'paid',
        'failed',
        'refunded',
        'expired'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- ============================================
-- PAYMENTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
    shop_id UUID REFERENCES shops(id) ON DELETE CASCADE,
    
    -- Payment details
    payment_method TEXT NOT NULL, -- 'qpay', 'cash', 'bank_transfer'
    amount DECIMAL(12,2) NOT NULL,
    status payment_status DEFAULT 'pending',
    
    -- QPay specific fields
    qpay_invoice_id TEXT UNIQUE,
    qpay_transaction_id TEXT,
    qpay_qr_text TEXT,
    qpay_qr_image TEXT,
    
    -- Additional metadata
    metadata JSONB DEFAULT '{}',
    notes TEXT,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    paid_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_payments_order ON payments(order_id);
CREATE INDEX IF NOT EXISTS idx_payments_shop ON payments(shop_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_qpay_invoice ON payments(qpay_invoice_id) WHERE qpay_invoice_id IS NOT NULL;

-- ============================================
-- ADD PAYMENT FIELDS TO ORDERS
-- ============================================
ALTER TABLE orders 
    ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'cash',
    ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'pending',
    ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;

-- Create index for payment status queries
CREATE INDEX IF NOT EXISTS idx_orders_payment_status ON orders(payment_status);

-- ============================================
-- TRIGGER: Update order when payment is made
-- ============================================
CREATE OR REPLACE FUNCTION update_order_on_payment()
RETURNS TRIGGER AS $$
BEGIN
    -- When payment status changes to 'paid'
    IF NEW.status = 'paid' AND (OLD.status IS NULL OR OLD.status != 'paid') THEN
        -- Update order
        UPDATE orders 
        SET 
            payment_status = 'paid',
            payment_method = NEW.payment_method,
            paid_at = NEW.paid_at,
            status = CASE 
                WHEN status = 'pending' THEN 'confirmed'::order_status
                ELSE status 
            END,
            updated_at = NOW()
        WHERE id = NEW.order_id;
        
        NEW.paid_at = COALESCE(NEW.paid_at, NOW());
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_order_on_payment ON payments;
CREATE TRIGGER trigger_update_order_on_payment
    BEFORE INSERT OR UPDATE ON payments
    FOR EACH ROW
    EXECUTE FUNCTION update_order_on_payment();

-- ============================================
-- HELPER FUNCTION: Create payment for order
-- ============================================
CREATE OR REPLACE FUNCTION create_payment(
    p_order_id UUID,
    p_payment_method TEXT,
    p_amount DECIMAL DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    v_payment_id UUID;
    v_shop_id UUID;
    v_order_amount DECIMAL;
BEGIN
    -- Get order details
    SELECT shop_id, total_amount INTO v_shop_id, v_order_amount
    FROM orders WHERE id = p_order_id;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Order not found: %', p_order_id;
    END IF;
    
    -- Use order amount if not specified
    v_order_amount := COALESCE(p_amount, v_order_amount);
    
    -- Create payment record
    INSERT INTO payments (order_id, shop_id, payment_method, amount)
    VALUES (p_order_id, v_shop_id, p_payment_method, v_order_amount)
    RETURNING id INTO v_payment_id;
    
    RETURN v_payment_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- HELPER FUNCTION: Mark payment as paid
-- ============================================
CREATE OR REPLACE FUNCTION mark_payment_paid(
    p_payment_id UUID,
    p_transaction_id TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
BEGIN
    UPDATE payments
    SET 
        status = 'paid'::payment_status,
        paid_at = NOW(),
        qpay_transaction_id = COALESCE(p_transaction_id, qpay_transaction_id)
    WHERE id = p_payment_id AND status = 'pending'::payment_status;
    
    RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

SELECT 'Payment system schema created successfully! ✅' as result;
