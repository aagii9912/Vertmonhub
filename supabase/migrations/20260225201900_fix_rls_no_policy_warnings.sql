-- ============================================
-- Fix rls_enabled_no_policy warnings
-- Re-apply policies that may have failed + add partition policies
-- ============================================

-- ============================================
-- 1. ADMINS - Re-create policies (DROP IF EXISTS first)
-- ============================================
DROP POLICY IF EXISTS "Admins can view admins" ON public.admins;
DROP POLICY IF EXISTS "Super admins can manage admins" ON public.admins;

CREATE POLICY "Admins can view admins"
    ON public.admins FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.admins a
            WHERE a.user_id::text = auth.uid()::text
            AND a.is_active = true
        )
    );

CREATE POLICY "Super admins can manage admins"
    ON public.admins FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.admins
            WHERE user_id::text = auth.uid()::text
            AND role = 'super_admin'
            AND is_active = true
        )
    );

-- ============================================
-- 2. PLANS - Re-create policies
-- ============================================
DROP POLICY IF EXISTS "Plans are viewable by everyone" ON public.plans;
DROP POLICY IF EXISTS "Admins can manage plans" ON public.plans;

CREATE POLICY "Plans are viewable by everyone"
    ON public.plans FOR SELECT
    USING (is_active = true);

CREATE POLICY "Admins can manage plans"
    ON public.plans FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.admins
            WHERE user_id::text = auth.uid()::text
            AND is_active = true
        )
    );

-- ============================================
-- 3. SUBSCRIPTIONS - Re-create policies
-- ============================================
DROP POLICY IF EXISTS "Users can view own subscription" ON public.subscriptions;
DROP POLICY IF EXISTS "Admins can manage subscriptions" ON public.subscriptions;

CREATE POLICY "Users can view own subscription"
    ON public.subscriptions FOR SELECT
    USING (
        shop_id IN (
            SELECT id FROM public.shops WHERE user_id = auth.uid()::text
        )
    );

CREATE POLICY "Admins can manage subscriptions"
    ON public.subscriptions FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.admins
            WHERE user_id::text = auth.uid()::text
            AND is_active = true
        )
    );

-- ============================================
-- 4. INVOICES - Re-create policies
-- ============================================
DROP POLICY IF EXISTS "Users can view own invoices" ON public.invoices;
DROP POLICY IF EXISTS "Admins can manage invoices" ON public.invoices;

CREATE POLICY "Users can view own invoices"
    ON public.invoices FOR SELECT
    USING (
        shop_id IN (
            SELECT id FROM public.shops WHERE user_id = auth.uid()::text
        )
    );

CREATE POLICY "Admins can manage invoices"
    ON public.invoices FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.admins
            WHERE user_id::text = auth.uid()::text
            AND is_active = true
        )
    );

-- ============================================
-- 5. USAGE_LOGS - Re-create policies
-- ============================================
DROP POLICY IF EXISTS "Users can view own usage" ON public.usage_logs;
DROP POLICY IF EXISTS "System can insert usage" ON public.usage_logs;

CREATE POLICY "Users can view own usage"
    ON public.usage_logs FOR SELECT
    USING (
        shop_id IN (
            SELECT id FROM public.shops WHERE user_id = auth.uid()::text
        )
    );

CREATE POLICY "System can insert usage"
    ON public.usage_logs FOR INSERT
    WITH CHECK (true);

-- ============================================
-- 6. CHAT_HISTORY PARTITIONS - Inherit parent policies
-- PostgreSQL partitions do NOT auto-inherit RLS policies
-- ============================================

CREATE POLICY "chat_history_part_select" ON public.chat_history_2026_01
    FOR SELECT USING (shop_id = get_user_shop_id());
CREATE POLICY "chat_history_part_insert" ON public.chat_history_2026_01
    FOR INSERT WITH CHECK (shop_id = get_user_shop_id());
CREATE POLICY "chat_history_part_update" ON public.chat_history_2026_01
    FOR UPDATE USING (shop_id = get_user_shop_id());
CREATE POLICY "chat_history_part_delete" ON public.chat_history_2026_01
    FOR DELETE USING (shop_id = get_user_shop_id());

CREATE POLICY "chat_history_part_select" ON public.chat_history_2026_02
    FOR SELECT USING (shop_id = get_user_shop_id());
CREATE POLICY "chat_history_part_insert" ON public.chat_history_2026_02
    FOR INSERT WITH CHECK (shop_id = get_user_shop_id());
CREATE POLICY "chat_history_part_update" ON public.chat_history_2026_02
    FOR UPDATE USING (shop_id = get_user_shop_id());
CREATE POLICY "chat_history_part_delete" ON public.chat_history_2026_02
    FOR DELETE USING (shop_id = get_user_shop_id());

CREATE POLICY "chat_history_part_select" ON public.chat_history_2026_03
    FOR SELECT USING (shop_id = get_user_shop_id());
CREATE POLICY "chat_history_part_insert" ON public.chat_history_2026_03
    FOR INSERT WITH CHECK (shop_id = get_user_shop_id());
CREATE POLICY "chat_history_part_update" ON public.chat_history_2026_03
    FOR UPDATE USING (shop_id = get_user_shop_id());
CREATE POLICY "chat_history_part_delete" ON public.chat_history_2026_03
    FOR DELETE USING (shop_id = get_user_shop_id());

CREATE POLICY "chat_history_part_select" ON public.chat_history_2026_04
    FOR SELECT USING (shop_id = get_user_shop_id());
CREATE POLICY "chat_history_part_insert" ON public.chat_history_2026_04
    FOR INSERT WITH CHECK (shop_id = get_user_shop_id());
CREATE POLICY "chat_history_part_update" ON public.chat_history_2026_04
    FOR UPDATE USING (shop_id = get_user_shop_id());
CREATE POLICY "chat_history_part_delete" ON public.chat_history_2026_04
    FOR DELETE USING (shop_id = get_user_shop_id());

CREATE POLICY "chat_history_part_select" ON public.chat_history_2026_05
    FOR SELECT USING (shop_id = get_user_shop_id());
CREATE POLICY "chat_history_part_insert" ON public.chat_history_2026_05
    FOR INSERT WITH CHECK (shop_id = get_user_shop_id());
CREATE POLICY "chat_history_part_update" ON public.chat_history_2026_05
    FOR UPDATE USING (shop_id = get_user_shop_id());
CREATE POLICY "chat_history_part_delete" ON public.chat_history_2026_05
    FOR DELETE USING (shop_id = get_user_shop_id());

CREATE POLICY "chat_history_part_select" ON public.chat_history_2026_06
    FOR SELECT USING (shop_id = get_user_shop_id());
CREATE POLICY "chat_history_part_insert" ON public.chat_history_2026_06
    FOR INSERT WITH CHECK (shop_id = get_user_shop_id());
CREATE POLICY "chat_history_part_update" ON public.chat_history_2026_06
    FOR UPDATE USING (shop_id = get_user_shop_id());
CREATE POLICY "chat_history_part_delete" ON public.chat_history_2026_06
    FOR DELETE USING (shop_id = get_user_shop_id());
