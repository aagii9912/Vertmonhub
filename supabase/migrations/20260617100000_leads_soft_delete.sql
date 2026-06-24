-- AI Orchestrator: soft-delete support for leads
-- Лийдийг устгахдаа жинхэнэ устгахгүй, deleted_at тэмдэглэж нуудаг (сэргээх боломжтой).

ALTER TABLE leads
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_leads_deleted_at ON leads (shop_id, deleted_at);

COMMENT ON COLUMN leads.deleted_at IS 'Soft-delete timestamp; NULL = active, set = deleted (recoverable)';
