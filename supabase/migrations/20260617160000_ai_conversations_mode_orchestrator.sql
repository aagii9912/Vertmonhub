-- AI Orchestrator: allow mode='orchestrator' on ai_conversations.
-- Хуучин CHECK (mode IN ('data','general')) нь orchestrator горимыг блоклож,
-- шинэ яриа үүсэхгүй → чат түүх хадгалагдахгүй байсныг засна.

ALTER TABLE ai_conversations DROP CONSTRAINT IF EXISTS ai_conversations_mode_check;
ALTER TABLE ai_conversations
    ADD CONSTRAINT ai_conversations_mode_check CHECK (mode IN ('data', 'general', 'orchestrator'));
ALTER TABLE ai_conversations ALTER COLUMN mode SET DEFAULT 'orchestrator';
