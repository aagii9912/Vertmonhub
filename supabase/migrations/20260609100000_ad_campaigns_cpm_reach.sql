-- Vertmon Hub: ad_campaigns хүснэгтэд cpm, reach багана нэмэх
-- fetchCampaignInsights нь Graph API-аас cpm, reach-ийг аль хэдийн татдаг боловч
-- хадгалах багана байхгүй тул хаягддаг байсан. ROI/insights-д ашиглахаар хадгална.

ALTER TABLE public.ad_campaigns
    ADD COLUMN IF NOT EXISTS cpm DECIMAL(10, 2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS reach INTEGER DEFAULT 0;

COMMENT ON COLUMN public.ad_campaigns.cpm IS 'Cost per 1000 impressions (Graph API insights-аас)';
COMMENT ON COLUMN public.ad_campaigns.reach IS 'Хүрсэн хүний тоо / reach (Graph API insights-аас)';
