-- ============================================================
-- CLEAN SLATE: Drop any partial leftovers from previous attempts
-- ============================================================
DROP TABLE IF EXISTS public.ai_messages CASCADE;
DROP TABLE IF EXISTS public.ai_conversations CASCADE;
DROP FUNCTION IF EXISTS public.update_ai_conversation_timestamp() CASCADE;

-- ============================================================
-- 1. ai_conversations
-- ============================================================
CREATE TABLE public.ai_conversations (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     uuid NOT NULL,
    shop_id     uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
    title       text NOT NULL DEFAULT 'Шинэ харилцан яриа',
    mode        text NOT NULL DEFAULT 'data' CHECK (mode IN ('data', 'general')),
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_ai_conversations_user_shop
    ON public.ai_conversations(user_id, shop_id, updated_at DESC);

ALTER TABLE public.ai_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own conversations"
    ON public.ai_conversations FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can create own conversations"
    ON public.ai_conversations FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own conversations"
    ON public.ai_conversations FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own conversations"
    ON public.ai_conversations FOR DELETE
    USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.update_ai_conversation_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_ai_conversation_updated
    BEFORE UPDATE ON public.ai_conversations
    FOR EACH ROW EXECUTE FUNCTION public.update_ai_conversation_timestamp();

-- ============================================================
-- 2. ai_messages
-- ============================================================
CREATE TABLE public.ai_messages (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id  uuid NOT NULL REFERENCES public.ai_conversations(id) ON DELETE CASCADE,
    role             text NOT NULL CHECK (role IN ('user', 'assistant')),
    content          text NOT NULL DEFAULT '',
    chart_config     jsonb,
    data             jsonb,
    created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_ai_messages_conversation
    ON public.ai_messages(conversation_id, created_at ASC);

ALTER TABLE public.ai_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view messages of own conversations"
    ON public.ai_messages FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.ai_conversations c
            WHERE c.id = conversation_id
            AND c.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can insert messages to own conversations"
    ON public.ai_messages FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.ai_conversations c
            WHERE c.id = conversation_id
            AND c.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can delete messages of own conversations"
    ON public.ai_messages FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM public.ai_conversations c
            WHERE c.id = conversation_id
            AND c.user_id = auth.uid()
        )
    );

-- ============================================================
-- 3. Grants
-- ============================================================
GRANT ALL ON public.ai_conversations TO service_role;
GRANT ALL ON public.ai_messages TO service_role;
