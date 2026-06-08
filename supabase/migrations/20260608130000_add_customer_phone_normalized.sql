-- Vertmon Hub: Харилцагчийн утасны нормчилсон багана (dedup-д зориулсан)
-- `phone` нь харагдах хэлбэрээ хадгална, `phone_normalized` нь зөвхөн цифр (976 код хассан)
-- хэлбэрээр хадгалагдаж dedup-ийг хурдан, найдвартай болгоно.

ALTER TABLE customers ADD COLUMN IF NOT EXISTS phone_normalized TEXT;

-- Одоо байгаа дугааруудыг backfill: цифр болгож, Монголын улсын кодыг хасна
UPDATE customers
SET phone_normalized = (
    CASE
        WHEN regexp_replace(phone, '[^0-9]', '', 'g') = '' THEN NULL
        WHEN length(regexp_replace(phone, '[^0-9]', '', 'g')) = 11
             AND left(regexp_replace(phone, '[^0-9]', '', 'g'), 3) = '976'
            THEN right(regexp_replace(phone, '[^0-9]', '', 'g'), 8)
        WHEN length(regexp_replace(phone, '[^0-9]', '', 'g')) = 13
             AND left(regexp_replace(phone, '[^0-9]', '', 'g'), 5) = '00976'
            THEN right(regexp_replace(phone, '[^0-9]', '', 'g'), 8)
        ELSE regexp_replace(phone, '[^0-9]', '', 'g')
    END
)
WHERE phone IS NOT NULL AND phone_normalized IS NULL;

-- Dedup хайлтыг хурдан болгох индекс (shop тус бүрд)
CREATE INDEX IF NOT EXISTS idx_customers_phone_normalized
    ON customers(shop_id, phone_normalized)
    WHERE phone_normalized IS NOT NULL;

COMMENT ON COLUMN customers.phone_normalized IS 'Зөвхөн цифр, 976 код хассан нормчилсон утас — dedup-д ашиглана';
