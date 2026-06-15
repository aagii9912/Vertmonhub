-- Vertmon Hub: Facebook USER access token хадгалах
-- Ads API (ads_read) нь Page token дээр биш, USER token дээр ажилладаг тул
-- /me/adaccounts, campaign insights зэрэгт user token хэрэгтэй. Encrypt-at-rest.

ALTER TABLE public.shops
    ADD COLUMN IF NOT EXISTS facebook_user_access_token TEXT,
    ADD COLUMN IF NOT EXISTS facebook_user_token_expires_at TIMESTAMPTZ;

COMMENT ON COLUMN public.shops.facebook_user_access_token IS 'Facebook USER access token (ads_read зэрэг user-level эрхэд). enc:v1: prefix-тэй шифрлэгдсэн.';
COMMENT ON COLUMN public.shops.facebook_user_token_expires_at IS 'Facebook user token дуусах огноо (≈60 хоног, дахин холбох дохио)';
