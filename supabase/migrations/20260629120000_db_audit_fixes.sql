-- ============================================================
-- DB AUDIT FIXES — 2026-06-29
-- ============================================================
-- Эх сурвалж: supabase/AUDIT-2026-06-29.md (олон-агент аудит, 40 баталгаажсан).
-- Хамрах:
--   1) Индексүүд (индексгүй FK + tenant filter/sort композит)
--   2) webhook_configs/webhook_logs дээр RLS асаах
--   3) Задгай USING(true)/PUBLIC RLS policy-уудыг shop-scope болгох
--   4) FOR ALL policy-уудад WITH CHECK нэмж бичих-талын tenant зөрчил хаах
--   5) storage 'property-images' bucket бичих policy-г shop-folder-оор хязгаарлах
--   6) SECURITY DEFINER функцүүдэд search_path тогтоох (defense-in-depth)
--   7) Давхардсан permissive SELECT policy цэвэрлэх
--   8) Хямд CHECK constraint (NOT VALID)
-- Тэмдэглэл: helper get_user_shop_id() (ганц) / get_user_shop_ids() (олон) хоёул
--   20260609120000-д тодорхойлогдсон. Migration нэг transaction-д ажилладаг тул
--   CREATE INDEX CONCURRENTLY БИШ — энэ хүснэгтүүдийн хэмжээнд plain index хурдан.

-- ------------------------------------------------------------
-- 1) ИНДЕКСҮҮД
-- ------------------------------------------------------------
-- property_contracts: tenant filter + default sort (GET /api/dashboard/contracts)
CREATE INDEX IF NOT EXISTS idx_prop_contracts_shop_date   ON property_contracts (shop_id, contract_date DESC);
CREATE INDEX IF NOT EXISTS idx_prop_contracts_shop_status ON property_contracts (shop_id, contract_status);

-- Индексгүй FK-ууд (parent устгах cascade/set-null-ыг дэмжих)
CREATE INDEX IF NOT EXISTS idx_ai_analytics_customer      ON ai_analytics (customer_id) WHERE customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_channel_contracts_channel  ON channel_contracts (channel_id);
CREATE INDEX IF NOT EXISTS idx_pending_messages_customer  ON pending_messages (customer_id);
CREATE INDEX IF NOT EXISTS idx_ai_conversations_shop      ON ai_conversations (shop_id);
CREATE INDEX IF NOT EXISTS idx_coa_parent                 ON chart_of_accounts (parent_id);
CREATE INDEX IF NOT EXISTS idx_fin_txn_account            ON finance_transactions (account_id);
CREATE INDEX IF NOT EXISTS idx_fin_txn_pay_sched          ON finance_transactions (payment_schedule_id);
CREATE INDEX IF NOT EXISTS idx_bill_lines_account         ON bill_lines (account_id);
CREATE INDEX IF NOT EXISTS idx_project_budgets_account    ON project_budgets (account_id);
CREATE INDEX IF NOT EXISTS idx_feedback_shop              ON feedback (shop_id);
CREATE INDEX IF NOT EXISTS idx_survey_responses_customer  ON survey_responses (customer_id) WHERE customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ab_results_shop            ON ab_experiment_results (shop_id);
CREATE INDEX IF NOT EXISTS idx_property_units_project     ON property_units (project_id) WHERE project_id IS NOT NULL;

-- ------------------------------------------------------------
-- 2) webhook хүснэгтүүдэд RLS асаах (cross-tenant secret задрахаас сэргийлэх)
--    App нь supabaseAdmin() = service_role-оор ханддаг тул эвдрэхгүй.
-- ------------------------------------------------------------
ALTER TABLE public.webhook_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_logs    ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS webhook_configs_shop ON public.webhook_configs;
CREATE POLICY webhook_configs_shop ON public.webhook_configs FOR ALL TO authenticated
  USING (shop_id IN (SELECT public.get_user_shop_ids()))
  WITH CHECK (shop_id IN (SELECT public.get_user_shop_ids()));
DROP POLICY IF EXISTS webhook_configs_service ON public.webhook_configs;
CREATE POLICY webhook_configs_service ON public.webhook_configs FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS webhook_logs_shop ON public.webhook_logs;
CREATE POLICY webhook_logs_shop ON public.webhook_logs FOR SELECT TO authenticated
  USING (shop_id IN (SELECT public.get_user_shop_ids()));
DROP POLICY IF EXISTS webhook_logs_service ON public.webhook_logs;
CREATE POLICY webhook_logs_service ON public.webhook_logs FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ------------------------------------------------------------
-- 3) Задгай USING(true) / PUBLIC policy-уудыг shop-scope болгох
-- ------------------------------------------------------------
-- 3a) user_roles: "Users can view own role" нь USING(true) → бүх дүр задарна.
--     (Бичих policy "Admins manage user_roles" нь 20260609130000-д аль хэдийн зассан.)
DROP POLICY IF EXISTS "Users can view own role" ON public.user_roles;
CREATE POLICY "Users can view own role" ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) OR public.is_active_admin());

-- 3b) projects: задгай SELECT policy устгах ("Admins can manage projects" ALL policy
--     SELECT-ийг shop-scope-оор аль хэдийн хамаарна).
DROP POLICY IF EXISTS "Authenticated users can view projects" ON public.projects;

-- 3c) marketing_channels & channel_contracts: SELECT USING(true) + scope-гүй бичилт.
--     (shop_id 20260608220000-д нэмэгдсэн.)
DO $$ DECLARE t TEXT; BEGIN
  FOREACH t IN ARRAY ARRAY['marketing_channels','channel_contracts'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Enable read access for all users" ON public.%I;', t);
    EXECUTE format('DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON public.%I;', t);
    EXECUTE format('DROP POLICY IF EXISTS "Enable update for authenticated users only" ON public.%I;', t);
    EXECUTE format('DROP POLICY IF EXISTS "Enable delete for authenticated users only" ON public.%I;', t);
    EXECUTE format('DROP POLICY IF EXISTS "%s_shop_access" ON public.%I;', t, t);
    EXECUTE format($f$CREATE POLICY "%s_shop_access" ON public.%I FOR ALL TO authenticated
        USING (shop_id IN (SELECT public.get_user_shop_ids()))
        WITH CHECK (shop_id IN (SELECT public.get_user_shop_ids()));$f$, t, t);
    EXECUTE format('DROP POLICY IF EXISTS "%s_service" ON public.%I;', t, t);
    EXECUTE format('CREATE POLICY "%s_service" ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true);', t, t);
  END LOOP; END $$;

-- 3d) Marketing 8 хүснэгт: "Service role full access" нь TO-гүй FOR ALL USING(true) =
--     PUBLIC. service_role-оор хязгаарлаж, authenticated-д shop-scoped policy нэмэх.
DO $$ DECLARE t TEXT; BEGIN
  FOREACH t IN ARRAY ARRAY['marketing_campaigns','social_posts','ad_campaigns','message_campaigns',
                           'content_calendar','brand_mentions','web_analytics','ai_agents'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Service role full access" ON public.%I;', t);
    EXECUTE format('DROP POLICY IF EXISTS "Users read own shop data" ON public.%I;', t);
    EXECUTE format('DROP POLICY IF EXISTS "%s_service" ON public.%I;', t, t);
    EXECUTE format('CREATE POLICY "%s_service" ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true);', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "%s_shop_access" ON public.%I;', t, t);
    EXECUTE format($f$CREATE POLICY "%s_shop_access" ON public.%I FOR ALL TO authenticated
        USING (shop_id IN (SELECT public.get_user_shop_ids()))
        WITH CHECK (shop_id IN (SELECT public.get_user_shop_ids()));$f$, t, t);
  END LOOP; END $$;

-- ------------------------------------------------------------
-- 4) FOR ALL shop-scoped policy-уудад WITH CHECK нэмэх
--    (USING-ийг яг хэвээр хадгална; service_role_all_* companion policy хэвээр).
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "shop_owners_manage_contracts" ON public.property_contracts;
CREATE POLICY "shop_owners_manage_contracts" ON public.property_contracts FOR ALL
  USING (shop_id = get_user_shop_id()) WITH CHECK (shop_id = get_user_shop_id());

DROP POLICY IF EXISTS "shop_owners_manage_units" ON public.property_units;
CREATE POLICY "shop_owners_manage_units" ON public.property_units FOR ALL
  USING (shop_id = get_user_shop_id()) WITH CHECK (shop_id = get_user_shop_id());

DROP POLICY IF EXISTS "shop_owners_manage_hubspot" ON public.hubspot_contacts;
CREATE POLICY "shop_owners_manage_hubspot" ON public.hubspot_contacts FOR ALL
  USING (shop_id = get_user_shop_id()) WITH CHECK (shop_id = get_user_shop_id());

DROP POLICY IF EXISTS "shop_owners_manage_ai_docs" ON public.ai_documents;
CREATE POLICY "shop_owners_manage_ai_docs" ON public.ai_documents FOR ALL
  USING (shop_id = get_user_shop_id()) WITH CHECK (shop_id = get_user_shop_id());

DROP POLICY IF EXISTS "shop_owners_manage_ai_kb" ON public.ai_knowledge_base;
CREATE POLICY "shop_owners_manage_ai_kb" ON public.ai_knowledge_base FOR ALL
  USING (shop_id = get_user_shop_id()) WITH CHECK (shop_id = get_user_shop_id());

-- shop_faqs / shop_quick_replies / shop_slogans (owner-based USING-ийг хэвээр + WITH CHECK)
DROP POLICY IF EXISTS "Users can manage own faqs" ON public.shop_faqs;
CREATE POLICY "Users can manage own faqs" ON public.shop_faqs FOR ALL
  USING (shop_id IN (SELECT id FROM shops WHERE user_id::text = auth.uid()::text))
  WITH CHECK (shop_id IN (SELECT id FROM shops WHERE user_id::text = auth.uid()::text));

DROP POLICY IF EXISTS "Users can manage own quick_replies" ON public.shop_quick_replies;
CREATE POLICY "Users can manage own quick_replies" ON public.shop_quick_replies FOR ALL
  USING (shop_id IN (SELECT id FROM shops WHERE user_id::text = auth.uid()::text))
  WITH CHECK (shop_id IN (SELECT id FROM shops WHERE user_id::text = auth.uid()::text));

DROP POLICY IF EXISTS "Users can manage own slogans" ON public.shop_slogans;
CREATE POLICY "Users can manage own slogans" ON public.shop_slogans FOR ALL
  USING (shop_id IN (SELECT id FROM shops WHERE user_id::text = auth.uid()::text))
  WITH CHECK (shop_id IN (SELECT id FROM shops WHERE user_id::text = auth.uid()::text));

-- ------------------------------------------------------------
-- 5) Storage 'property-images' bucket: бичих policy-г shop-folder-оор хязгаарлах.
--    Зам нь '<shop.id>/<property_id>/<uuid>.<ext>' (properties/upload/route.ts).
--    App нь service_role-оор upload хийдэг тул эвдрэхгүй; энэ нь browser-direct
--    cross-tenant бичилтийг хаана. Public download нь public bucket-ээр ажиллана.
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "Property Images Authenticated Upload" ON storage.objects;
CREATE POLICY "Property Images Authenticated Upload" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'property-images'
    AND (storage.foldername(name))[1] IN (SELECT sid::text FROM public.get_user_shop_ids() AS gs(sid)));

DROP POLICY IF EXISTS "Property Images Authenticated Update" ON storage.objects;
CREATE POLICY "Property Images Authenticated Update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'property-images'
    AND (storage.foldername(name))[1] IN (SELECT sid::text FROM public.get_user_shop_ids() AS gs(sid)));

DROP POLICY IF EXISTS "Property Images Authenticated Delete" ON storage.objects;
CREATE POLICY "Property Images Authenticated Delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'property-images'
    AND (storage.foldername(name))[1] IN (SELECT sid::text FROM public.get_user_shop_ids() AS gs(sid)));

-- ------------------------------------------------------------
-- 6) SECURITY DEFINER функцүүдэд search_path тогтоох (defense-in-depth;
--    EXECUTE нь 20260609130000-д anon/authenticated-аас аль хэдийн хасагдсан).
-- ------------------------------------------------------------
DO $$ BEGIN ALTER FUNCTION public.handle_new_user()                    SET search_path = public, pg_temp; EXCEPTION WHEN undefined_function THEN NULL; END $$;
DO $$ BEGIN ALTER FUNCTION public.handle_new_admin()                   SET search_path = public, pg_temp; EXCEPTION WHEN undefined_function THEN NULL; END $$;
DO $$ BEGIN ALTER FUNCTION public.archive_old_chat_history(integer)    SET search_path = public, pg_temp; EXCEPTION WHEN undefined_function THEN NULL; END $$;
DO $$ BEGIN ALTER FUNCTION public.purge_archived_chat_history(integer) SET search_path = public, pg_temp; EXCEPTION WHEN undefined_function THEN NULL; END $$;
DO $$ BEGIN ALTER FUNCTION public.cleanup_expired_ai_memory(integer)   SET search_path = public, pg_temp; EXCEPTION WHEN undefined_function THEN NULL; END $$;

-- ------------------------------------------------------------
-- 7) Давхардсан permissive SELECT policy цэвэрлэх (гүйцэтгэл; security биш).
--    008-era helper policy үлдэх тул RLS уншилт хэвээр ажиллана.
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "Users can view own customers" ON public.customers;
DROP POLICY IF EXISTS "Users can view own chats" ON public.chat_history;

-- ------------------------------------------------------------
-- 8) Хямд CHECK constraint (NOT VALID — одоо байгаа мөрийг шалгахгүй).
-- ------------------------------------------------------------
ALTER TABLE public.ai_attachments DROP CONSTRAINT IF EXISTS chk_ai_attachments_entity_type;
ALTER TABLE public.ai_attachments
  ADD CONSTRAINT chk_ai_attachments_entity_type
  CHECK (entity_type IN ('property','lead','customer','contract')) NOT VALID;

ALTER TABLE public.property_viewings DROP CONSTRAINT IF EXISTS chk_viewing_interest;
ALTER TABLE public.property_viewings
  ADD CONSTRAINT chk_viewing_interest
  CHECK (interest_level IS NULL OR interest_level BETWEEN 1 AND 5) NOT VALID;
