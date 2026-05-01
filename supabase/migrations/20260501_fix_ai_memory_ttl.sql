-- Fix cleanup_expired_ai_memory: ai_memory is a JSONB column on customers, not a table.
-- The previous version (20260423_chat_history_ttl.sql) referenced a non-existent
-- "ai_memory" table and would fail when the daily cron called it.
--
-- New behavior: clear customers.ai_memory whose top-level "last_updated" timestamp
-- is older than `days_old`. Returns the number of rows cleared.
--
-- Memory shape (set by src/lib/ai/tools/memory.ts):
--   { "<key>": "<value>", ..., "last_updated": "ISO timestamp" }

CREATE OR REPLACE FUNCTION cleanup_expired_ai_memory(days_old integer DEFAULT 365)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    cleared_count integer;
BEGIN
    UPDATE customers
    SET ai_memory = '{}'::jsonb
    WHERE ai_memory IS NOT NULL
      AND ai_memory <> '{}'::jsonb
      AND (ai_memory ? 'last_updated')
      AND (ai_memory->>'last_updated')::timestamptz < NOW() - (days_old || ' days')::interval;

    GET DIAGNOSTICS cleared_count = ROW_COUNT;
    RETURN cleared_count;
END;
$$;

COMMENT ON FUNCTION cleanup_expired_ai_memory(integer) IS
    'Clears customers.ai_memory JSONB whose last_updated is older than days_old. Called daily by /api/cron/data-cleanup.';
