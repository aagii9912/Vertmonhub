-- Vertmon Hub: ad_campaigns unique index-ийг partial-аас бүтэн болгох
-- Өмнөх partial index (WHERE external_id IS NOT NULL) дээр PostgREST-ийн
-- upsert(onConflict) ажилладаггүй → campaign-ууд хадгалагддаггүй байсан.
-- Бүтэн unique index нь onConflict-тэй ажиллана; NULL external_id-ууд Postgres-д
-- distinct тул гар (manual) campaign-д асуудалгүй.

DROP INDEX IF EXISTS idx_ad_campaigns_external_unique;
CREATE UNIQUE INDEX IF NOT EXISTS idx_ad_campaigns_external_unique
  ON public.ad_campaigns(shop_id, platform, external_id);
