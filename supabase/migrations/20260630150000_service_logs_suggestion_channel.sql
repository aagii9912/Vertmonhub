-- "Санал гомдол" хэсэг — Давалгаа 3
-- (1) 'suggestion' (Санал) төрөл нэмэх, (2) channel (суваг) багана нэмэх.

-- type CHECK-д 'suggestion' нэмнэ.
-- (20260416-д inline column CHECK-ээр үүссэн тул нэр нь default `service_logs_type_check`.)
ALTER TABLE service_logs DROP CONSTRAINT IF EXISTS service_logs_type_check;
ALTER TABLE service_logs ADD CONSTRAINT service_logs_type_check
    CHECK (type IN ('inquiry', 'complaint', 'maintenance', 'handover', 'payment', 'suggestion', 'other'));

-- Гомдол/санал ирсэн суваг (Facebook, Instagram, утас, биечлэн, апп, бусад)
ALTER TABLE service_logs ADD COLUMN IF NOT EXISTS channel VARCHAR(20)
    CHECK (channel IN ('facebook', 'instagram', 'phone', 'in_person', 'app', 'other'));

CREATE INDEX IF NOT EXISTS idx_service_logs_channel ON service_logs(channel);
