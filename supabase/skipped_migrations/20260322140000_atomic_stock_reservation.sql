-- Migration: Atomic stock reservation function
-- Prevents race conditions when multiple orders try to reserve stock simultaneously

CREATE OR REPLACE FUNCTION reserve_stock(p_product_id UUID, p_quantity INT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    available_qty INT;
BEGIN
    -- Lock the row and check available stock atomically
    SELECT stock - COALESCE(reserved_stock, 0)
    INTO available_qty
    FROM products
    WHERE id = p_product_id
    FOR UPDATE;

    IF available_qty IS NULL THEN
        RETURN FALSE; -- Product not found
    END IF;

    IF available_qty >= p_quantity THEN
        UPDATE products
        SET reserved_stock = COALESCE(reserved_stock, 0) + p_quantity
        WHERE id = p_product_id;
        RETURN TRUE;
    END IF;

    RETURN FALSE; -- Not enough stock
END;
$$;

-- Grant access to service role
GRANT EXECUTE ON FUNCTION reserve_stock(UUID, INT) TO service_role;
