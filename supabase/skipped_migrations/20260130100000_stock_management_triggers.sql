-- Stock Management Enhancement Migration
-- Decrements actual stock when order status changes to 'paid'
-- This ensures proper inventory tracking after payment confirmation

-- Function to decrement stock when order is confirmed
CREATE OR REPLACE FUNCTION decrement_stock_on_order_paid()
RETURNS TRIGGER AS $$
BEGIN
  -- Only act when status changes to 'paid' from another status
  IF NEW.status = 'paid' AND OLD.status != 'paid' THEN
    -- Decrement stock for each order item
    UPDATE products p
    SET 
      stock = COALESCE(stock, 0) - oi.quantity,
      reserved_stock = GREATEST(0, COALESCE(reserved_stock, 0) - oi.quantity)
    FROM order_items oi
    WHERE oi.order_id = NEW.id AND p.id = oi.product_id;
    
    -- Also handle variant stock if applicable
    UPDATE product_variants pv
    SET stock = GREATEST(0, stock - oi.quantity)
    FROM order_items oi
    WHERE oi.order_id = NEW.id 
      AND oi.variant_id IS NOT NULL 
      AND pv.id = oi.variant_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create trigger on orders table
DROP TRIGGER IF EXISTS trigger_decrement_stock_on_paid ON orders;
CREATE TRIGGER trigger_decrement_stock_on_paid
  AFTER UPDATE OF status ON orders
  FOR EACH ROW
  EXECUTE FUNCTION decrement_stock_on_order_paid();

-- Function to restore stock when order is cancelled
CREATE OR REPLACE FUNCTION restore_stock_on_order_cancelled()
RETURNS TRIGGER AS $$
BEGIN
  -- Only act when status changes to 'cancelled' from pending/paid
  IF NEW.status = 'cancelled' AND OLD.status IN ('pending', 'paid') THEN
    -- If was pending, restore reserved_stock (not actual stock)
    IF OLD.status = 'pending' THEN
      UPDATE products p
      SET reserved_stock = GREATEST(0, COALESCE(reserved_stock, 0) - oi.quantity)
      FROM order_items oi
      WHERE oi.order_id = NEW.id AND p.id = oi.product_id;
    END IF;
    
    -- If was already paid, restore actual stock
    IF OLD.status = 'paid' THEN
      UPDATE products p
      SET stock = COALESCE(stock, 0) + oi.quantity
      FROM order_items oi
      WHERE oi.order_id = NEW.id AND p.id = oi.product_id;
      
      -- Also restore variant stock
      UPDATE product_variants pv
      SET stock = stock + oi.quantity
      FROM order_items oi
      WHERE oi.order_id = NEW.id 
        AND oi.variant_id IS NOT NULL 
        AND pv.id = oi.variant_id;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create trigger for cancellations
DROP TRIGGER IF EXISTS trigger_restore_stock_on_cancelled ON orders;
CREATE TRIGGER trigger_restore_stock_on_cancelled
  AFTER UPDATE OF status ON orders
  FOR EACH ROW
  EXECUTE FUNCTION restore_stock_on_order_cancelled();
