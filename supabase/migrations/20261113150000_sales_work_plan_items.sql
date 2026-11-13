-- Сарын «бусад ажлын төлөвлөгөө» — хариуцагчтай, чеклэдэг жагсаалт (борлуулалтын багийн хүсэлт 2026-11-12).
--
-- • sales_work_plan_items — төсөл (= shop) × сар (plan_month 'YYYY-MM') бүрийн ажил: гарчиг, хариуцагчид, хийгдсэн эсэх.
--   Хариуцагч = sales_managers.id (uuid[]): жагсаалтын НЭР түлхүүр биш тул менежерийн нэр солигдоход
--   (rename_sales_manager) энэ хүснэгтийг хөндөх шаардлагагүй; нэрийг уншихдаа жагсаалтаас авна. Ижил shop-ийн
--   менежер эсэхийг API шалгана (массивт FK байхгүй).
--   done_at NULL = хийгдээгүй. Устгахгүй — deleted_at (soft delete); service_role-д DELETE олгохгүй.
-- • Лхагвын илтгэлийн «N-р сарын бусад ажлын төлөвлөгөө» слайд эндээс гарна (хариуцагчийн нэрийн эхний үсэг, ✓).
--
-- Эрх (dashboard модуль, бичих эрх)-ийг API шалгана. Additive, дахин ажиллуулж болно. Browser шууд хандахгүй:
-- зөвхөн service_role.

CREATE TABLE IF NOT EXISTS public.sales_work_plan_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
    plan_month text NOT NULL CHECK (plan_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
    title text NOT NULL CHECK (title = btrim(title) AND char_length(title) BETWEEN 1 AND 200),
    -- sales_managers.id; хоосон = хариуцагчгүй. Давхардалгүй, 20-оос ихгүй (API мөн шалгана).
    assignee_ids uuid[] NOT NULL DEFAULT '{}' CHECK (cardinality(assignee_ids) <= 20),
    -- Дээд хязгааргүй: шинэ мөр сүүлд орно (10, 20, …).
    sort_order integer NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
    done_at timestamptz,
    -- auth.users FK-гүй (lead_categories, sales_referral_sources-ийн адил); нэр нь тухайн үеийн харагдах нэр.
    done_by uuid,
    done_by_name text CHECK (done_by_name IS NULL OR char_length(done_by_name) <= 120),
    created_by uuid,
    created_by_name text CHECK (created_by_name IS NULL OR char_length(created_by_name) <= 120),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz,
    -- Хийгдсэн тэмдэглэгээ ба хэн тэмдэглэсэн нь хамт (хийгдээгүй бол хоёулаа NULL).
    CONSTRAINT sales_work_plan_items_done_pair CHECK (done_at IS NOT NULL OR (done_by IS NULL AND done_by_name IS NULL))
);

CREATE INDEX IF NOT EXISTS sales_work_plan_items_shop_month_idx
    ON public.sales_work_plan_items (shop_id, plan_month, sort_order) WHERE deleted_at IS NULL;

COMMENT ON TABLE public.sales_work_plan_items IS
    'Сарын «бусад ажлын төлөвлөгөө» — төсөл/shop × сар: ажил, хариуцагчид (sales_managers.id), хийгдсэн эсэх. Лхагвын илтгэлийн ажлын төлөвлөгөөний слайдын эх сурвалж.';
COMMENT ON COLUMN public.sales_work_plan_items.assignee_ids IS
    'Хариуцагчид — sales_managers.id (ижил shop-ийг API шалгана). Нэр түлхүүр биш: нэр солигдоход хөндөхгүй.';

ALTER TABLE public.sales_work_plan_items ENABLE ROW LEVEL SECURITY;
-- Устгахгүй (deleted_at): service_role-д DELETE олгохгүй. Shop устгахад FK cascade-аар цэвэрлэгдэнэ.
REVOKE ALL ON TABLE public.sales_work_plan_items FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.sales_work_plan_items TO service_role;

-- VERIFY: scripts/apply-migrations.mjs (хүснэгт, RLS, anon/authenticated эрхгүй).

NOTIFY pgrst, 'reload schema';
