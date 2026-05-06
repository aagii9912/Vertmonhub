-- Vertmon Hub: Lead attribution for Facebook Ads
-- Adds UTM/fbclid tracking + facebook_ads enum value to lead_source

-- 1. Add new lead source enum value (for native lead_source enum if used)
-- The existing leads.source column is VARCHAR(50), so we just document the new value.
-- If a true enum exists, this is the spot to ALTER TYPE — leaving idempotent guard.

-- 2. Add attribution columns to leads
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS fbclid TEXT,
  ADD COLUMN IF NOT EXISTS utm_source TEXT,
  ADD COLUMN IF NOT EXISTS utm_medium TEXT,
  ADD COLUMN IF NOT EXISTS utm_campaign TEXT,
  ADD COLUMN IF NOT EXISTS utm_content TEXT,
  ADD COLUMN IF NOT EXISTS utm_term TEXT,
  ADD COLUMN IF NOT EXISTS facebook_campaign_id TEXT,
  ADD COLUMN IF NOT EXISTS facebook_adset_id TEXT,
  ADD COLUMN IF NOT EXISTS facebook_ad_id TEXT;

CREATE INDEX IF NOT EXISTS idx_leads_facebook_campaign_id ON leads(facebook_campaign_id);
CREATE INDEX IF NOT EXISTS idx_leads_utm_campaign ON leads(utm_campaign);

-- 3. Add facebook_ad_account_id + external campaign ID linking on shops
ALTER TABLE shops
  ADD COLUMN IF NOT EXISTS facebook_ad_account_id TEXT;

-- 4. Add external campaign reference + last sync to ad_campaigns
ALTER TABLE ad_campaigns
  ADD COLUMN IF NOT EXISTS external_id TEXT,
  ADD COLUMN IF NOT EXISTS objective TEXT,
  ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS idx_ad_campaigns_external_unique
  ON ad_campaigns(shop_id, platform, external_id)
  WHERE external_id IS NOT NULL;
