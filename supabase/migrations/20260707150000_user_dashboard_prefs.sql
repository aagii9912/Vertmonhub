-- ============================================================
-- «Миний самбар»-ын виджет тохируулга — 2026-07-07
-- ============================================================
-- Борлуулалтын менежер бүр хувийн дашбоардын виджетээ нуух/эрэмбэлэх
-- боломжтой; сонголт хэрэглэгч + shop бүрээр хадгалагдана.
-- widgets JSONB = эрэмбэлэгдсэн [{ "id": "kpis", "hidden": false }, ...]
-- (канон бүртгэл: src/lib/dashboard/widget-prefs.ts MANAGER_WIDGETS).

CREATE TABLE IF NOT EXISTS user_dashboard_prefs (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    shop_id     uuid NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    widgets     jsonb NOT NULL DEFAULT '[]'::jsonb,
    created_at  timestamptz DEFAULT now(),
    updated_at  timestamptz DEFAULT now(),
    UNIQUE (user_id, shop_id)
);
CREATE INDEX IF NOT EXISTS idx_user_dashboard_prefs_user_shop
    ON user_dashboard_prefs (user_id, shop_id);

-- updated_at триггер (20260701140000-ийн туслах функцыг дахин ашиглана)
DROP TRIGGER IF EXISTS trg_user_dashboard_prefs_updated ON user_dashboard_prefs;
CREATE TRIGGER trg_user_dashboard_prefs_updated
    BEFORE UPDATE ON user_dashboard_prefs
    FOR EACH ROW EXECUTE FUNCTION update_sales_targets_updated_at();

-- RLS: зөвхөн ӨӨРИЙН тохиргоо + shop-ийн гишүүнчлэл
ALTER TABLE user_dashboard_prefs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS user_dashboard_prefs_self_access ON user_dashboard_prefs;
CREATE POLICY user_dashboard_prefs_self_access ON user_dashboard_prefs FOR ALL
    USING (
        user_id = auth.uid()
        AND shop_id IN (
            SELECT id FROM shops WHERE user_id = auth.uid()
            UNION
            SELECT shop_id FROM shop_members WHERE user_id = auth.uid()
        )
    )
    WITH CHECK (
        user_id = auth.uid()
        AND shop_id IN (
            SELECT id FROM shops WHERE user_id = auth.uid()
            UNION
            SELECT shop_id FROM shop_members WHERE user_id = auth.uid()
        )
    );

COMMENT ON TABLE user_dashboard_prefs IS '«Миний самбар»-ын виджет тохируулга (хэрэглэгч + shop бүрээр)';
