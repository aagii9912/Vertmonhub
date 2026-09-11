-- ============================================================
-- 2026-09-11 Wave 1 (docs/REVIEW-2026-09-11.md §6): өгөгдлийн зөв байдал + hygiene
-- Зөвхөн schema (additive DDL + policy/trigger); өгөгдөл өөрчлөх statement байхгүй.
-- ============================================================

-- 1) Лидийн idempotency түлхүүр (offline outbox / давхар submit) — M13
ALTER TABLE leads ADD COLUMN IF NOT EXISTS client_request_id UUID;
CREATE UNIQUE INDEX IF NOT EXISTS uq_leads_shop_client_request
    ON leads (shop_id, client_request_id) WHERE client_request_id IS NOT NULL;

-- 2) Instagram харилцагч давхардахгүй (Messenger-т UNIQUE(shop_id, facebook_id) байсан) — H13
--    (prod-д давхар бүлэг 0 гэдгийг 2026-09-11 шалгасан)
CREATE UNIQUE INDEX IF NOT EXISTS uq_customers_shop_instagram
    ON customers (shop_id, instagram_id) WHERE instagram_id IS NOT NULL;

-- 3) closed_won trigger: зөвхөн бодит дүнтэй (conversion_value > 0) үед stub гэрээ,
--    менежерийг лидээс тамгална — гэрээгүй closed_won үнэгүй stub үүсгэдэг байв (H5).
--    Өмнө үүссэн 10 хоосон stub (lead_id-тай, contract_number NULL, total_price NULL)-ийг
--    цэвэрлэх эсэхийг гараар шийднэ:
--      UPDATE property_contracts SET deleted_at = NOW()
--       WHERE deleted_at IS NULL AND lead_id IS NOT NULL AND contract_number IS NULL AND total_price IS NULL;
CREATE OR REPLACE FUNCTION create_contract_on_lead_won()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'closed_won' AND (OLD.status IS DISTINCT FROM 'closed_won') THEN
        IF NEW.converted_at IS NULL THEN
            NEW.converted_at := NOW();
        END IF;

        IF NEW.conversion_value IS NOT NULL AND NEW.conversion_value > 0
           AND NOT EXISTS (SELECT 1 FROM property_contracts WHERE lead_id = NEW.id AND deleted_at IS NULL) THEN
            INSERT INTO property_contracts (
                shop_id, lead_id, customer_id, product_type, contract_status,
                customer_name, customer_phone, total_price, balance, contract_date, sales_channel, sales_manager
            ) VALUES (
                NEW.shop_id, NEW.id, NEW.customer_id, 'residential', 'active',
                NEW.customer_name, NEW.customer_phone, NEW.conversion_value, NEW.conversion_value,
                CURRENT_DATE, 'ПРОПЕРТИС', NEW.sales_manager_name
            );
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 4) Meta data-deletion callback-ийн audit хүснэгт (код бичдэг ч хүснэгт байгаагүй) — M7
CREATE TABLE IF NOT EXISTS data_deletion_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    confirmation_code TEXT NOT NULL,
    user_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed')),
    requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE data_deletion_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "data_deletion_requests_service" ON data_deletion_requests;
CREATE POLICY "data_deletion_requests_service" ON data_deletion_requests
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 5) shop_members: админ зөвхөн өөрийн хандах эрхтэй shop-ийн гишүүнчлэлийг удирдана,
--    super_admin ч орно (өмнө нь дурын shop + зөвхөн 'admin') — M4
DROP POLICY IF EXISTS "Admins can manage membership" ON shop_members;
CREATE POLICY "Admins can manage membership" ON shop_members
    FOR ALL TO authenticated
    USING (
        EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = auth.uid() AND ur.role IN ('admin', 'super_admin'))
        AND shop_id IN (SELECT public.get_user_shop_ids())
    )
    WITH CHECK (
        EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = auth.uid() AND ur.role IN ('admin', 'super_admin'))
        AND shop_id IN (SELECT public.get_user_shop_ids())
    );

-- 6) Халуун query-уудын индексүүд (§7 DB audit)
CREATE INDEX IF NOT EXISTS idx_leads_shop_manager_active
    ON leads (shop_id, sales_manager_name) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_leads_shop_created_active
    ON leads (shop_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_leads_shop_followup_active
    ON leads (shop_id, next_followup_at) WHERE deleted_at IS NULL AND next_followup_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_viewings_shop_scheduled_active
    ON property_viewings (shop_id, scheduled_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_chat_history_customer_created
    ON chat_history (customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user
    ON push_subscriptions (user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_channel_contracts_active_end
    ON channel_contracts (end_date) WHERE status = 'active';
