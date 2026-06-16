-- Өгөгдлийн бүрэн бүтэн байдлын CHECK constraint-ууд
-- NOT VALID ашигласан — зөвхөн ШИНЭ/шинэчилсэн бичилтэд хүчинтэй болж,
-- одоо байгаа өгөгдлийг шалгахгүй (миграц аюулгүй гүйцэтгэгдэнэ). Хуучин
-- өгөгдлийг цэвэрлэсний дараа VALIDATE CONSTRAINT-аар бүрэн идэвхжүүлж болно.
--
-- Тэмдэглэл: property_contracts(shop_id, contract_number) дээрх UNIQUE индексийг
-- (upsert-д шаардлагатай) энд нэмээгүй — давхардсан гэрээ байвал унах тул эхлээд
-- дедуп хийх follow-up шаардлагатай.

DO $$
BEGIN
    -- Гэрээ: үнэ/төлбөр сөрөг байж болохгүй
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_contracts_total_price_nonneg') THEN
        ALTER TABLE property_contracts
            ADD CONSTRAINT chk_contracts_total_price_nonneg CHECK (total_price IS NULL OR total_price >= 0) NOT VALID;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_contracts_paid_amount_nonneg') THEN
        ALTER TABLE property_contracts
            ADD CONSTRAINT chk_contracts_paid_amount_nonneg CHECK (paid_amount IS NULL OR paid_amount >= 0) NOT VALID;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_contracts_overdue_days_nonneg') THEN
        ALTER TABLE property_contracts
            ADD CONSTRAINT chk_contracts_overdue_days_nonneg CHECK (overdue_days IS NULL OR overdue_days >= 0) NOT VALID;
    END IF;

    -- Харилцагч: мессежийн тоо сөрөг байж болохгүй
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_customers_message_count_nonneg') THEN
        ALTER TABLE customers
            ADD CONSTRAINT chk_customers_message_count_nonneg CHECK (message_count IS NULL OR message_count >= 0) NOT VALID;
    END IF;
END $$;
