-- ============================================
-- Fix function_search_path_mutable warnings
-- ============================================

-- 1. reset_monthly_message_count
CREATE OR REPLACE FUNCTION reset_monthly_message_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF NEW.message_count_reset_at <= NOW() THEN
        NEW.message_count := 0;
        NEW.message_count_reset_at := date_trunc('month', NOW() + INTERVAL '1 month');
    END IF;
    RETURN NEW;
END;
$$;

-- 2. increment_customer_message_count
CREATE OR REPLACE FUNCTION increment_customer_message_count(p_customer_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_new_count INTEGER;
BEGIN
    UPDATE customers
    SET message_count = message_count + 1
    WHERE id = p_customer_id
    RETURNING message_count INTO v_new_count;

    RETURN v_new_count;
END;
$$;

-- 3. update_product_total_stock
CREATE OR REPLACE FUNCTION update_product_total_stock()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  UPDATE products
  SET stock = (
    SELECT COALESCE(SUM(stock), 0)
    FROM product_variants
    WHERE product_id = NEW.product_id AND is_active = true
  )
  WHERE id = NEW.product_id;

  RETURN NEW;
END;
$$;

-- 4. update_webhook_jobs_updated_at
CREATE OR REPLACE FUNCTION update_webhook_jobs_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

-- 5. get_ai_metrics_summary
CREATE OR REPLACE FUNCTION get_ai_metrics_summary(
    p_shop_id UUID,
    p_days INTEGER DEFAULT 30
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    result JSON;
BEGIN
    SELECT json_build_object(
        'total_events', COUNT(*),
        'successful', COUNT(*) FILTER (WHERE success = true),
        'failed', COUNT(*) FILTER (WHERE success = false),
        'avg_response_time_ms', AVG(response_time_ms),
        'top_tools', (
            SELECT json_agg(row_to_json(t))
            FROM (
                SELECT tool_name, COUNT(*) as count
                FROM ai_analytics
                WHERE shop_id = p_shop_id
                AND created_at >= NOW() - (p_days || ' days')::INTERVAL
                AND tool_name IS NOT NULL
                GROUP BY tool_name
                ORDER BY count DESC
                LIMIT 5
            ) t
        )
    ) INTO result
    FROM ai_analytics
    WHERE shop_id = p_shop_id
    AND created_at >= NOW() - (p_days || ' days')::INTERVAL;

    RETURN result;
END;
$$;

-- ============================================
-- Fix rls_policy_always_true warnings
-- ============================================

-- 6. customer_complaints: Replace permissive "Allow all" with shop-scoped policy
DROP POLICY IF EXISTS "Allow all for service role" ON public.customer_complaints;

CREATE POLICY "complaints_select_own_shop" ON public.customer_complaints
    FOR SELECT
    USING (shop_id = get_user_shop_id());

CREATE POLICY "complaints_insert_own_shop" ON public.customer_complaints
    FOR INSERT
    WITH CHECK (shop_id = get_user_shop_id());

CREATE POLICY "complaints_update_own_shop" ON public.customer_complaints
    FOR UPDATE
    USING (shop_id = get_user_shop_id());

CREATE POLICY "complaints_delete_own_shop" ON public.customer_complaints
    FOR DELETE
    USING (shop_id = get_user_shop_id());

-- 7. feedback: Replace permissive INSERT policy with shop-scoped check
DROP POLICY IF EXISTS "Anyone can submit feedback" ON public.feedback;

CREATE POLICY "feedback_insert_with_shop" ON public.feedback
    FOR INSERT
    WITH CHECK (
        shop_id IS NULL
        OR shop_id = get_user_shop_id()
    );
