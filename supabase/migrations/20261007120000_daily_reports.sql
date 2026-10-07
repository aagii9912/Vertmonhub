-- Өдрийн тайлан («Өдрийн тайлан»): Mandala Garden, Elysium багийн өдөр бүрийн тайлан
-- (утасны шугам бүрийн ирсэн дуудлага, чат, уулзалт менежерээр). Уулзалтыг property_viewings-ээс
-- автоматаар уншина; утасны шугамын дуудлага, чатыг менежерүүд өдөр бүр тоогоор оруулна
-- (CallPro-гийн экспорт менежерээр задрахгүй, хотын дугаарын ихэнх дуудлага лид болдоггүй).
--
-- • daily_report_settings — төсөл (= shop) бүрийн загвар: утасны шугам, ангилал, чатын суваг,
--   менежерүүдийн дараалал/товчлол. Тохиргоо бичих эрхтэй хэрэглэгч засна.
-- • daily_report_counts — өдөр × менежер × үзүүлэлт (`call.<шугам>.<ангилал>`, `chat.<суваг>`) тоо.
--   Нүд бүр тусдаа мөр: менежерүүд нэгэн зэрэг өөрийн тоогоо оруулахад бие биенээ дарахгүй.
-- • daily_reports — өдрийн тэмдэглэл ба «Тайлан хийж гүйцэтгэсэн» (баталгаажуулсан хүн).
--
-- Additive, дахин ажиллуулж болно. Browser шууд хандахгүй: API эрх, shop шалгаад service_role-оор бичнэ.

CREATE TABLE IF NOT EXISTS public.daily_report_settings (
    shop_id uuid PRIMARY KEY REFERENCES public.shops(id) ON DELETE CASCADE,
    config jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(config) = 'object'),
    updated_by uuid,
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.daily_report_counts (
    shop_id uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
    report_date date NOT NULL,
    -- sales_managers.name (канон нэр); FK-гүй — менежерийн нэр бусад хүснэгтэд ч нэрээрээ холбогддог.
    manager_name text NOT NULL CHECK (manager_name = btrim(manager_name) AND char_length(manager_name) BETWEEN 1 AND 120),
    metric text NOT NULL CHECK (metric ~ '^(call\.[a-z0-9]{1,16}\.(total|new|repeat|other)|chat\.[a-z0-9]{1,16})$'),
    value integer NOT NULL CHECK (value BETWEEN 0 AND 10000),
    updated_by uuid,
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (shop_id, report_date, manager_name, metric)
);

CREATE TABLE IF NOT EXISTS public.daily_reports (
    shop_id uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
    report_date date NOT NULL,
    -- { lines: { <шугам>: текст }, chats: текст, general: текст }
    notes jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(notes) = 'object'),
    completed_by uuid,
    completed_by_name text CHECK (completed_by_name IS NULL OR char_length(completed_by_name) <= 120),
    completed_at timestamptz,
    updated_by uuid,
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (shop_id, report_date)
);

COMMENT ON TABLE public.daily_report_settings IS 'Өдрийн тайлангийн загвар (төсөл бүрт нэг): утасны шугам, чатын суваг, менежерүүд.';
COMMENT ON TABLE public.daily_report_counts IS 'Өдрийн тайлангийн гараар оруулсан тоо: өдөр × менежер × үзүүлэлт (дуудлага, чат). Уулзалт энд биш — property_viewings.';
COMMENT ON TABLE public.daily_reports IS 'Өдрийн тайлангийн тэмдэглэл ба баталгаажуулалт (Тайлан хийж гүйцэтгэсэн).';

ALTER TABLE public.daily_report_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_report_counts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_reports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.daily_report_settings, public.daily_report_counts, public.daily_reports FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.daily_report_settings, public.daily_report_counts, public.daily_reports TO service_role;
