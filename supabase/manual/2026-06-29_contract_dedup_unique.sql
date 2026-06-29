-- ============================================================
-- ГАРААР АЖИЛЛУУЛАХ — Гэрээний давхардал дедуп + UNIQUE индекс
-- ============================================================
-- ⚠ ЭНЭ ФАЙЛ migrations/ ДОТОР БИШ — auto-apply (supabase db push) хийгдэхгүй.
--   Өгөгдөл (санхүүгийн гэрээ) хөнддөг тул STAGING дээр туршиж, үр дүнг
--   хянасны дараа PRODUCTION дээр гараар ажиллуулна уу.
--
-- Шалтгаан (AUDIT-2026-06-29.md, High): property_contracts дээр
--   (shop_id, contract_number) UNIQUE байхгүй тул дахин import бүрт давхардсан
--   гэрээ үүсч борлуулалт/санхүүгийн нийлбэрийг хөөрөгддөг.
--
-- Энэхүй скрипт:
--   1) (shop_id, contract_number) тус бүрд ХАМГИЙН их paid_amount-тай (тэнцвэл
--      хамгийн эртний) НЭГ мөрийг үлдээж, бусдыг SOFT-DELETE (deleted_at) хийнэ.
--      → буцаах боломжтой (deleted_at = NULL болгоход сэргэнэ).
--   2) Active мөрүүд дээр partial UNIQUE индекс үүсгэнэ.
--
-- ⚠ Эхлээд давхардлыг ХАРАХ (устгахаас өмнө):
--   SELECT shop_id, contract_number, count(*)
--   FROM property_contracts
--   WHERE contract_number IS NOT NULL AND deleted_at IS NULL
--   GROUP BY 1,2 HAVING count(*) > 1
--   ORDER BY count(*) DESC;

BEGIN;

-- 1) Давхардсан active мөрүүдийг soft-delete (нэгийг үлдээнэ).
WITH ranked AS (
    SELECT id,
           ROW_NUMBER() OVER (
               PARTITION BY shop_id, contract_number
               ORDER BY COALESCE(paid_amount, 0) DESC, created_at ASC, id ASC
           ) AS rn
    FROM property_contracts
    WHERE contract_number IS NOT NULL AND deleted_at IS NULL
)
UPDATE property_contracts pc
SET deleted_at = now()
FROM ranked r
WHERE pc.id = r.id AND r.rn > 1;

-- 2) Active мөрүүд дээр partial UNIQUE (soft-deleted мөрийг тооцохгүй).
--    Тэмдэглэл: partial учир Supabase upsert-ийн onConflict-д ШУУД target
--    болгож болохгүй (predicate дамждаггүй). Одоогийн import upsert хийдэггүй
--    тул асуудалгүй — давхардсан insert энэ индексээр амжилтгүй болж зогсоно.
CREATE UNIQUE INDEX IF NOT EXISTS uq_contracts_shop_number
    ON property_contracts (shop_id, contract_number)
    WHERE deleted_at IS NULL AND contract_number IS NOT NULL;

COMMIT;
