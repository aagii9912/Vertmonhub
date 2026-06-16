-- Webhook Jobs Table — найдвартай дахин оролдлогын дараалал (retry queue)
-- retryService.ts (queueWebhookJob / getPendingJobs / processWebhookJob) энэ
-- хүснэгтийг ашиглана. Урьд нь .bak болж идэвхгүй байсныг сэргээв.

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

-- Хүлээгдэж буй ажлуудыг үр ашигтай татах индекс
CREATE INDEX IF NOT EXISTS idx_webhook_jobs_pending
ON webhook_jobs (status, next_retry_at)
WHERE status = 'pending';

-- Цэвэрлэгээний асуулгад зориулсан индекс
CREATE INDEX IF NOT EXISTS idx_webhook_jobs_cleanup
ON webhook_jobs (status, updated_at)
WHERE status IN ('completed', 'dead');

ALTER TABLE webhook_jobs ENABLE ROW LEVEL SECURITY;

-- Зөвхөн service role хандана (client хандалт шаардлагагүй)
DROP POLICY IF EXISTS "Service role only" ON webhook_jobs;
CREATE POLICY "Service role only" ON webhook_jobs
    FOR ALL
    USING (auth.role() = 'service_role');

-- updated_at-г автоматаар шинэчлэх trigger
CREATE OR REPLACE FUNCTION update_webhook_jobs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = '';

DROP TRIGGER IF EXISTS trigger_webhook_jobs_updated_at ON webhook_jobs;
CREATE TRIGGER trigger_webhook_jobs_updated_at
    BEFORE UPDATE ON webhook_jobs
    FOR EACH ROW
    EXECUTE FUNCTION update_webhook_jobs_updated_at();

COMMENT ON TABLE webhook_jobs IS 'Webhook-ийн дахин оролдлогын дараалал (exponential backoff-той)';
