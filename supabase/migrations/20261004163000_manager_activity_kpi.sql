-- Менежерийн өдөр тутмын идэвх (дуудлага, болсон уулзалт, санал хүсэлтийн шийдвэрлэлт) — KPI v2-ийн
-- өдрийн давхарга. Шинэ хүснэгт, функц үүсгэхгүй; бүх тооцоо тайлангаар (lib/sales/activity-load.ts).
-- Additive, idempotent: дахин ажиллуулахад өөрчлөлтгүй. Өгөгдөл шилжүүлэхгүй — хуучин
-- service_logs.assigned_to-г manager_name болгох нь тусдаа, батлагдсан UPDATE (docs/features/MANAGER-ACTIVITY-KPI-2026-10-04.md).

-- 1) Санал хүсэлтийн хариуцагч менежер (sales_managers.name канон нэр) ба шийдвэрлэсэн хэрэглэгч.
--    leads.sales_manager_name-тэй адил FK-гүй: нэрийг бичих үед сервис (ServiceLogService) идэвхтэй
--    бүртгэлээр шалгана. assigned_to нь дэлгэцийн чөлөөт текст хэвээр.
ALTER TABLE public.service_logs ADD COLUMN IF NOT EXISTS manager_name text;
ALTER TABLE public.service_logs ADD COLUMN IF NOT EXISTS resolved_by uuid;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'service_logs_manager_name_check' AND conrelid = 'public.service_logs'::regclass
    ) THEN
        ALTER TABLE public.service_logs ADD CONSTRAINT service_logs_manager_name_check
            CHECK (manager_name IS NULL OR (manager_name = btrim(manager_name) AND char_length(manager_name) BETWEEN 1 AND 120));
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_service_logs_shop_manager
    ON public.service_logs (shop_id, manager_name);

COMMENT ON COLUMN public.service_logs.manager_name IS
    'Хариуцсан борлуулалтын менежер (sales_managers.name) — шийдвэрлэлтийн KPI-ийн attribution';
COMMENT ON COLUMN public.service_logs.resolved_by IS
    'Шийдвэрлэсэн/хаасан хэрэглэгч (resolved_at-тай хамт тавигдаж, дахин нээхэд цэвэрлэгдэнэ)';

-- 2) Өдөр/сарын дуудлагын тоо: зөвхөн 'call' мөрийг shop + огноогоор хурдан уншина.
CREATE INDEX IF NOT EXISTS idx_lead_activities_shop_calls
    ON public.lead_activities (shop_id, created_at)
    WHERE type = 'call';

-- 3) Менежерийн сар бүрийн ӨДРИЙН зорилт {calls, meetings} — сарын төлөвлөгөөнөөс (plans) тусдаа.
ALTER TABLE public.sales_kpi_months ADD COLUMN IF NOT EXISTS daily jsonb NOT NULL DEFAULT '{}'::jsonb;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'sales_kpi_months_daily_object' AND conrelid = 'public.sales_kpi_months'::regclass
    ) THEN
        ALTER TABLE public.sales_kpi_months ADD CONSTRAINT sales_kpi_months_daily_object
            CHECK (jsonb_typeof(daily) = 'object');
    END IF;
END $$;

COMMENT ON COLUMN public.sales_kpi_months.daily IS
    'Өдрийн зорилт: {"calls": n, "meetings": n} — ажлын өдөр (Даваа–Баасан) бүрд; байхгүй бол «зорилтгүй»';
