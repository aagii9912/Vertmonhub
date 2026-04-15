-- SmartHub Cart System & Enhanced AI Context
-- Migration: 20260116100000_add_cart_system.sql

-- ============================================
-- 1. SHOPPING CART TABLES
-- ============================================

-- Carts table (one active cart per customer per shop)
CREATE TABLE IF NOT EXISTS carts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID REFERENCES shops(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'checked_out', 'expired')),
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '24 hours',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Unique constraint: one active cart per customer per shop
CREATE UNIQUE INDEX IF NOT EXISTS idx_cart_active_unique 
  ON carts(shop_id, customer_id) 
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_carts_shop ON carts(shop_id);
CREATE INDEX IF NOT EXISTS idx_carts_customer ON carts(customer_id);
CREATE INDEX IF NOT EXISTS idx_carts_expires ON carts(expires_at) WHERE status = 'active';

-- Cart Items table
CREATE TABLE IF NOT EXISTS cart_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cart_id UUID REFERENCES carts(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE CASCADE,
  variant_specs JSONB DEFAULT '{}', -- {"color": "Red", "size": "XL"}
  quantity INTEGER DEFAULT 1 CHECK (quantity > 0),
  unit_price DECIMAL(12,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cart_items_cart ON cart_items(cart_id);
CREATE INDEX IF NOT EXISTS idx_cart_items_product ON cart_items(product_id);

-- Auto-update cart updated_at
DROP TRIGGER IF EXISTS carts_updated_at ON carts;
CREATE TRIGGER carts_updated_at
  BEFORE UPDATE ON carts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- ============================================
-- 2. SHOP ENHANCEMENTS (Custom Knowledge & Policies)
-- ============================================

-- Add custom_knowledge column for AI context
ALTER TABLE shops ADD COLUMN IF NOT EXISTS custom_knowledge JSONB DEFAULT '{}';

-- Add policies column for shop rules
ALTER TABLE shops ADD COLUMN IF NOT EXISTS policies JSONB DEFAULT '{
  "shipping_threshold": 50000,
  "payment_methods": ["QPay", "SocialPay", "Бэлэн мөнгө"],
  "delivery_areas": ["Улаанбаатар"],
  "return_policy": "7 хоногийн дотор буцаах боломжтой"
}';

-- ============================================
-- 3. VARIANT SPECS ON ORDER ITEMS
-- ============================================

-- Add variant_specs to order_items for tracking which variant was ordered
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS variant_specs JSONB DEFAULT '{}';

-- ============================================
-- 4. HELPER FUNCTIONS
-- ============================================

-- Function: Get or create active cart for a customer
CREATE OR REPLACE FUNCTION get_or_create_cart(
  p_shop_id UUID,
  p_customer_id UUID
) RETURNS UUID AS $$
DECLARE
  v_cart_id UUID;
BEGIN
  -- Try to find existing active cart
  SELECT id INTO v_cart_id
  FROM carts
  WHERE shop_id = p_shop_id 
    AND customer_id = p_customer_id 
    AND status = 'active'
    AND expires_at > NOW()
  LIMIT 1;
  
  -- If no active cart, create one
  IF v_cart_id IS NULL THEN
    INSERT INTO carts (shop_id, customer_id, status)
    VALUES (p_shop_id, p_customer_id, 'active')
    RETURNING id INTO v_cart_id;
  END IF;
  
  RETURN v_cart_id;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Function: Calculate cart total
CREATE OR REPLACE FUNCTION calculate_cart_total(p_cart_id UUID) 
RETURNS DECIMAL(12,2) AS $$
DECLARE
  v_total DECIMAL(12,2);
BEGIN
  SELECT COALESCE(SUM(unit_price * quantity), 0)
  INTO v_total
  FROM cart_items
  WHERE cart_id = p_cart_id;
  
  RETURN v_total;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Function: Checkout cart (convert to order)
CREATE OR REPLACE FUNCTION checkout_cart(p_cart_id UUID, p_notes TEXT DEFAULT NULL)
RETURNS UUID AS $$
DECLARE
  v_cart RECORD;
  v_order_id UUID;
  v_total DECIMAL(12,2);
BEGIN
  -- Get cart info
  SELECT * INTO v_cart FROM carts WHERE id = p_cart_id AND status = 'active';
  
  IF v_cart IS NULL THEN
    RAISE EXCEPTION 'Cart not found or already checked out';
  END IF;
  
  -- Calculate total
  v_total := calculate_cart_total(p_cart_id);
  
  IF v_total <= 0 THEN
    RAISE EXCEPTION 'Cart is empty';
  END IF;
  
  -- Create order
  INSERT INTO orders (shop_id, customer_id, status, total_amount, notes)
  VALUES (v_cart.shop_id, v_cart.customer_id, 'pending', v_total, p_notes)
  RETURNING id INTO v_order_id;
  
  -- Move cart items to order items
  INSERT INTO order_items (order_id, product_id, quantity, unit_price, variant_specs)
  SELECT v_order_id, product_id, quantity, unit_price, variant_specs
  FROM cart_items
  WHERE cart_id = p_cart_id;
  
  -- Reserve stock for each product
  UPDATE products p
  SET reserved_stock = COALESCE(reserved_stock, 0) + ci.quantity
  FROM cart_items ci
  WHERE ci.cart_id = p_cart_id AND p.id = ci.product_id;
  
  -- Mark cart as checked out
  UPDATE carts SET status = 'checked_out' WHERE id = p_cart_id;
  
  RETURN v_order_id;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- ============================================
-- 5. RLS POLICIES FOR CARTS
-- ============================================

ALTER TABLE carts ENABLE ROW LEVEL SECURITY;
ALTER TABLE cart_items ENABLE ROW LEVEL SECURITY;

-- Carts: Users can manage carts for their own shop
DO $$ BEGIN
  CREATE POLICY "Users can manage own shop carts" ON carts
    FOR ALL USING (shop_id IN (
      SELECT id FROM shops WHERE clerk_user_id = auth.jwt() ->> 'sub'
    ));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Cart Items: Access through cart ownership
DO $$ BEGIN
  CREATE POLICY "Users can manage cart items through cart" ON cart_items
    FOR ALL USING (cart_id IN (
      SELECT c.id FROM carts c
      JOIN shops s ON c.shop_id = s.id
      WHERE s.clerk_user_id = auth.jwt() ->> 'sub'
    ));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================
-- 6. CART EXPIRATION CLEANUP (Optional scheduled job)
-- ============================================

-- Function to expire old carts
CREATE OR REPLACE FUNCTION expire_old_carts() 
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER;
BEGIN
  UPDATE carts 
  SET status = 'expired'
  WHERE status = 'active' AND expires_at < NOW();
  
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql SET search_path = public;

SELECT 'Cart system migration completed successfully! ✅' as result;
