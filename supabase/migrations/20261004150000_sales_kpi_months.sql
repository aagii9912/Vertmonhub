-- Борлуулалтын менежерийн сарын KPI карт: сарын эхэнд тогтоосон төлөвлөгөө, гараар
-- оруулах гүйцэтгэл (дуудлага/чат), удирдлагын үнэлгээ. Автомат гүйцэтгэлийг (ERP, CRM)
-- хадгалахгүй — тайлан бүрт эх сурвалжаас дахин тооцно. Нэг төсөл = нэг shop.
-- Additive: шинэ хүснэгт, browser хандалтгүй, зөвхөн service_role бичнэ.

CREATE TABLE IF NOT EXISTS public.sales_kpi_months (
    shop_id uuid NOT NULL,
    year integer NOT NULL CHECK (year BETWEEN 2020 AND 2100),
    month integer NOT NULL CHECK (month BETWEEN 1 AND 12),
    manager_name text NOT NULL,
    plans jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(plans) = 'object'),
    manual jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(manual) = 'object'),
    review jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(review) = 'object'),
    updated_by uuid,
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (shop_id, year, month, manager_name),
    FOREIGN KEY (shop_id, manager_name) REFERENCES public.sales_managers (shop_id, name)
        ON UPDATE CASCADE ON DELETE CASCADE
);

COMMENT ON TABLE public.sales_kpi_months IS
    'Менежерийн сарын KPI-ийн төлөвлөгөө, гар гүйцэтгэл, удирдлагын үнэлгээ (автомат гүйцэтгэл тайлангаар тооцогдоно)';

ALTER TABLE public.sales_kpi_months ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.sales_kpi_months FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.sales_kpi_months TO service_role;
