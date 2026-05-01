-- Supabase-backed rate limiter
-- Replaces in-memory Map with persistent Postgres state shared across Vercel instances.
-- Atomic check + increment via SECURITY DEFINER function.

CREATE TABLE IF NOT EXISTS rate_limits (
    key TEXT PRIMARY KEY,
    count INTEGER NOT NULL DEFAULT 0,
    reset_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS rate_limits_reset_at_idx ON rate_limits (reset_at);

-- RLS: only service role can touch this table (rate limiter uses supabaseAdmin())
ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rate_limits_service_role_only ON rate_limits;
CREATE POLICY rate_limits_service_role_only ON rate_limits
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Atomic check + increment.
-- Returns one row: (allowed BOOLEAN, remaining INTEGER, reset_at_ms BIGINT)
-- reset_at_ms is unix epoch milliseconds for easy JS Date interop.
CREATE OR REPLACE FUNCTION check_rate_limit(
    p_key TEXT,
    p_max_requests INTEGER,
    p_window_ms INTEGER
)
RETURNS TABLE (allowed BOOLEAN, remaining INTEGER, reset_at_ms BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_now TIMESTAMPTZ := NOW();
    v_window INTERVAL := (p_window_ms::TEXT || ' milliseconds')::INTERVAL;
    v_existing_count INTEGER;
    v_existing_reset TIMESTAMPTZ;
    v_new_reset TIMESTAMPTZ;
BEGIN
    -- Lock the row (or absence of row) for this key
    SELECT count, reset_at INTO v_existing_count, v_existing_reset
    FROM rate_limits
    WHERE key = p_key
    FOR UPDATE;

    IF NOT FOUND OR v_existing_reset < v_now THEN
        -- New window — insert or refresh
        v_new_reset := v_now + v_window;

        INSERT INTO rate_limits (key, count, reset_at, updated_at)
        VALUES (p_key, 1, v_new_reset, v_now)
        ON CONFLICT (key) DO UPDATE
        SET count = 1,
            reset_at = v_new_reset,
            updated_at = v_now;

        RETURN QUERY SELECT
            TRUE,
            p_max_requests - 1,
            (EXTRACT(EPOCH FROM v_new_reset) * 1000)::BIGINT;
        RETURN;
    END IF;

    -- Within active window
    IF v_existing_count >= p_max_requests THEN
        RETURN QUERY SELECT
            FALSE,
            0,
            (EXTRACT(EPOCH FROM v_existing_reset) * 1000)::BIGINT;
        RETURN;
    END IF;

    UPDATE rate_limits
    SET count = count + 1,
        updated_at = v_now
    WHERE key = p_key;

    RETURN QUERY SELECT
        TRUE,
        p_max_requests - v_existing_count - 1,
        (EXTRACT(EPOCH FROM v_existing_reset) * 1000)::BIGINT;
END;
$$;

GRANT EXECUTE ON FUNCTION check_rate_limit(TEXT, INTEGER, INTEGER) TO service_role;

-- Cleanup expired entries (idempotent — call from cron or on-demand)
CREATE OR REPLACE FUNCTION cleanup_rate_limits()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_deleted INTEGER;
BEGIN
    DELETE FROM rate_limits WHERE reset_at < NOW() - INTERVAL '5 minutes';
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    RETURN v_deleted;
END;
$$;

GRANT EXECUTE ON FUNCTION cleanup_rate_limits() TO service_role;

-- Schedule cleanup every 15 minutes (if pg_cron is enabled)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        PERFORM cron.unschedule('cleanup_rate_limits') WHERE EXISTS (
            SELECT 1 FROM cron.job WHERE jobname = 'cleanup_rate_limits'
        );
        PERFORM cron.schedule(
            'cleanup_rate_limits',
            '*/15 * * * *',
            $cron$ SELECT cleanup_rate_limits(); $cron$
        );
    END IF;
END;
$$;

COMMENT ON TABLE rate_limits IS 'Per-key request counters for distributed rate limiting (Supabase backend)';
COMMENT ON FUNCTION check_rate_limit IS 'Atomically check + increment rate limit. Returns (allowed, remaining, reset_at_ms).';
COMMENT ON FUNCTION cleanup_rate_limits IS 'Delete entries whose window expired >5 min ago. Schedule via pg_cron every 15 min.';
