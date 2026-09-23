-- Ads reporting uses its own Meta app and user token. Keep the Page/DM token untouched.
ALTER TABLE public.shops
    ADD COLUMN IF NOT EXISTS meta_ads_user_access_token TEXT,
    ADD COLUMN IF NOT EXISTS meta_ads_user_token_expires_at TIMESTAMPTZ;

COMMENT ON COLUMN public.shops.meta_ads_user_access_token IS 'Encrypted ads_read user token issued to the dedicated Meta Ads app.';
COMMENT ON COLUMN public.shops.meta_ads_user_token_expires_at IS 'Expiry reported by Meta for the dedicated Ads app user token.';
