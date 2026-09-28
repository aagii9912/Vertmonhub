-- Browser reads remain RLS-scoped; business writes go through authenticated,
-- module/operation-gated APIs using service_role. Deploy the companion API
-- changes first (surveys and marketing channels/contracts previously wrote
-- with a user client). No business rows or role assignments are changed here.

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.has_any_module(requested_modules text[])
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT auth.uid() IS NOT NULL AND (
        EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'super_admin')
        OR EXISTS (
            SELECT 1 FROM public.roles r
            JOIN public.role_permissions rp ON rp.role_id = r.id
            WHERE r.name = COALESCE((SELECT role FROM public.user_roles WHERE user_id = auth.uid()), 'viewer')
              AND rp.module = ANY(requested_modules)
        )
    );
$$;
REVOKE ALL ON FUNCTION private.has_any_module(text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.has_any_module(text[]) TO authenticated, service_role;

-- No authenticated user (including an application super_admin) edits roles,
-- shop membership, storage or business rows directly. Server APIs retain their
-- existing super_admin authorization, validation and tenant checks.
-- Personal tasks/preferences/profile edits retain their existing self RLS.
DO $$
DECLARE t record;
BEGIN
    FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public'
    LOOP
        EXECUTE format('REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE public.%I FROM PUBLIC, anon, authenticated', t.tablename);
        IF t.tablename NOT IN ('user_tasks', 'user_dashboard_prefs', 'user_profiles') THEN
            EXECUTE format('REVOKE INSERT, UPDATE, DELETE ON TABLE public.%I FROM PUBLIC, anon, authenticated', t.tablename);
        END IF;
    END LOOP;
END $$;

-- A shop owner with a restricted application role must not retrieve integration
-- tokens through PostgREST. Keep only identity columns needed by self RLS reads.
REVOKE SELECT ON public.shops FROM PUBLIC, anon, authenticated;
DO $$
DECLARE columns text;
BEGIN
    SELECT string_agg(quote_ident(column_name), ', ') INTO columns
    FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'shops'
      AND column_name = ANY(ARRAY['id', 'user_id', 'name', 'owner_name', 'is_active', 'setup_completed', 'created_at']);
    EXECUTE format('GRANT SELECT (%s) ON public.shops TO authenticated', columns);
END $$;

-- Restrictive policies AND with all old permissive policies. Existing owner,
-- member and self scopes still apply, but no old FOR ALL policy bypasses RBAC.
DO $$
DECLARE t record;
BEGIN
    FOR t IN SELECT * FROM (VALUES
        ('leads', ARRAY['leads']), ('lead_activities', ARRAY['leads']),
        ('properties', ARRAY['properties']), ('property_units', ARRAY['properties']),
        ('property_viewings', ARRAY['viewings']),
        ('property_contracts', ARRAY['contracts']), ('payment_schedules', ARRAY['contracts']),
        ('customers', ARRAY['customers']), ('handover_records', ARRAY['customers']),
        ('chat_history', ARRAY['inbox']), ('service_logs', ARRAY['customer-service']),
        ('surveys', ARRAY['surveys']), ('survey_responses', ARRAY['surveys']),
        ('ad_campaigns', ARRAY['marketing-roi']), ('brand_mentions', ARRAY['marketing-roi']),
        ('channel_contracts', ARRAY['marketing-roi']), ('content_calendar', ARRAY['marketing-roi']),
        ('market_indicators', ARRAY['marketing-roi']), ('marketing_budgets', ARRAY['marketing-roi']),
        ('marketing_campaigns', ARRAY['marketing-roi']), ('marketing_channels', ARRAY['marketing-roi']),
        ('marketing_spend_entries', ARRAY['marketing-roi']), ('marketing_targets', ARRAY['marketing-roi']),
        ('message_campaigns', ARRAY['marketing-roi']), ('social_posts', ARRAY['marketing-roi']),
        ('social_insights', ARRAY['marketing-roi']), ('web_analytics', ARRAY['marketing-roi']),
        ('meta_daily_spend', ARRAY['marketing-roi']), ('meta_spend_coverage', ARRAY['marketing-roi']),
        ('meta_spend_sync', ARRAY['marketing-roi']), ('lead_attribution_events', ARRAY['marketing-roi', 'leads']),
        ('ai_conversations', ARRAY['ai-assistant']), ('ai_shop_memory', ARRAY['ai-assistant']),
        ('ai_question_stats', ARRAY['ai-settings']), ('ai_knowledge_base', ARRAY['ai-settings', 'marketing-roi']),
        ('shop_faqs', ARRAY['ai-settings']), ('shop_quick_replies', ARRAY['ai-settings']),
        ('shop_slogans', ARRAY['ai-settings']),
        ('projects', ARRAY['finance', 'marketing-roi', 'properties', 'leads', 'contracts']),
        ('sales_managers', ARRAY['dashboard', 'reports', 'leads']),
        ('team_sales_targets', ARRAY['dashboard', 'reports']),
        ('finance_transactions', ARRAY['finance']), ('chart_of_accounts', ARRAY['finance']),
        ('project_budgets', ARRAY['finance']), ('finance_audit_log', ARRAY['finance']),
        ('vendor_bills', ARRAY['procurement']), ('vendors', ARRAY['procurement']),
        ('erp_imports', ARRAY['erp-imports']), ('newsletters', ARRAY['marketing-roi']),
        ('newsletter_settings', ARRAY['marketing-roi'])
    ) AS mapping(table_name, modules)
    LOOP
        IF to_regclass(format('public.%I', t.table_name)) IS NOT NULL THEN
            EXECUTE format('DROP POLICY IF EXISTS rbac_module_read ON public.%I', t.table_name);
            EXECUTE format('CREATE POLICY rbac_module_read ON public.%I AS RESTRICTIVE FOR SELECT TO authenticated USING ((SELECT private.has_any_module(%L::text[])) AND shop_id IN (SELECT public.get_user_shop_ids()))', t.table_name, t.modules);
        END IF;
    END LOOP;
END $$;

DROP POLICY IF EXISTS rbac_role_read ON public.user_roles;
CREATE POLICY rbac_role_read ON public.user_roles AS RESTRICTIVE FOR SELECT TO authenticated
    USING (user_id = (SELECT auth.uid()) OR (SELECT private.has_any_module(ARRAY[]::text[])));

DROP POLICY IF EXISTS rbac_module_read ON public.ai_messages;
CREATE POLICY rbac_module_read ON public.ai_messages AS RESTRICTIVE FOR SELECT TO authenticated
    USING ((SELECT private.has_any_module(ARRAY['ai-assistant'])));

DROP POLICY IF EXISTS rbac_attachment_read ON public.ai_attachments;
CREATE POLICY rbac_attachment_read ON public.ai_attachments AS RESTRICTIVE FOR SELECT TO authenticated
    USING (private.has_any_module(CASE entity_type
        WHEN 'property' THEN ARRAY['properties'] WHEN 'lead' THEN ARRAY['leads']
        WHEN 'customer' THEN ARRAY['customers'] WHEN 'contract' THEN ARRAY['contracts']
        ELSE ARRAY[]::text[] END)
        AND shop_id IN (SELECT public.get_user_shop_ids()));

-- Public image URLs keep working. Mutations in these app buckets are server-only;
-- restrictive policies also block unexpected legacy permissive storage policies.
REVOKE TRUNCATE, REFERENCES, TRIGGER ON storage.objects FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS rbac_app_bucket_insert ON storage.objects;
CREATE POLICY rbac_app_bucket_insert ON storage.objects AS RESTRICTIVE FOR INSERT TO anon, authenticated
    WITH CHECK (bucket_id NOT IN ('products', 'property-images'));
DROP POLICY IF EXISTS rbac_app_bucket_update ON storage.objects;
CREATE POLICY rbac_app_bucket_update ON storage.objects AS RESTRICTIVE FOR UPDATE TO anon, authenticated
    USING (bucket_id NOT IN ('products', 'property-images'))
    WITH CHECK (bucket_id NOT IN ('products', 'property-images'));
DROP POLICY IF EXISTS rbac_app_bucket_delete ON storage.objects;
CREATE POLICY rbac_app_bucket_delete ON storage.objects AS RESTRICTIVE FOR DELETE TO anon, authenticated
    USING (bucket_id NOT IN ('products', 'property-images'));

NOTIFY pgrst, 'reload schema';
