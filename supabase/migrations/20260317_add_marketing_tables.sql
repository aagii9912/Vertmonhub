-- Migration: Marketing & Analytics Tables
-- Creates tables for campaigns, social posts, ads, messaging, calendar, brand, web analytics, and AI agents

-- ============================================
-- 1. Marketing Campaigns
-- ============================================
CREATE TABLE IF NOT EXISTS public.marketing_campaigns (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    shop_id UUID NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL DEFAULT 'general',
    status VARCHAR(50) DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused', 'completed', 'cancelled')),
    budget DECIMAL(15, 2) DEFAULT 0,
    spend DECIMAL(15, 2) DEFAULT 0,
    start_date DATE,
    end_date DATE,
    description TEXT,
    metrics JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_marketing_campaigns_shop ON public.marketing_campaigns(shop_id);
CREATE INDEX IF NOT EXISTS idx_marketing_campaigns_status ON public.marketing_campaigns(status);

-- ============================================
-- 2. Social Posts
-- ============================================
CREATE TABLE IF NOT EXISTS public.social_posts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    shop_id UUID NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
    platform VARCHAR(50) NOT NULL CHECK (platform IN ('facebook', 'instagram', 'twitter', 'linkedin', 'tiktok')),
    content TEXT,
    media_urls TEXT[],
    published_at TIMESTAMPTZ,
    status VARCHAR(50) DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'published', 'failed')),
    likes INTEGER DEFAULT 0,
    comments INTEGER DEFAULT 0,
    shares INTEGER DEFAULT 0,
    reach INTEGER DEFAULT 0,
    engagement_rate DECIMAL(5, 2) DEFAULT 0,
    external_post_id TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_social_posts_shop ON public.social_posts(shop_id);
CREATE INDEX IF NOT EXISTS idx_social_posts_platform ON public.social_posts(platform);
CREATE INDEX IF NOT EXISTS idx_social_posts_published ON public.social_posts(published_at);

-- ============================================
-- 3. Ad Campaigns
-- ============================================
CREATE TABLE IF NOT EXISTS public.ad_campaigns (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    shop_id UUID NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
    platform VARCHAR(50) NOT NULL CHECK (platform IN ('facebook', 'google', 'instagram', 'tiktok')),
    name VARCHAR(255) NOT NULL,
    status VARCHAR(50) DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused', 'completed')),
    budget DECIMAL(15, 2) DEFAULT 0,
    spend DECIMAL(15, 2) DEFAULT 0,
    impressions INTEGER DEFAULT 0,
    clicks INTEGER DEFAULT 0,
    conversions INTEGER DEFAULT 0,
    ctr DECIMAL(5, 2) DEFAULT 0,
    cpc DECIMAL(10, 2) DEFAULT 0,
    start_date DATE,
    end_date DATE,
    ad_creative JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ad_campaigns_shop ON public.ad_campaigns(shop_id);
CREATE INDEX IF NOT EXISTS idx_ad_campaigns_platform ON public.ad_campaigns(platform);

-- ============================================
-- 4. Message Campaigns (Email + SMS)
-- ============================================
CREATE TABLE IF NOT EXISTS public.message_campaigns (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    shop_id UUID NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
    type VARCHAR(20) NOT NULL CHECK (type IN ('email', 'sms', 'push')),
    name VARCHAR(255) NOT NULL,
    subject TEXT,
    content TEXT,
    status VARCHAR(50) DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'sent', 'cancelled')),
    scheduled_at TIMESTAMPTZ,
    sent_at TIMESTAMPTZ,
    recipients INTEGER DEFAULT 0,
    delivered INTEGER DEFAULT 0,
    opened INTEGER DEFAULT 0,
    clicked INTEGER DEFAULT 0,
    unsubscribed INTEGER DEFAULT 0,
    template_id TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_message_campaigns_shop ON public.message_campaigns(shop_id);
CREATE INDEX IF NOT EXISTS idx_message_campaigns_type ON public.message_campaigns(type);

-- ============================================
-- 5. Content Calendar
-- ============================================
CREATE TABLE IF NOT EXISTS public.content_calendar (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    shop_id UUID NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    type VARCHAR(50) DEFAULT 'post' CHECK (type IN ('post', 'story', 'reel', 'blog', 'email', 'ad', 'event')),
    platform VARCHAR(50),
    scheduled_date DATE NOT NULL,
    scheduled_time TIME,
    status VARCHAR(50) DEFAULT 'planned' CHECK (status IN ('planned', 'in_progress', 'ready', 'published', 'cancelled')),
    description TEXT,
    assigned_to TEXT,
    color VARCHAR(20) DEFAULT '#3B82F6',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_content_calendar_shop ON public.content_calendar(shop_id);
CREATE INDEX IF NOT EXISTS idx_content_calendar_date ON public.content_calendar(scheduled_date);

-- ============================================
-- 6. Brand Mentions
-- ============================================
CREATE TABLE IF NOT EXISTS public.brand_mentions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    shop_id UUID NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
    source VARCHAR(100) NOT NULL,
    platform VARCHAR(50),
    content TEXT,
    sentiment VARCHAR(20) DEFAULT 'neutral' CHECK (sentiment IN ('positive', 'neutral', 'negative')),
    reach INTEGER DEFAULT 0,
    url TEXT,
    author TEXT,
    mentioned_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_brand_mentions_shop ON public.brand_mentions(shop_id);
CREATE INDEX IF NOT EXISTS idx_brand_mentions_sentiment ON public.brand_mentions(sentiment);

-- ============================================
-- 7. Web Analytics
-- ============================================
CREATE TABLE IF NOT EXISTS public.web_analytics (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    shop_id UUID NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
    page VARCHAR(500) NOT NULL,
    visitors INTEGER DEFAULT 0,
    page_views INTEGER DEFAULT 0,
    bounce_rate DECIMAL(5, 2) DEFAULT 0,
    avg_time_seconds INTEGER DEFAULT 0,
    source VARCHAR(100),
    device VARCHAR(50),
    location VARCHAR(100),
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_web_analytics_shop ON public.web_analytics(shop_id);
CREATE INDEX IF NOT EXISTS idx_web_analytics_date ON public.web_analytics(date);

-- ============================================
-- 8. AI Agents
-- ============================================
CREATE TABLE IF NOT EXISTS public.ai_agents (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    shop_id UUID NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    type VARCHAR(50) NOT NULL DEFAULT 'general',
    status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'error')),
    model VARCHAR(100) DEFAULT 'gemini-2.5-flash',
    config JSONB DEFAULT '{}',
    total_conversations INTEGER DEFAULT 0,
    avg_response_time_ms INTEGER DEFAULT 0,
    satisfaction_rate DECIMAL(3, 1) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_agents_shop ON public.ai_agents(shop_id);

-- ============================================
-- Enable RLS on all tables
-- ============================================
ALTER TABLE public.marketing_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_calendar ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brand_mentions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.web_analytics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_agents ENABLE ROW LEVEL SECURITY;

-- ============================================
-- RLS Policies: Service role full access, authenticated read own shop
-- ============================================

-- Helper: create standard CRUD policies for shop-scoped tables
DO $$
DECLARE
    tbl TEXT;
BEGIN
    FOREACH tbl IN ARRAY ARRAY[
        'marketing_campaigns', 'social_posts', 'ad_campaigns',
        'message_campaigns', 'content_calendar', 'brand_mentions',
        'web_analytics', 'ai_agents'
    ] LOOP
        EXECUTE format('
            CREATE POLICY "Service role full access" ON public.%I
                FOR ALL USING (true) WITH CHECK (true);
        ', tbl);

        EXECUTE format('
            CREATE POLICY "Users read own shop data" ON public.%I
                FOR SELECT USING (
                    shop_id IN (SELECT id FROM public.shops WHERE user_id = auth.uid()::text)
                );
        ', tbl);
    END LOOP;
END $$;

-- ============================================
-- Auto-update triggers
-- ============================================
DO $$
DECLARE
    tbl TEXT;
BEGIN
    FOREACH tbl IN ARRAY ARRAY[
        'marketing_campaigns', 'social_posts', 'ad_campaigns',
        'message_campaigns', 'content_calendar', 'ai_agents'
    ] LOOP
        EXECUTE format('
            CREATE TRIGGER update_%s_updated_at
                BEFORE UPDATE ON public.%I
                FOR EACH ROW
                EXECUTE FUNCTION update_updated_at_column();
        ', tbl, tbl);
    END LOOP;
END $$;
