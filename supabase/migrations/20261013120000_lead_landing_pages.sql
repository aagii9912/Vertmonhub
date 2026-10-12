-- Landing page-ийн суваг: лид аль хуудаснаас (Elysium landing page эсвэл үндсэн сайт), ямар сувгаар
-- ирсэн. Суваг өөрөө `source`-д (event, facebook_ads, facebook, instagram, website), UTM/fbclid/Meta ID
-- одоо байгаа баганад. Нэмэлт, idempotent.

ALTER TABLE public.leads
    ADD COLUMN IF NOT EXISTS landing_page text,
    ADD COLUMN IF NOT EXISTS landing_page_name text,
    ADD COLUMN IF NOT EXISTS landing_page_url text,
    ADD COLUMN IF NOT EXISTS landing_page_purpose text,
    ADD COLUMN IF NOT EXISTS referrer_host text;

DO $$ BEGIN
    ALTER TABLE public.leads ADD CONSTRAINT leads_landing_page_purpose_check
        CHECK (landing_page_purpose IS NULL OR landing_page_purpose IN ('event', 'social_ad', 'general'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE public.leads ADD CONSTRAINT leads_landing_page_length_check
        CHECK (char_length(landing_page) <= 100 AND char_length(landing_page_name) <= 255
            AND char_length(landing_page_url) <= 500 AND char_length(referrer_host) <= 253);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS leads_shop_landing_page_idx
    ON public.leads (shop_id, landing_page) WHERE landing_page IS NOT NULL;
