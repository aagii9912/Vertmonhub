-- Add facebook_page_username column on shops.
-- The /api/shop PATCH whitelist and /api/shop/disconnect already reference
-- this column, but no prior migration created it. Without the column the
-- PATCH that runs after a Facebook page is selected fails with
-- "column shops.facebook_page_username does not exist", silently dropping
-- the access token alongside it.
--
-- The username is also used by the AI comment auto-reply to build
-- m.me/{username} deep links (see lib/ai/comment-detector.ts).

ALTER TABLE public.shops
    ADD COLUMN IF NOT EXISTS facebook_page_username TEXT;

COMMENT ON COLUMN public.shops.facebook_page_username IS
    'Facebook Page-ийн @username — m.me/{username} deep link зориулалттай';
