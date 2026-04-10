-- ============================================
-- Fix auth_rls_initplan + multiple_permissive_policies
-- 1) Drop redundant service_role_all_* policies (service_role bypasses RLS by default)
-- 2) Wrap auth.uid()/auth.role() in (select ...) for performance
-- 3) Scope FOR ALL admin policies to 'authenticated' role to avoid overlap
-- ============================================

-- ============================================
-- PART 1: Drop redundant service_role policies
-- Service role ALWAYS bypasses RLS, so these are unnecessary
-- and cause multiple_permissive_policies warnings
-- ============================================

DROP POLICY IF EXISTS "service_role_all_email_logs" ON public.email_logs;
DROP POLICY IF EXISTS "service_role_all_payments" ON public.payments;
DROP POLICY IF EXISTS "service_role_all_push_subscriptions" ON public.push_subscriptions;
DROP POLICY IF EXISTS "service_role_all_usage_summary" ON public.usage_summary;
DROP POLICY IF EXISTS "push_subscriptions_service_role" ON public.push_subscriptions;

-- ============================================
-- PART 2: Fix auth_rls_initplan - Recreate policies
-- with (select auth.uid()) instead of auth.uid()
-- ============================================

-- --- ai_analytics ---
DROP POLICY IF EXISTS "Shop owners can view their analytics" ON public.ai_analytics;
CREATE POLICY "Shop owners can view their analytics"
    ON public.ai_analytics FOR SELECT
    USING (shop_id IN (SELECT id FROM shops WHERE user_id = (select auth.uid())::text));

DROP POLICY IF EXISTS "Authenticated users can insert analytics" ON public.ai_analytics;
CREATE POLICY "Authenticated users can insert analytics"
    ON public.ai_analytics FOR INSERT
    WITH CHECK ((select auth.uid()) IS NOT NULL);

-- --- conversion_funnel ---
DROP POLICY IF EXISTS "Shop owners can view their funnel data" ON public.conversion_funnel;
CREATE POLICY "Shop owners can view their funnel data"
    ON public.conversion_funnel FOR SELECT
    USING (shop_id IN (SELECT id FROM shops WHERE user_id = (select auth.uid())::text));

DROP POLICY IF EXISTS "Authenticated users can insert funnel data" ON public.conversion_funnel;
CREATE POLICY "Authenticated users can insert funnel data"
    ON public.conversion_funnel FOR INSERT
    WITH CHECK ((select auth.uid()) IS NOT NULL);

-- --- ab_experiment_results ---
DROP POLICY IF EXISTS "Shop owners can view experiment results" ON public.ab_experiment_results;
CREATE POLICY "Shop owners can view experiment results"
    ON public.ab_experiment_results FOR SELECT
    USING (shop_id IN (SELECT id FROM shops WHERE user_id = (select auth.uid())::text));

DROP POLICY IF EXISTS "Authenticated users can insert experiment results" ON public.ab_experiment_results;
CREATE POLICY "Authenticated users can insert experiment results"
    ON public.ab_experiment_results FOR INSERT
    WITH CHECK ((select auth.uid()) IS NOT NULL);

-- --- discount_schedules ---
DROP POLICY IF EXISTS "Shop owners can manage discounts" ON public.discount_schedules;
CREATE POLICY "Shop owners can manage discounts"
    ON public.discount_schedules FOR ALL
    USING (product_id IN (
        SELECT p.id FROM products p
        JOIN shops s ON p.shop_id = s.id
        WHERE s.user_id = (select auth.uid())::text
    ));

-- --- landing_content ---
DROP POLICY IF EXISTS "Service role can manage landing content" ON public.landing_content;
CREATE POLICY "Service role can manage landing content"
    ON public.landing_content FOR ALL
    TO service_role
    USING (true);

-- --- feedback ---
DROP POLICY IF EXISTS "Admins can read feedback" ON public.feedback;
CREATE POLICY "Admins can read feedback" ON public.feedback
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM admins
            WHERE admins.user_id::text = (select auth.uid())::text
        )
    );

DROP POLICY IF EXISTS "Admins can update feedback" ON public.feedback;
CREATE POLICY "Admins can update feedback" ON public.feedback
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM admins
            WHERE admins.user_id::text = (select auth.uid())::text
        )
    );

-- --- push_subscriptions ---
DROP POLICY IF EXISTS "Users can manage own subscriptions" ON public.push_subscriptions;
CREATE POLICY "Users can manage own subscriptions" ON public.push_subscriptions
    FOR ALL
    TO authenticated
    USING (
        shop_id IN (SELECT id FROM shops WHERE user_id = (select auth.uid())::text)
    );

-- --- shops ---
DROP POLICY IF EXISTS "Users can view own shops" ON public.shops;
CREATE POLICY "Users can view own shops" ON public.shops
    FOR SELECT USING (user_id = (select auth.uid())::text);

DROP POLICY IF EXISTS "Users can create shops" ON public.shops;
CREATE POLICY "Users can create shops" ON public.shops
    FOR INSERT WITH CHECK (user_id = (select auth.uid())::text);

DROP POLICY IF EXISTS "Users can update own shops" ON public.shops;
CREATE POLICY "Users can update own shops" ON public.shops
    FOR UPDATE USING (user_id = (select auth.uid())::text);

-- --- shop_faqs ---
DROP POLICY IF EXISTS "Users can manage own faqs" ON public.shop_faqs;
CREATE POLICY "Users can manage own faqs" ON public.shop_faqs
    FOR ALL USING (
        shop_id IN (SELECT id FROM shops WHERE user_id = (select auth.uid())::text)
    );

-- --- shop_quick_replies ---
DROP POLICY IF EXISTS "Users can manage own quick_replies" ON public.shop_quick_replies;
CREATE POLICY "Users can manage own quick_replies" ON public.shop_quick_replies
    FOR ALL USING (
        shop_id IN (SELECT id FROM shops WHERE user_id = (select auth.uid())::text)
    );

-- --- shop_slogans ---
DROP POLICY IF EXISTS "Users can manage own slogans" ON public.shop_slogans;
CREATE POLICY "Users can manage own slogans" ON public.shop_slogans
    FOR ALL USING (
        shop_id IN (SELECT id FROM shops WHERE user_id = (select auth.uid())::text)
    );

-- --- ai_conversations ---
DROP POLICY IF EXISTS "Users can manage own conversations" ON public.ai_conversations;
CREATE POLICY "Users can manage own conversations" ON public.ai_conversations
    FOR ALL USING (
        shop_id IN (SELECT id FROM shops WHERE user_id = (select auth.uid())::text)
    );

-- --- usage_summary ---
DROP POLICY IF EXISTS "Allow read usage_summary" ON public.usage_summary;
CREATE POLICY "Allow read usage_summary" ON public.usage_summary
    FOR SELECT USING (
        shop_id IN (SELECT id FROM shops WHERE user_id = (select auth.uid())::text)
    );

-- --- carts ---
DROP POLICY IF EXISTS "Users can manage own shop carts" ON public.carts;
CREATE POLICY "Users can manage own shop carts" ON public.carts
    FOR ALL USING (
        shop_id IN (SELECT id FROM shops WHERE user_id = (select auth.uid())::text)
    );

-- --- cart_items ---
DROP POLICY IF EXISTS "Users can manage cart items through cart" ON public.cart_items;
CREATE POLICY "Users can manage cart items through cart" ON public.cart_items
    FOR ALL USING (
        cart_id IN (
            SELECT c.id FROM carts c
            JOIN shops s ON c.shop_id = s.id
            WHERE s.user_id = (select auth.uid())::text
        )
    );

-- --- ai_question_stats ---
DROP POLICY IF EXISTS "Users can manage own stats" ON public.ai_question_stats;
CREATE POLICY "Users can manage own stats" ON public.ai_question_stats
    FOR ALL USING (
        shop_id IN (SELECT id FROM shops WHERE user_id = (select auth.uid())::text)
    );

-- --- webhook_jobs ---
DROP POLICY IF EXISTS "Service role only" ON public.webhook_jobs;
CREATE POLICY "Service role only" ON public.webhook_jobs
    FOR ALL
    TO service_role
    USING (true);

-- ============================================
-- PART 3: Fix admins/plans/subscriptions/invoices/usage_logs
-- Scope FOR ALL policies to 'authenticated' to prevent overlap with anon
-- Also wrap auth.uid() in (select ...)
-- ============================================

-- --- admins ---
DROP POLICY IF EXISTS "Admins can view admins" ON public.admins;
DROP POLICY IF EXISTS "Super admins can manage admins" ON public.admins;

CREATE POLICY "Admins can view admins"
    ON public.admins FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.admins a
            WHERE a.user_id::text = (select auth.uid())::text
            AND a.is_active = true
        )
    );

CREATE POLICY "Super admins can manage admins"
    ON public.admins FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.admins
            WHERE user_id::text = (select auth.uid())::text
            AND role = 'super_admin'
            AND is_active = true
        )
    );

-- --- plans ---
DROP POLICY IF EXISTS "Plans are viewable by everyone" ON public.plans;
DROP POLICY IF EXISTS "Admins can manage plans" ON public.plans;

CREATE POLICY "Plans are viewable by everyone"
    ON public.plans FOR SELECT
    USING (is_active = true);

CREATE POLICY "Admins can manage plans"
    ON public.plans FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.admins
            WHERE user_id::text = (select auth.uid())::text
            AND is_active = true
        )
    );

-- --- subscriptions ---
DROP POLICY IF EXISTS "Users can view own subscription" ON public.subscriptions;
DROP POLICY IF EXISTS "Admins can manage subscriptions" ON public.subscriptions;

CREATE POLICY "Users can view own subscription"
    ON public.subscriptions FOR SELECT
    TO authenticated
    USING (
        shop_id IN (
            SELECT id FROM public.shops WHERE user_id = (select auth.uid())::text
        )
    );

CREATE POLICY "Admins can manage subscriptions"
    ON public.subscriptions FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.admins
            WHERE user_id::text = (select auth.uid())::text
            AND is_active = true
        )
    );

-- --- invoices ---
DROP POLICY IF EXISTS "Users can view own invoices" ON public.invoices;
DROP POLICY IF EXISTS "Admins can manage invoices" ON public.invoices;

CREATE POLICY "Users can view own invoices"
    ON public.invoices FOR SELECT
    TO authenticated
    USING (
        shop_id IN (
            SELECT id FROM public.shops WHERE user_id = (select auth.uid())::text
        )
    );

CREATE POLICY "Admins can manage invoices"
    ON public.invoices FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.admins
            WHERE user_id::text = (select auth.uid())::text
            AND is_active = true
        )
    );

-- --- usage_logs ---
DROP POLICY IF EXISTS "Users can view own usage" ON public.usage_logs;
CREATE POLICY "Users can view own usage"
    ON public.usage_logs FOR SELECT
    TO authenticated
    USING (
        shop_id IN (
            SELECT id FROM public.shops WHERE user_id = (select auth.uid())::text
        )
    );
