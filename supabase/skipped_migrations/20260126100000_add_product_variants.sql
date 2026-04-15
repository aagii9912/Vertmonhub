-- Add Product Variants support
-- Run this in Supabase SQL Editor

-- 1. Create product_variants table
CREATE TABLE IF NOT EXISTS product_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  sku TEXT,
  name TEXT NOT NULL, -- e.g. "Red / 37"
  options JSONB NOT NULL DEFAULT '{}'::jsonb, -- e.g. {"color": "Red", "size": "37"}
  price DECIMAL(12,2), -- Optional override
  stock INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(product_id, sku)
);

CREATE INDEX IF NOT EXISTS idx_product_variants_product ON product_variants(product_id);

-- 2. Add 'has_variants' flag to products
ALTER TABLE products ADD COLUMN IF NOT EXISTS has_variants BOOLEAN DEFAULT false;

-- 3. Trigger to update updated_at
DROP TRIGGER IF EXISTS product_variants_updated_at ON product_variants;
CREATE TRIGGER product_variants_updated_at
  BEFORE UPDATE ON product_variants
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- 4. Function to auto-calculate total stock for parent product
CREATE OR REPLACE FUNCTION update_product_total_stock()
RETURNS TRIGGER AS $$
BEGIN
  -- Update the parent product's stock to be the sum of all active variants
  -- Only if has_variants is true, but we can just sum anyway
  UPDATE products
  SET stock = (
    SELECT COALESCE(SUM(stock), 0)
    FROM product_variants
    WHERE product_id = NEW.product_id AND is_active = true
  )
  WHERE id = NEW.product_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_product_stock ON product_variants;
CREATE TRIGGER trigger_update_product_stock
  AFTER INSERT OR UPDATE OF stock, is_active ON product_variants
  FOR EACH ROW
  EXECUTE FUNCTION update_product_total_stock();

-- 5. Add columns to order_items to store variant info
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS variant_id UUID REFERENCES product_variants(id) ON DELETE SET NULL;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS variant_name TEXT;

-- 6. Add columns to cart_items to store variant info
ALTER TABLE cart_items ADD COLUMN IF NOT EXISTS variant_id UUID REFERENCES product_variants(id) ON DELETE SET NULL;

-- 7. Update checkout_cart function to handle variant_id
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
  
  -- Move cart items to order items (Updated to include variant_id)
  INSERT INTO order_items (order_id, product_id, quantity, unit_price, variant_specs, variant_id)
  SELECT v_order_id, product_id, quantity, unit_price, variant_specs, variant_id
  FROM cart_items
  WHERE cart_id = p_cart_id;
  
  -- Reserve stock for each product (Enhanced for Variants)
  -- 1. Reserve parent stock (legacy/total)
  UPDATE products p
  SET reserved_stock = COALESCE(reserved_stock, 0) + ci.quantity
  FROM cart_items ci
  WHERE ci.cart_id = p_cart_id AND p.id = ci.product_id;
  
  -- 2. Reserve variant stock (if applicable)
  -- Note: We assume 'stock' in product_variants is actual available stock.
  -- If we want reserved_stock there too, we need to add column.
  -- For now, we will just decrement stock immediately or handle reservation later.
  -- Let's just decrement stock for simplicity in this MVP? 
  -- No, standard pattern is to decrement on 'confirmed' or 'shipped'.
  -- But usually we reserve on order creation.
  -- Let's stick to parent reservation for now as 'stock' on parent is sum of variants.
  
  -- Mark cart as checked out
  UPDATE carts SET status = 'checked_out' WHERE id = p_cart_id;
  
  RETURN v_order_id;
END;
$$ LANGUAGE plpgsql SET search_path = public;
