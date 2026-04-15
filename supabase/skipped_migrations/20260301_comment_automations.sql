-- Comment Automations: Comment-to-DM automation rules
-- Allows shop owners to set keyword triggers on posts that auto-send DMs

CREATE TABLE IF NOT EXISTS public.comment_automations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  shop_id UUID NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  
  -- Trigger config
  post_id TEXT,                                -- FB/IG post ID (NULL = all posts)
  post_url TEXT,                               -- Display-only: post URL for UI
  trigger_keywords TEXT[] NOT NULL DEFAULT '{}',-- Keywords to match
  match_type TEXT DEFAULT 'contains'           -- 'contains' | 'exact'
    CHECK (match_type IN ('contains', 'exact')),
  
  -- Action config
  action_type TEXT DEFAULT 'send_dm'           -- 'send_dm' | 'reply_comment' | 'both'
    CHECK (action_type IN ('send_dm', 'reply_comment', 'both')),
  dm_message TEXT NOT NULL,                    -- Message to send via DM
  reply_message TEXT,                          -- Optional comment reply text
  
  -- Platform
  platform TEXT DEFAULT 'both'                 -- 'facebook' | 'instagram' | 'both'
    CHECK (platform IN ('facebook', 'instagram', 'both')),
  
  -- Tracking
  trigger_count INTEGER DEFAULT 0,
  last_triggered_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Index for webhook lookups
CREATE INDEX idx_comment_automations_shop_id ON public.comment_automations(shop_id);
CREATE INDEX idx_comment_automations_active ON public.comment_automations(shop_id, is_active) WHERE is_active = true;

-- RLS
ALTER TABLE public.comment_automations ENABLE ROW LEVEL SECURITY;

-- Policy: Users can manage their own shop's automations
CREATE POLICY "Users can view own comment_automations"
  ON public.comment_automations FOR SELECT
  USING (
    shop_id IN (
      SELECT id FROM public.shops WHERE user_id = (SELECT auth.uid())::text
    )
  );

CREATE POLICY "Users can insert own comment_automations"
  ON public.comment_automations FOR INSERT
  WITH CHECK (
    shop_id IN (
      SELECT id FROM public.shops WHERE user_id = (SELECT auth.uid())::text
    )
  );

CREATE POLICY "Users can update own comment_automations"
  ON public.comment_automations FOR UPDATE
  USING (
    shop_id IN (
      SELECT id FROM public.shops WHERE user_id = (SELECT auth.uid())::text
    )
  );

CREATE POLICY "Users can delete own comment_automations"
  ON public.comment_automations FOR DELETE
  USING (
    shop_id IN (
      SELECT id FROM public.shops WHERE user_id = (SELECT auth.uid())::text
    )
  );

-- Service role full access for webhook processing
CREATE POLICY "Service role full access to comment_automations"
  ON public.comment_automations FOR ALL
  USING (auth.role() = 'service_role');

-- Comments
COMMENT ON TABLE public.comment_automations IS 'Comment-to-DM automation rules for shop owners';
COMMENT ON COLUMN public.comment_automations.trigger_keywords IS 'Array of keywords that trigger this automation';
COMMENT ON COLUMN public.comment_automations.match_type IS 'contains = keyword anywhere in comment, exact = exact match only';
COMMENT ON COLUMN public.comment_automations.action_type IS 'send_dm = DM only, reply_comment = comment reply only, both = DM + comment reply';
COMMENT ON COLUMN public.comment_automations.platform IS 'Which platform this automation applies to';
