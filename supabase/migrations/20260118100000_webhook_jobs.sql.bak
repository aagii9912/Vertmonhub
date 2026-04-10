-- Webhook Jobs Table for Retry Mechanism
-- Run this migration in Supabase SQL Editor

-- Create webhook_jobs table
CREATE TABLE IF NOT EXISTS webhook_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type VARCHAR(50) NOT NULL CHECK (type IN ('message', 'comment_reply', 'notification')),
    payload JSONB NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'dead')),
    attempts INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 5,
    last_error TEXT,
    next_retry_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for efficient job fetching
CREATE INDEX IF NOT EXISTS idx_webhook_jobs_pending 
ON webhook_jobs (status, next_retry_at) 
WHERE status = 'pending';

-- Index for cleanup queries
CREATE INDEX IF NOT EXISTS idx_webhook_jobs_cleanup 
ON webhook_jobs (status, updated_at) 
WHERE status IN ('completed', 'dead');

-- Enable Row Level Security
ALTER TABLE webhook_jobs ENABLE ROW LEVEL SECURITY;

-- Policy: Only service role can access (no client access needed)
CREATE POLICY "Service role only" ON webhook_jobs
    FOR ALL
    USING (auth.role() = 'service_role');

-- Trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION update_webhook_jobs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_webhook_jobs_updated_at
    BEFORE UPDATE ON webhook_jobs
    FOR EACH ROW
    EXECUTE FUNCTION update_webhook_jobs_updated_at();

-- Comment on table
COMMENT ON TABLE webhook_jobs IS 'Queue for webhook retries with exponential backoff';
