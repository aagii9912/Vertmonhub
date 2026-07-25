-- ============================================================
-- Гэрээний төлбөрийн нийлбэрийг автоматаар зөв байлгах
-- ============================================================
-- АСУУДАЛ: `/api/dashboard/contracts/[id]/payments` төлбөрийг зөвхөн
-- `payment_schedules`-д бичээд `property_contracts.paid_amount` /
-- `balance` / `paid_percent`-ыг ХЭЗЭЭ Ч шинэчилдэггүй байсан. Улмаас
-- цуглуулалтын KPI, `manager_monthly_sales`, санхүүгийн тайлан,
-- дашбордын орлого бүгд бодит байдлаас зөрж, алдаа өдөр бүр
-- хуримтлагдаж байв.
--
-- ЯАГААД SUM() БИШ, DELTA ГЭЖ: импортоор орсон гэрээнүүд
-- `paid_amount`-тай атлаа `payment_schedules` мөргүй байдаг
-- (`src/lib/admin/import/mappers.ts` урьдчилгааг шууд гэрээн дээр
-- тавьдаг). Иймд `paid_amount = SUM(payment_schedules)` гэж дахин
-- тооцвол импортын үлдэгдэл ТЭГ болж, өгөгдөл эвдэрнэ. Тиймээс
-- зөвхөн ӨӨРЧЛӨЛТИЙН ЗӨРҮҮГ нэмнэ.
--
-- ЯАГААД TRIGGER ГЭЖ: нэг UPDATE дотор атомаар бодогдоно —
-- read-modify-write race үүсэхгүй (зэрэг бүртгэсэн хоёр төлбөрийн
-- аль нь ч алдагдахгүй). Мөн API, AI tool, импорт гэх мэт БҮХ
-- бичих замд ялгаагүй үйлчилнэ.
-- ============================================================

CREATE OR REPLACE FUNCTION public.apply_contract_payment_delta(
    p_contract_id UUID,
    p_delta NUMERIC
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF p_contract_id IS NULL OR p_delta IS NULL OR p_delta = 0 THEN
        RETURN;
    END IF;

    UPDATE public.property_contracts c
    SET
        paid_amount = GREATEST(0, COALESCE(c.paid_amount, 0) + p_delta),
        balance = GREATEST(
            0,
            COALESCE(c.total_price, 0) - GREATEST(0, COALESCE(c.paid_amount, 0) + p_delta)
        ),
        paid_percent = CASE
            WHEN COALESCE(c.total_price, 0) > 0 THEN LEAST(
                999.99,
                ROUND(
                    (GREATEST(0, COALESCE(c.paid_amount, 0) + p_delta) / c.total_price * 100)::NUMERIC,
                    2
                )
            )
            ELSE 0
        END
    WHERE c.id = p_contract_id;
END;
$$;

-- Гараас дуудагдахаас сэргийлнэ (зөвхөн trigger дотроос ажиллана)
REVOKE ALL ON FUNCTION public.apply_contract_payment_delta(UUID, NUMERIC) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.apply_contract_payment_delta(UUID, NUMERIC) FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.sync_contract_paid_amount()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        PERFORM public.apply_contract_payment_delta(
            NEW.contract_id, COALESCE(NEW.paid_amount, 0)
        );
        RETURN NEW;

    ELSIF TG_OP = 'UPDATE' THEN
        -- Төлбөр өөр гэрээ рүү шилжсэн ховор тохиолдлыг ч зөв бодно
        IF NEW.contract_id IS DISTINCT FROM OLD.contract_id THEN
            PERFORM public.apply_contract_payment_delta(
                OLD.contract_id, -COALESCE(OLD.paid_amount, 0)
            );
            PERFORM public.apply_contract_payment_delta(
                NEW.contract_id, COALESCE(NEW.paid_amount, 0)
            );
        ELSE
            PERFORM public.apply_contract_payment_delta(
                NEW.contract_id,
                COALESCE(NEW.paid_amount, 0) - COALESCE(OLD.paid_amount, 0)
            );
        END IF;
        RETURN NEW;

    ELSIF TG_OP = 'DELETE' THEN
        PERFORM public.apply_contract_payment_delta(
            OLD.contract_id, -COALESCE(OLD.paid_amount, 0)
        );
        RETURN OLD;
    END IF;

    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_contract_paid_amount ON public.payment_schedules;
CREATE TRIGGER trg_sync_contract_paid_amount
    AFTER INSERT OR UPDATE OR DELETE ON public.payment_schedules
    FOR EACH ROW EXECUTE FUNCTION public.sync_contract_paid_amount();

-- ============================================================
-- ТҮҮХЭН ӨГӨГДЛИЙН ТУЛГАЛТ — ЗОРИУДААР АВТОМАТААР АЖИЛЛУУЛААГҮЙ
-- ============================================================
-- Trigger нь ЭНЭ ЦЭГЭЭС ХОЙШХ бүх төлбөрийг зөв болгоно. Харин өмнө
-- нь бүртгэгдсэн төлбөрүүд гэрээн дээр тусаагүй үлдсэн байж болно.
--
-- Түүхийг засахаас ӨМНӨ доорх тулгалтыг ажиллуулж, зөрүүг НҮДЭЭР
-- шалгана уу. Урьдчилгаа нь `payment_schedules`-д мөр болж орсон
-- эсэх нь төсөл бүрд өөр байж болзошгүй тул автомат засвар хийвэл
-- давхар тоологдох эрсдэлтэй:
--
--   SELECT c.id, c.contract_number, c.customer_name,
--          c.total_price, c.paid_amount AS contract_paid,
--          COALESCE(s.sched_paid, 0) AS schedules_paid,
--          c.paid_amount - COALESCE(s.sched_paid, 0) AS zuruu
--   FROM property_contracts c
--   LEFT JOIN (
--       SELECT contract_id, SUM(paid_amount) AS sched_paid
--       FROM payment_schedules GROUP BY contract_id
--   ) s ON s.contract_id = c.id
--   WHERE c.deleted_at IS NULL
--     AND c.paid_amount IS DISTINCT FROM COALESCE(s.sched_paid, 0)
--   ORDER BY ABS(c.paid_amount - COALESCE(s.sched_paid, 0)) DESC;
--
-- Хэрэв тухайн төсөлд урьдчилгаа нь ЗӨВХӨН гэрээн дээр (schedules-д
-- биш) байдаг нь батлагдвал засвар нь:
--   UPDATE property_contracts c SET paid_amount = COALESCE(c.prepayment_paid,0) + s.sched_paid ...
-- гэх мэт байх бөгөөд үүнийг гараар, нөөцлөлт хийсний дараа хийнэ.
-- ============================================================

COMMENT ON FUNCTION public.sync_contract_paid_amount() IS
    'payment_schedules өөрчлөгдөхөд property_contracts.paid_amount/balance/paid_percent-ыг атомаар тэнцүүлнэ (delta-аар, SUM-аар БИШ).';
