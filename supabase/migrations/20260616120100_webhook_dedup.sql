-- Webhook idempotency — давхар хүргэлтээс сэргийлэх
-- Meta нэг event-ийг хэд хэдэн удаа илгээж болдог (at-least-once delivery).
-- Боловсруулсан event бүрийн ID-г энд хадгалж, давхардлыг таслана.

CREATE TABLE IF NOT EXISTS webhook_dedup (
    event_id TEXT PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Хуучин бичлэгүүдийг цэвэрлэхэд зориулсан индекс (TTL — 7 хоног)
CREATE INDEX IF NOT EXISTS idx_webhook_dedup_created_at
ON webhook_dedup (created_at);

ALTER TABLE webhook_dedup ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role only" ON webhook_dedup;
CREATE POLICY "Service role only" ON webhook_dedup
    FOR ALL
    USING (auth.role() = 'service_role');

COMMENT ON TABLE webhook_dedup IS 'Webhook event-ийн давхардлаас сэргийлэх (idempotency) бүртгэл';
