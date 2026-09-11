-- ============================================================
-- 2026-09-11 Wave 2: хуучин Syncly e-commerce / SaaS объектуудыг устгана
-- (docs/REVIEW-2026-09-11.md §4 «Legacy e-commerce үлдэгдэл», CLAUDE.md «Recently Removed»).
--
-- Устгахын өмнө шалгасан (2026-09-11, prod):
--   • src/ дотор эдгээр хүснэгт/функцийг уншдаг код 0 (grep .from()/.rpc())
--   • Мөрийн тоо: products 5 (JSON backup: supabase/backups/2026-09-11-legacy/), бусад бүгд 0
--   • Бусад хүснэгтээс эдгээр рүү FK байхгүй; хамааралтай view: lead_funnel, customer_service_dashboard (код уншдаггүй)
--   • Триггер: update_customer_on_order (orders дээр) — хүснэгттэйгээ хамт устна
-- ============================================================

DROP VIEW IF EXISTS public.lead_funnel;
DROP VIEW IF EXISTS public.customer_service_dashboard;

DROP TABLE IF EXISTS public.order_items CASCADE;
DROP TABLE IF EXISTS public.orders CASCADE;
DROP TABLE IF EXISTS public.products CASCADE;
DROP TABLE IF EXISTS public.discount_schedules CASCADE;
DROP TABLE IF EXISTS public.pending_messages CASCADE;
DROP TABLE IF EXISTS public.ai_documents CASCADE;
DROP TABLE IF EXISTS public.ai_agents CASCADE;
DROP TABLE IF EXISTS public.satisfaction_surveys CASCADE;
DROP TABLE IF EXISTS public.email_logs CASCADE;
DROP TABLE IF EXISTS public.facebook_tokens CASCADE;
DROP TABLE IF EXISTS public.user_facebook_pages CASCADE;
DROP TABLE IF EXISTS public.hubspot_contacts CASCADE;
DROP TABLE IF EXISTS public.ai_analytics CASCADE;
DROP TABLE IF EXISTS public.conversion_funnel CASCADE;
DROP TABLE IF EXISTS public.ab_experiment_results CASCADE;
DROP TABLE IF EXISTS public.ab_experiments CASCADE;

-- Устгагдсан хүснэгт/багана руу заадаг, кодоос дуудагддаггүй функцууд (pg_proc signature-аар)
DROP FUNCTION IF EXISTS public.update_customer_stats() CASCADE;
DROP FUNCTION IF EXISTS public.update_customer_stats_manual(uuid, numeric) CASCADE;
DROP FUNCTION IF EXISTS public.auto_tag_vip_customer() CASCADE;
DROP FUNCTION IF EXISTS public.cleanup_expired_ai_memory(integer) CASCADE;
DROP FUNCTION IF EXISTS public.cleanup_processed_messages() CASCADE;
DROP FUNCTION IF EXISTS public.decrement_product_stock(uuid, integer) CASCADE;
DROP FUNCTION IF EXISTS public.get_ai_metrics_summary(uuid, integer) CASCADE;
DROP FUNCTION IF EXISTS public.match_ai_documents(vector, double precision, integer, uuid) CASCADE;
DROP FUNCTION IF EXISTS public.update_shop_ai_stats(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.check_admin_user(text) CASCADE;
DROP FUNCTION IF EXISTS public.increment_question_stat(uuid, text, character varying) CASCADE;

-- Хуучин enum-ууд (хүснэгт устсаны дараа ашиглагдахгүй бол)
DROP TYPE IF EXISTS public.order_status;
DROP TYPE IF EXISTS public.ai_emotion;
