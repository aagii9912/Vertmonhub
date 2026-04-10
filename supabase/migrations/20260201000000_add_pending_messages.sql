-- Message Batching: Store pending messages for 5-second aggregation
-- Mongolians often split one thought into 2-3 messages, this batches them

CREATE TABLE IF NOT EXISTS pending_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id UUID REFERENCES shops(id) ON DELETE CASCADE,
    customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
    sender_id TEXT NOT NULL,
    platform TEXT DEFAULT 'messenger',
    message_type TEXT DEFAULT 'text',  -- text, image
    content TEXT,
    image_url TEXT,
    access_token TEXT,  -- Store for later sending
    process_after TIMESTAMPTZ NOT NULL,  -- When to process (created_at + 5 sec)
    processed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for efficient cron job queries
CREATE INDEX idx_pending_messages_process ON pending_messages(process_after, processed) 
WHERE processed = FALSE;

-- Index for grouping messages by sender
CREATE INDEX idx_pending_messages_sender ON pending_messages(shop_id, sender_id, processed);

-- Auto-cleanup: Delete processed messages after 1 hour
CREATE OR REPLACE FUNCTION cleanup_processed_messages()
RETURNS void AS $$
BEGIN
    DELETE FROM pending_messages 
    WHERE processed = TRUE 
    AND created_at < NOW() - INTERVAL '1 hour';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

COMMENT ON TABLE pending_messages IS 'Buffers incoming messages for 5-second batching before AI processing';
