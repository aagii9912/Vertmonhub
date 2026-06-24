-- ============================================
-- Vertmon Hub: Уулзалтын аналитик (meeting analytics)
-- Migration: 20260624130000_add_meeting_analytics.sql
--
-- Хурлын шаардлага: уулзалтыг ШИНЭ / ДАВТАН / ХУДАЛДАН АВАГЧ-аар, мөн
-- санхүүжилтийн СУВГААР (банкны зээл / бэлэн / ипотек / лизинг / бартер) хянах.
--   - meeting_type → property_viewings (уулзалт бүрт)
--   - financing_intent → leads (анх барьж авах цэг: intake form / lead)
-- ============================================

-- Уулзалтын төрөл
ALTER TABLE property_viewings
    ADD COLUMN IF NOT EXISTS meeting_type VARCHAR(20)
        CHECK (meeting_type IN ('new_customer', 'repeat_customer', 'existing_buyer'));

CREATE INDEX IF NOT EXISTS idx_viewings_meeting_type ON property_viewings(meeting_type);

-- Санхүүжилтийн сонирхол (lead дээр)
ALTER TABLE leads
    ADD COLUMN IF NOT EXISTS financing_intent VARCHAR(30);
    -- утгууд: bank_loan | cash | mortgage | leasing | barter | other

CREATE INDEX IF NOT EXISTS idx_leads_financing_intent ON leads(financing_intent);

-- ============================================
-- Сарын уулзалтын нэгтгэл (төрөл + санхүүжилтийн суваг)
-- ============================================
CREATE OR REPLACE VIEW meeting_monthly_summary AS
SELECT
    v.shop_id,
    date_trunc('month', v.scheduled_at)::date AS month,
    COUNT(*) AS total_meetings,
    COUNT(*) FILTER (WHERE v.meeting_type = 'new_customer')      AS new_customer,
    COUNT(*) FILTER (WHERE v.meeting_type = 'repeat_customer')   AS repeat_customer,
    COUNT(*) FILTER (WHERE v.meeting_type = 'existing_buyer')    AS existing_buyer,
    COUNT(*) FILTER (WHERE v.status = 'completed')               AS completed,
    COUNT(*) FILTER (WHERE l.financing_intent = 'bank_loan')     AS fin_bank_loan,
    COUNT(*) FILTER (WHERE l.financing_intent = 'cash')          AS fin_cash,
    COUNT(*) FILTER (WHERE l.financing_intent = 'mortgage')      AS fin_mortgage,
    COUNT(*) FILTER (WHERE l.financing_intent = 'leasing')       AS fin_leasing,
    COUNT(*) FILTER (WHERE l.financing_intent = 'barter')        AS fin_barter
FROM property_viewings v
LEFT JOIN leads l ON l.id = v.lead_id
GROUP BY v.shop_id, date_trunc('month', v.scheduled_at);

-- ============================================
SELECT 'meeting analytics columns + monthly summary view added ✅' as result;
