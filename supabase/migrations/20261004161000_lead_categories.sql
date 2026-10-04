-- Лидийн ангилал («Лидийн ангилал»): төсөл (= shop) бүр өөрийн жагсаалттай. Тохиргоо →
-- «Лидийн ангилал»-д settings бичих эрхтэй хэрэглэгч удирдана; лид бүр нэг ангилалтай эсвэл
-- ангилалгүй (NULL). Composite FK (shop_id, category_id) нь лидийг өөр төслийн ангилалд
-- холбохыг DB түвшинд хориглоно; ашиглагдаж буй ангиллыг устгахгүй, архивлана (is_active).
-- Анхдагч ангиллыг энд seed хийхгүй (өгөгдлийн өөрчлөлт) — Тохиргооны «Санал болгох
-- ангиллууд нэмэх» товч (LeadCategoryService.addDefaultLeadCategories) төсөл бүрт нэмнэ.
-- Additive, дахин ажиллуулж болно. Browser шууд хандахгүй: API эрх, shop шалгаад service_role-оор бичнэ.

CREATE TABLE IF NOT EXISTS public.lead_categories (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
    name text NOT NULL CHECK (name = btrim(name) AND char_length(name) BETWEEN 1 AND 60),
    description text CHECK (description IS NULL OR char_length(description) <= 300),
    -- Харагдах өнгө (--status-* токен): цэг хэлбэрээр саарал pill дээр. danger-г ашиглахгүй.
    tone text NOT NULL DEFAULT 'neutral' CHECK (tone IN ('neutral', 'info', 'success', 'pending')),
    sort_order integer NOT NULL DEFAULT 0 CHECK (sort_order BETWEEN 0 AND 1000),
    is_active boolean NOT NULL DEFAULT true,
    -- auth.users FK-гүй (sales_kpi_months-ийн адил)
    created_by uuid,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT lead_categories_shop_id_key UNIQUE (shop_id, id)
);

-- Нэрийн давхардлын түлхүүр: том/жижиг үсэг ялгахгүй. Кирилл (Ө, Ү орно) үсгийг translate()-аар
-- шууд хувиргана — lower() нь өгөгдлийн сангийн locale-оос үл хамааран ижил ажиллана.
CREATE OR REPLACE FUNCTION public.lead_category_name_key(p_name text)
RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = ''
AS $$
    SELECT lower(translate(regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g'),
        'АБВГДЕЁЖЗИЙКЛМНОӨПРСТУҮФХЦЧШЩЪЫЬЭЮЯ', 'абвгдеёжзийклмноөпрстуүфхцчшщъыьэюя'));
$$;
REVOKE ALL ON FUNCTION public.lead_category_name_key(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lead_category_name_key(text) TO service_role;

CREATE UNIQUE INDEX IF NOT EXISTS lead_categories_shop_name_key
    ON public.lead_categories (shop_id, public.lead_category_name_key(name));
CREATE INDEX IF NOT EXISTS lead_categories_shop_order_idx
    ON public.lead_categories (shop_id, is_active, sort_order);

COMMENT ON TABLE public.lead_categories IS
    'Лидийн ангилал (төсөл/shop бүрийн тохиргоо, ≤ 30). Лид нэг ангилалтай (leads.category_id); ашиглагдсан ангиллыг архивлана.';

ALTER TABLE public.lead_categories ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.lead_categories FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.lead_categories TO service_role;

-- updated_at + төсөл бүрт 30 ангиллын дээд хязгаар (архивласан нь орно). Хязгаарыг шинэ мөр болон
-- өөр shop руу шилжүүлсэн мөрөнд шалгана (UPDATE shop_id-аар тойрохгүй). Advisory lock нь зэрэг
-- нэмэх хүсэлтийг дараалуулж хязгаарыг найдвартай болгоно.
CREATE OR REPLACE FUNCTION public.lead_categories_before_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
    v_check_limit boolean := true;
BEGIN
    IF TG_OP = 'UPDATE' THEN
        NEW.updated_at := now();
        v_check_limit := NEW.shop_id IS DISTINCT FROM OLD.shop_id;
    END IF;
    IF v_check_limit THEN
        PERFORM pg_advisory_xact_lock(hashtext('lead_categories:' || NEW.shop_id::text));
        IF (SELECT count(*) FROM public.lead_categories WHERE shop_id = NEW.shop_id) >= 30 THEN
            RAISE EXCEPTION 'lead_category_limit' USING ERRCODE = 'check_violation';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.lead_categories_before_write() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS lead_categories_before_write ON public.lead_categories;
CREATE TRIGGER lead_categories_before_write BEFORE INSERT OR UPDATE ON public.lead_categories
    FOR EACH ROW EXECUTE FUNCTION public.lead_categories_before_write();

-- Лидийн ангилал. MATCH SIMPLE: NULL = ангилалгүй (шалгахгүй). NO ACTION: ашиглагдсан ангиллыг
-- устгах боломжгүй (API архивлана). Анхаар: лидийг өөр shop руу шилжүүлэх (төсөл хуваах) бол
-- эхлээд ангиллыг тэр shop-д хуулах эсвэл category_id-г NULL болгоно — эс бөгөөс гүйлгээ буцна.
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS category_id uuid;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'leads_category_same_shop_fkey' AND conrelid = 'public.leads'::regclass
    ) THEN
        ALTER TABLE public.leads ADD CONSTRAINT leads_category_same_shop_fkey
            FOREIGN KEY (shop_id, category_id) REFERENCES public.lead_categories (shop_id, id);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_leads_shop_category
    ON public.leads (shop_id, category_id) WHERE category_id IS NOT NULL;

COMMENT ON COLUMN public.leads.category_id IS
    'Лидийн ангилал (lead_categories; ижил shop-ийнх байх ёстой — composite FK). NULL = ангилалгүй.';
