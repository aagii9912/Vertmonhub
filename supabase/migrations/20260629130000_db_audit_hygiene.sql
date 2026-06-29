-- ============================================================
-- DB AUDIT HYGIENE — 2026-06-29 (non-destructive, auto-applicable)
-- ============================================================
-- Эх: supabase/AUDIT-2026-06-29.md (Low/Medium hygiene findings).
-- Бүгд additive/idempotent — өгөгдөл устгахгүй. (Өгөгдөл устгадаг засваруудыг
-- supabase/manual/ дотор тусад нь, гараар хянаж ажиллуулна.)

-- ------------------------------------------------------------
-- 1) updated_at дутуу хүснэгтүүдэд нэмж, trigger холбох.
--    public.update_updated_at_column() аль хэдийн тодорхойлогдсон.
-- ------------------------------------------------------------
ALTER TABLE public.chart_of_accounts   ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE public.vendors             ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE public.satisfaction_surveys ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

DROP TRIGGER IF EXISTS trg_chart_of_accounts_updated_at ON public.chart_of_accounts;
CREATE TRIGGER trg_chart_of_accounts_updated_at BEFORE UPDATE ON public.chart_of_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_vendors_updated_at ON public.vendors;
CREATE TRIGGER trg_vendors_updated_at BEFORE UPDATE ON public.vendors
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_satisfaction_surveys_updated_at ON public.satisfaction_surveys;
CREATE TRIGGER trg_satisfaction_surveys_updated_at BEFORE UPDATE ON public.satisfaction_surveys
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ------------------------------------------------------------
-- 2) customers.phone-г text болгох (бусад phone багана text/50;
--    20260113130003 нь VARCHAR(20)-аар ADD COLUMN IF NOT EXISTS хийсэн).
--    Хэрэв аль хэдийн text бол энэ no-op; өгөгдөл алдагдахгүй (өргөтгөл).
-- ------------------------------------------------------------
ALTER TABLE public.customers ALTER COLUMN phone TYPE text;

-- ------------------------------------------------------------
-- 3) Soft-delete индексүүдийг partial болгох (active set жижиг + хурдан).
--    Хуучин plain (shop_id, deleted_at)-ийг partial (shop_id) WHERE deleted_at
--    IS NULL-ээр солино.
-- ------------------------------------------------------------
DROP INDEX IF EXISTS public.idx_properties_deleted_at;
CREATE INDEX IF NOT EXISTS idx_properties_active        ON public.properties        (shop_id) WHERE deleted_at IS NULL;
DROP INDEX IF EXISTS public.idx_leads_deleted_at;
CREATE INDEX IF NOT EXISTS idx_leads_active             ON public.leads             (shop_id) WHERE deleted_at IS NULL;
DROP INDEX IF EXISTS public.idx_customers_deleted_at;
CREATE INDEX IF NOT EXISTS idx_customers_active         ON public.customers         (shop_id) WHERE deleted_at IS NULL;
DROP INDEX IF EXISTS public.idx_property_viewings_deleted_at;
CREATE INDEX IF NOT EXISTS idx_property_viewings_active ON public.property_viewings (shop_id) WHERE deleted_at IS NULL;
DROP INDEX IF EXISTS public.idx_property_contracts_deleted_at;
CREATE INDEX IF NOT EXISTS idx_property_contracts_active ON public.property_contracts (shop_id) WHERE deleted_at IS NULL;

-- ------------------------------------------------------------
-- 4) Одоо байгаа NOT VALID constraint-уудыг VALIDATE хийх (өгөгдөл цэвэр бол).
--    Зөрчилтэй мөр байвал NOT VALID хэвээр үлдээж АЛГАСНА (migration унахгүй).
--    Багана цэвэрлэсний дараа дахин ажиллуулж бүрэн validate хийж болно.
-- ------------------------------------------------------------
DO $$ BEGIN ALTER TABLE public.property_contracts VALIDATE CONSTRAINT chk_contracts_total_price_nonneg;
  EXCEPTION WHEN others THEN RAISE NOTICE 'skip validate chk_contracts_total_price_nonneg: %', SQLERRM; END $$;
DO $$ BEGIN ALTER TABLE public.property_contracts VALIDATE CONSTRAINT chk_contracts_paid_amount_nonneg;
  EXCEPTION WHEN others THEN RAISE NOTICE 'skip validate chk_contracts_paid_amount_nonneg: %', SQLERRM; END $$;
DO $$ BEGIN ALTER TABLE public.property_contracts VALIDATE CONSTRAINT chk_contracts_overdue_days_nonneg;
  EXCEPTION WHEN others THEN RAISE NOTICE 'skip validate chk_contracts_overdue_days_nonneg: %', SQLERRM; END $$;
DO $$ BEGIN ALTER TABLE public.customers VALIDATE CONSTRAINT chk_customers_message_count_nonneg;
  EXCEPTION WHEN others THEN RAISE NOTICE 'skip validate chk_customers_message_count_nonneg: %', SQLERRM; END $$;
-- 20260629120000-д нэмсэн 2 constraint:
DO $$ BEGIN ALTER TABLE public.ai_attachments VALIDATE CONSTRAINT chk_ai_attachments_entity_type;
  EXCEPTION WHEN others THEN RAISE NOTICE 'skip validate chk_ai_attachments_entity_type: %', SQLERRM; END $$;
DO $$ BEGIN ALTER TABLE public.property_viewings VALIDATE CONSTRAINT chk_viewing_interest;
  EXCEPTION WHEN others THEN RAISE NOTICE 'skip validate chk_viewing_interest: %', SQLERRM; END $$;

-- ------------------------------------------------------------
-- ХОЙШЛУУЛСАН (энд ОРООГҮЙ — эрсдэл/баталгаажуулалт шаардлагатай):
--   • user_roles.role → roles(name) FK: roles хүснэгтэд хэрэглэгдэж буй БҮХ
--     role нэр (super_admin багтаан) байгаа эсэхийг батлаагүй тул орхив.
--     Баталсны дараа: ALTER TABLE user_roles ADD CONSTRAINT fk_user_roles_role
--       FOREIGN KEY (role) REFERENCES roles(name) NOT VALID;
--   • Гэрээний давхардал дедуп + UNIQUE: supabase/manual/2026-06-29_contract_dedup_unique.sql
--   • Legacy e-commerce schema устгах: supabase/manual/2026-06-29_drop_legacy_ecommerce.sql
-- ------------------------------------------------------------
