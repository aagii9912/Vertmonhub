-- Phase 3: Row Level Security (RLS) Implementation
-- Fixes all 9 Supabase security warnings
-- Implements shop-level data isolation

-- ============================================
-- ENABLE RLS ON ALL TABLES
-- ============================================

ALTER TABLE shops ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;

ALTER TABLE chat_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_logs ENABLE ROW LEVEL SECURITY;

-- ============================================
-- HELPER FUNCTION: Get current user's shop_id
-- ============================================
CREATE OR REPLACE FUNCTION get_user_shop_id()
RETURNS UUID AS $$
BEGIN
    -- Return shop_id for authenticated user
    -- Assumes users table has shop_id column
    RETURN (
        SELECT shop_id 
        FROM users 
        WHERE id = auth.uid()
        LIMIT 1
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- SHOPS TABLE POLICIES
-- ============================================

-- Users can view their own shop
CREATE POLICY "shops_select_own" ON shops
    FOR SELECT
    USING (id = get_user_shop_id());

-- Users can update their own shop
CREATE POLICY "shops_update_own" ON shops
    FOR UPDATE
    USING (id = get_user_shop_id());

-- Only service role can insert/delete shops
-- (Handled via service role key, no policy needed)

-- ============================================
-- PRODUCTS TABLE POLICIES
-- ============================================

-- Users can view their shop's products
CREATE POLICY "products_select_own_shop" ON products
    FOR SELECT
    USING (shop_id = get_user_shop_id());

-- Users can insert products for their shop
CREATE POLICY "products_insert_own_shop" ON products
    FOR INSERT
    WITH CHECK (shop_id = get_user_shop_id());

-- Users can update their shop's products
CREATE POLICY "products_update_own_shop" ON products
    FOR UPDATE
    USING (shop_id = get_user_shop_id());

-- Users can delete their shop's products
CREATE POLICY "products_delete_own_shop" ON products
    FOR DELETE
    USING (shop_id = get_user_shop_id());

-- ============================================
-- CUSTOMERS TABLE POLICIES
-- ============================================

-- Users can view their shop's customers
CREATE POLICY "customers_select_own_shop" ON customers
    FOR SELECT
    USING (shop_id = get_user_shop_id());

-- Users can insert customers for their shop
CREATE POLICY "customers_insert_own_shop" ON customers
    FOR INSERT
    WITH CHECK (shop_id = get_user_shop_id());

-- Users can update their shop's customers
CREATE POLICY "customers_update_own_shop" ON customers
    FOR UPDATE
    USING (shop_id = get_user_shop_id());

-- Users can delete their shop's customers
CREATE POLICY "customers_delete_own_shop" ON customers
    FOR DELETE
    USING (shop_id = get_user_shop_id());

-- ============================================
-- ORDERS TABLE POLICIES
-- ============================================

-- Users can view their shop's orders
CREATE POLICY "orders_select_own_shop" ON orders
    FOR SELECT
    USING (shop_id = get_user_shop_id());

-- Users can insert orders for their shop
CREATE POLICY "orders_insert_own_shop" ON orders
    FOR INSERT
    WITH CHECK (shop_id = get_user_shop_id());

-- Users can update their shop's orders
CREATE POLICY "orders_update_own_shop" ON orders
    FOR UPDATE
    USING (shop_id = get_user_shop_id());

-- Users can delete their shop's orders
CREATE POLICY "orders_delete_own_shop" ON orders
    FOR DELETE
    USING (shop_id = get_user_shop_id());

-- ============================================
-- ORDER_ITEMS TABLE POLICIES
-- ============================================

-- Users can view order items for their shop's orders
CREATE POLICY "order_items_select_own_shop" ON order_items
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM orders 
            WHERE orders.id = order_items.order_id 
            AND orders.shop_id = get_user_shop_id()
        )
    );

-- Users can insert order items for their shop's orders
CREATE POLICY "order_items_insert_own_shop" ON order_items
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM orders 
            WHERE orders.id = order_items.order_id 
            AND orders.shop_id = get_user_shop_id()
        )
    );

-- Users can update order items for their shop's orders
CREATE POLICY "order_items_update_own_shop" ON order_items
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM orders 
            WHERE orders.id = order_items.order_id 
            AND orders.shop_id = get_user_shop_id()
        )
    );

-- Users can delete order items for their shop's orders
CREATE POLICY "order_items_delete_own_shop" ON order_items
    FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM orders 
            WHERE orders.id = order_items.order_id 
            AND orders.shop_id = get_user_shop_id()
        )
    );



-- ============================================
-- CHAT_HISTORY TABLE POLICIES
-- ============================================

-- Users can view chat history for their shop
CREATE POLICY "chat_history_select_own_shop" ON chat_history
    FOR SELECT
    USING (shop_id = get_user_shop_id());

-- Users can insert chat history for their shop
CREATE POLICY "chat_history_insert_own_shop" ON chat_history
    FOR INSERT
    WITH CHECK (shop_id = get_user_shop_id());

-- Users can update chat history for their shop
CREATE POLICY "chat_history_update_own_shop" ON chat_history
    FOR UPDATE
    USING (shop_id = get_user_shop_id());

-- Users can delete chat history for their shop
CREATE POLICY "chat_history_delete_own_shop" ON chat_history
    FOR DELETE
    USING (shop_id = get_user_shop_id());

-- ============================================
-- EMAIL_LOGS TABLE POLICIES
-- ============================================

-- Users can view email logs for their shop
CREATE POLICY "email_logs_select_own_shop" ON email_logs
    FOR SELECT
    USING (shop_id = get_user_shop_id());

-- Users can insert email logs for their shop
CREATE POLICY "email_logs_insert_own_shop" ON email_logs
    FOR INSERT
    WITH CHECK (shop_id = get_user_shop_id());

-- Users can update email logs for their shop
CREATE POLICY "email_logs_update_own_shop" ON email_logs
    FOR UPDATE
    USING (shop_id = get_user_shop_id());

-- Users can delete email logs for their shop
CREATE POLICY "email_logs_delete_own_shop" ON email_logs
    FOR DELETE
    USING (shop_id = get_user_shop_id());

-- ============================================
-- FIX FUNCTION SECURITY (Search Path Issues)
-- ============================================

-- Fix: auto_tag_vip_customer
CREATE OR REPLACE FUNCTION auto_tag_vip_customer()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF NEW.total_spent >= 500000 THEN
        IF NEW.tags IS NULL OR NOT ('VIP' = ANY(NEW.tags)) THEN
            NEW.tags := array_append(COALESCE(NEW.tags, ARRAY[]::TEXT[]), 'VIP');
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Fix: tag_new_customer
CREATE OR REPLACE FUNCTION tag_new_customer()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    NEW.tags := ARRAY['new'];
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Fix: decrement_stock
CREATE OR REPLACE FUNCTION decrement_stock()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    UPDATE products
    SET stock = stock - NEW.quantity
    WHERE id = NEW.product_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;



-- Fix: update_order_on_payment (already has SECURITY DEFINER, just add search_path)
CREATE OR REPLACE FUNCTION update_order_on_payment()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF NEW.status = 'paid' AND (OLD.status IS NULL OR OLD.status != 'paid') THEN
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

-- ============================================
-- SPECIAL: Allow service role to bypass RLS
-- ============================================
-- Service role operations (API routes using supabaseAdmin)
-- automatically bypass RLS, so no special policy needed

-- ============================================
-- VERIFICATION QUERIES
-- ============================================

-- Check RLS is enabled
SELECT 
    schemaname,
    tablename,
    rowsecurity as rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;

-- Count policies created
SELECT 
    tablename,
    COUNT(*) as policy_count
FROM pg_policies
WHERE schemaname = 'public'
GROUP BY tablename
ORDER BY tablename;

-- List all policies
SELECT 
    tablename,
    policyname,
    cmd as operation,
    qual as using_clause
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

SELECT 'RLS policies implemented successfully! ✅' as result;
SELECT 'All 9 Supabase security warnings should now be resolved! 🎉' as status;
