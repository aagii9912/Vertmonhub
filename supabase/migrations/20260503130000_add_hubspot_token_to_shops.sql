-- Vertmon Hub: Store HubSpot Private App access token per shop

ALTER TABLE shops
  ADD COLUMN IF NOT EXISTS hubspot_access_token TEXT,
  ADD COLUMN IF NOT EXISTS hubspot_connected_at TIMESTAMPTZ;
