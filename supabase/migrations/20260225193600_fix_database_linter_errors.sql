DO $$ BEGIN RAISE NOTICE 'Fix linter errors: security_definer_view, rls_disabled_in_public, sensitive_columns_exposed'; END $$;

-- 1. Fix SECURITY DEFINER views to use SECURITY INVOKER
ALTER VIEW IF EXISTS public.index_usage_stats SET (security_invoker = on);
ALTER VIEW IF EXISTS public.table_stats SET (security_invoker = on);

-- 2. Fix missing RLS on chat_history partitions
ALTER TABLE IF EXISTS public.chat_history_2026_01 ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.chat_history_2026_02 ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.chat_history_2026_03 ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.chat_history_2026_04 ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.chat_history_2026_05 ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.chat_history_2026_06 ENABLE ROW LEVEL SECURITY;

-- 3. Fix missing RLS on pending_messages (also fixes sensitive_columns_exposed for access_token)
ALTER TABLE IF EXISTS public.pending_messages ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    CREATE POLICY "pending_messages_select_own_shop" ON public.pending_messages
        FOR SELECT
        USING (shop_id = get_user_shop_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE POLICY "pending_messages_insert_own_shop" ON public.pending_messages
        FOR INSERT
        WITH CHECK (shop_id = get_user_shop_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE POLICY "pending_messages_update_own_shop" ON public.pending_messages
        FOR UPDATE
        USING (shop_id = get_user_shop_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE POLICY "pending_messages_delete_own_shop" ON public.pending_messages
        FOR DELETE
        USING (shop_id = get_user_shop_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 4. Fix missing RLS on product_variants
ALTER TABLE IF EXISTS public.product_variants ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    CREATE POLICY "product_variants_select_own_shop" ON public.product_variants
        FOR SELECT
        USING (
            EXISTS (
                SELECT 1 FROM public.products p
                WHERE p.id = product_variants.product_id 
                AND p.shop_id = get_user_shop_id()
            )
        );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE POLICY "product_variants_insert_own_shop" ON public.product_variants
        FOR INSERT
        WITH CHECK (
            EXISTS (
                SELECT 1 FROM public.products p
                WHERE p.id = product_variants.product_id 
                AND p.shop_id = get_user_shop_id()
            )
        );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE POLICY "product_variants_update_own_shop" ON public.product_variants
        FOR UPDATE
        USING (
            EXISTS (
                SELECT 1 FROM public.products p
                WHERE p.id = product_variants.product_id 
                AND p.shop_id = get_user_shop_id()
            )
        );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE POLICY "product_variants_delete_own_shop" ON public.product_variants
        FOR DELETE
        USING (
            EXISTS (
                SELECT 1 FROM public.products p
                WHERE p.id = product_variants.product_id 
                AND p.shop_id = get_user_shop_id()
            )
        );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
