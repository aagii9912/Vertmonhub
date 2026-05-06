-- Vertmon Hub: add missing message_count columns to customers
-- WebhookService and dashboard customers list both reference these.

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS message_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS message_count_reset_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_customers_message_count ON customers(message_count) WHERE message_count > 0;
