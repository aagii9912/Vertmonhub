-- Webhook configs & logs tables
-- For Vertmon Hub event notification system

CREATE TABLE IF NOT EXISTS webhook_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    event TEXT NOT NULL CHECK (event IN (
        'property.status_changed', 'lead.created', 'lead.status_changed',
        'contract.signed', 'contract.paid', 'order.completed',
        'viewing.scheduled', 'viewing.completed'
    )),
    url TEXT NOT NULL,
    headers JSONB DEFAULT '{}',
    format TEXT NOT NULL DEFAULT 'json' CHECK (format IN ('json', 'slack', 'teams')),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS webhook_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    event TEXT NOT NULL,
    payload JSONB,
    sent_count INT DEFAULT 0,
    failed_count INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_webhook_configs_shop_event ON webhook_configs(shop_id, event) WHERE is_active = true;
CREATE INDEX idx_webhook_logs_shop ON webhook_logs(shop_id, created_at DESC);

COMMENT ON TABLE webhook_configs IS 'Webhook endpoint configurations per shop/event';
COMMENT ON TABLE webhook_logs IS 'Webhook delivery logs for debugging';
