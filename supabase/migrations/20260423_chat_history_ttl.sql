-- Chat history TTL / archive support
-- Adds archived flag and creates cleanup function

-- 1. Add archived column
ALTER TABLE chat_history 
ADD COLUMN IF NOT EXISTS archived boolean DEFAULT false;

-- 2. Add index for efficient archive queries
CREATE INDEX IF NOT EXISTS idx_chat_history_archived 
ON chat_history (archived, created_at);

-- 3. Create archive function (move messages older than 90 days)
CREATE OR REPLACE FUNCTION archive_old_chat_history(days_old integer DEFAULT 90)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    archived_count integer;
BEGIN
    UPDATE chat_history
    SET archived = true
    WHERE archived = false
      AND created_at < NOW() - (days_old || ' days')::interval;
    
    GET DIAGNOSTICS archived_count = ROW_COUNT;
    RETURN archived_count;
END;
$$;

-- 4. Create purge function (delete archived messages older than 180 days)
CREATE OR REPLACE FUNCTION purge_archived_chat_history(days_old integer DEFAULT 180)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    deleted_count integer;
BEGIN
    DELETE FROM chat_history
    WHERE archived = true
      AND created_at < NOW() - (days_old || ' days')::interval;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$;

-- 5. Add ai_memory TTL cleanup (memories older than 365 days)
CREATE OR REPLACE FUNCTION cleanup_expired_ai_memory(days_old integer DEFAULT 365)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    deleted_count integer;
BEGIN
    DELETE FROM ai_memory
    WHERE updated_at < NOW() - (days_old || ' days')::interval;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$;
