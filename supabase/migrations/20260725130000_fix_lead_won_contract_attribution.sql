-- ============================================================
-- Лийд «closed_won» болоход үүсэх гэрээний холбоосыг засах
-- ============================================================
-- АСУУДАЛ (аудит H-14): `create_contract_on_lead_won()` trigger нь гэрээг
-- үүсгэхдээ:
--   1. `sales_manager`-ыг ОГТ дамжуулдаггүй байсан. `manager_performance`
--      болон `manager_monthly_sales` view-ууд `sales_manager`-аар бүлэглэдэг
--      тул ийм гэрээ борлуулалтын тайлан, менежерийн самбар, KPI тайлангаас
--      БҮРЭН УНАДАГ — менежер хийсэн ажлаа тайлангаас олж харахгүй.
--   2. `total_price = NEW.conversion_value` — хөрвүүлэхдээ дүн оруулаагүй бол
--      NULL үлдэж, «идэвхтэй гэрээ» гэж тоологдох атлаа дүнгүй байдаг.
--
-- ЗАСВАР: менежерийн нэрийг лийдээс шууд өвлүүлж, дүнг найдвартай
-- нөхөх (conversion_value → budget_max → 0).
-- ============================================================

CREATE OR REPLACE FUNCTION create_contract_on_lead_won()
RETURNS TRIGGER AS $$
DECLARE
    v_manager TEXT;
    v_price NUMERIC;
BEGIN
    IF NEW.status = 'closed_won' AND (OLD.status IS DISTINCT FROM 'closed_won') THEN
        -- Хөрвүүлсэн огноог тэмдэглэнэ
        IF NEW.converted_at IS NULL THEN
            NEW.converted_at := NOW();
        END IF;

        -- Энэ lead-д хараахан гэрээ үүсээгүй бол stub үүсгэнэ (давхар үүсгэхээс сэргийлнэ)
        IF NOT EXISTS (SELECT 1 FROM property_contracts WHERE lead_id = NEW.id) THEN
            -- Менежерийн нэр: лийд дээрх борлуулалтын менежер.
            -- `sales_manager_name` багана нь migration 20260617120000-д
            -- нэмэгдсэн; хуучин орчинд байхгүй байвал NULL үлдэнэ.
            BEGIN
                v_manager := NULLIF(TRIM(NEW.sales_manager_name), '');
            EXCEPTION WHEN undefined_column THEN
                v_manager := NULL;
            END;

            -- Дүн: хөрвүүлэлтийн дүн → лийдийн төсөв → 0
            v_price := COALESCE(NEW.conversion_value, NEW.budget_max, 0);

            INSERT INTO property_contracts (
                shop_id, lead_id, customer_id, product_type, contract_status,
                customer_name, customer_phone, total_price, contract_date,
                sales_channel, sales_manager
            ) VALUES (
                NEW.shop_id, NEW.id, NEW.customer_id, 'residential', 'active',
                NEW.customer_name, NEW.customer_phone, v_price, CURRENT_DATE,
                'ПРОПЕРТИС', v_manager
            );
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_lead_won_create_contract ON leads;
CREATE TRIGGER trg_lead_won_create_contract
    BEFORE UPDATE ON leads
    FOR EACH ROW
    EXECUTE FUNCTION create_contract_on_lead_won();

-- ============================================================
-- Түүхэн засвар: менежергүй үлдсэн, лийдээс үүссэн гэрээнүүдийг нөхнө.
-- Энэ нь ЗӨВХӨН lead_id-тай бөгөөд sales_manager нь хоосон гэрээнд
-- хамаарах тул бусад өгөгдөлд нөлөөлөхгүй (аюулгүй).
-- ============================================================
UPDATE property_contracts c
SET sales_manager = NULLIF(TRIM(l.sales_manager_name), '')
FROM leads l
WHERE c.lead_id = l.id
  AND COALESCE(TRIM(c.sales_manager), '') = ''
  AND COALESCE(TRIM(l.sales_manager_name), '') <> '';

COMMENT ON FUNCTION create_contract_on_lead_won() IS
    'Лийд closed_won болоход гэрээний stub үүсгэнэ. Менежерийн нэр болон дүнг лийдээс өвлүүлнэ (тайлангаас унахаас сэргийлнэ).';
