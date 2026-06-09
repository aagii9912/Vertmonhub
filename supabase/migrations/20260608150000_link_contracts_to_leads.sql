-- Vertmon Hub: Lead → Contract холболт + close дээр автоматаар гэрээ үүсгэх (Phase 4)
-- Өмнө нь property_contracts нь leads-тэй холбоогүй, зөвхөн Excel/HubSpot-оор дүүрдэг
-- байсан тул борлуулалтын "сүүлчийн миль" (lead → гэрээ) хэмжигдэхгүй байв.

-- 1) Холбоосын баганууд
ALTER TABLE property_contracts
    ADD COLUMN IF NOT EXISTS lead_id UUID REFERENCES leads(id) ON DELETE SET NULL;
ALTER TABLE property_contracts
    ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES customers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_prop_contracts_lead_id ON property_contracts(lead_id);
CREATE INDEX IF NOT EXISTS idx_prop_contracts_customer_id ON property_contracts(customer_id);

-- 2) Lead "closed_won" болоход converted_at-ыг тэмдэглэж, гэрээний stub үүсгэх trigger.
--    Бүх замыг (dashboard browser client, AI, API) нэг дор хамарна.
--    SECURITY DEFINER — property_contracts-ийн RLS-ээс үл хамаарч insert хийнэ.
CREATE OR REPLACE FUNCTION create_contract_on_lead_won()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'closed_won' AND (OLD.status IS DISTINCT FROM 'closed_won') THEN
        -- Хөрвүүлсэн огноог тэмдэглэнэ
        IF NEW.converted_at IS NULL THEN
            NEW.converted_at := NOW();
        END IF;

        -- Энэ lead-д хараахан гэрээ үүсээгүй бол stub үүсгэнэ (давхар үүсгэхээс сэргийлнэ)
        IF NOT EXISTS (SELECT 1 FROM property_contracts WHERE lead_id = NEW.id) THEN
            INSERT INTO property_contracts (
                shop_id, lead_id, customer_id, product_type, contract_status,
                customer_name, customer_phone, total_price, contract_date, sales_channel
            ) VALUES (
                NEW.shop_id, NEW.id, NEW.customer_id, 'residential', 'active',
                NEW.customer_name, NEW.customer_phone, NEW.conversion_value, CURRENT_DATE, 'ПРОПЕРТИС'
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

COMMENT ON COLUMN property_contracts.lead_id IS 'Хөрвүүлэгдсэн lead (борлуулалтын юүлүүрийн холбоос)';
COMMENT ON COLUMN property_contracts.customer_id IS 'Холбоотой харилцагч';
