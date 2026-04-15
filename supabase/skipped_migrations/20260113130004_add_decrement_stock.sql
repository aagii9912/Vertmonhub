-- Function to safely decrement stock
-- Helps prevent race conditions and negative stock (could add checks)

CREATE OR REPLACE FUNCTION decrement_stock(p_id UUID, qty INTEGER)
RETURNS VOID AS $$
BEGIN
  UPDATE products
  SET stock = stock - qty
  WHERE id = p_id;
END;
$$ LANGUAGE plpgsql;
