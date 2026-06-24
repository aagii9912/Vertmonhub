-- Vertmon Hub: Facebook/Instagram токений хүчинтэй хугацааны хяналт
-- Long-lived token exchange-ийн дараа токен хэзээ дуусахыг хадгалж, дахин холбох
-- дохио болгоно. NULL = тодорхойгүй / дуусдаггүй (жишээ нь page token).

ALTER TABLE public.shops
    ADD COLUMN IF NOT EXISTS facebook_token_expires_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS instagram_token_expires_at TIMESTAMPTZ;

COMMENT ON COLUMN public.shops.facebook_token_expires_at IS 'Facebook Page access token дуусах огноо (NULL = тодорхойгүй/дуусдаггүй)';
COMMENT ON COLUMN public.shops.instagram_token_expires_at IS 'Instagram access token дуусах огноо (NULL = тодорхойгүй/дуусдаггүй)';
