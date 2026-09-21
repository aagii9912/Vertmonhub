-- Marketing attribution and monthly manager/project plans. No historical backfill.
ALTER TABLE marketing_campaigns
  ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES projects(id),
  ADD COLUMN IF NOT EXISTS marketing_owner_name text,
  ADD COLUMN IF NOT EXISTS channel text,
  ADD COLUMN IF NOT EXISTS external_campaign_id text,
  ADD COLUMN IF NOT EXISTS activity_kind text NOT NULL DEFAULT 'campaign' CHECK (activity_kind IN ('campaign', 'content')),
  ADD COLUMN IF NOT EXISTS completed_on date;

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS marketing_campaign_id uuid REFERENCES marketing_campaigns(id),
  ADD COLUMN IF NOT EXISTS marketing_owner_name text,
  ADD COLUMN IF NOT EXISTS marketing_channel text,
  ADD COLUMN IF NOT EXISTS sales_handoff_at timestamptz;

ALTER TABLE marketing_spend_entries
  ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES projects(id),
  ADD COLUMN IF NOT EXISTS marketing_owner_name text,
  ADD COLUMN IF NOT EXISTS marketing_campaign_id uuid REFERENCES marketing_campaigns(id);

CREATE TABLE IF NOT EXISTS marketing_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES shops(id),
  project_id uuid NOT NULL REFERENCES projects(id),
  marketing_owner_name text NOT NULL CHECK (length(trim(marketing_owner_name)) BETWEEN 1 AND 120),
  month date NOT NULL CHECK (extract(day FROM month) = 1),
  lead_target integer NOT NULL CHECK (lead_target >= 0),
  deal_target integer NOT NULL CHECK (deal_target >= 0),
  budget numeric(14,0) NOT NULL CHECK (budget >= 0),
  UNIQUE (shop_id, project_id, marketing_owner_name, month)
);
ALTER TABLE marketing_targets ENABLE ROW LEVEL SECURITY;
-- Server APIs enforce module permissions and shop membership; no direct browser writes.
REVOKE ALL ON marketing_targets FROM anon, authenticated;
GRANT ALL ON marketing_targets TO service_role;

CREATE INDEX IF NOT EXISTS leads_marketing_campaign_idx ON leads(marketing_campaign_id);
CREATE UNIQUE INDEX IF NOT EXISTS marketing_campaign_external_idx ON marketing_campaigns(shop_id, external_campaign_id) WHERE external_campaign_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS marketing_targets_shop_month_idx ON marketing_targets(shop_id, month);

-- Cross-shop references must be rejected even through the legacy generic marketing API.
CREATE OR REPLACE FUNCTION validate_marketing_scope() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE linked_project uuid; linked_shop uuid;
BEGIN
  IF NEW.project_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM projects WHERE id = NEW.project_id AND shop_id = NEW.shop_id
  ) THEN RAISE EXCEPTION 'Marketing project belongs to another shop' USING ERRCODE = '23514'; END IF;
  IF TG_TABLE_NAME IN ('leads', 'marketing_spend_entries') THEN
    IF NEW.marketing_campaign_id IS NOT NULL THEN
      SELECT shop_id, project_id INTO linked_shop, linked_project FROM marketing_campaigns WHERE id = NEW.marketing_campaign_id;
      IF linked_shop IS DISTINCT FROM NEW.shop_id OR linked_project IS DISTINCT FROM NEW.project_id THEN
        RAISE EXCEPTION 'Marketing activity shop/project mismatch' USING ERRCODE = '23514';
      END IF;
    END IF;
  END IF;
  IF TG_TABLE_NAME = 'marketing_campaigns' AND TG_OP = 'UPDATE' THEN
    IF NEW.project_id IS DISTINCT FROM OLD.project_id OR NEW.shop_id IS DISTINCT FROM OLD.shop_id THEN
      IF EXISTS (SELECT 1 FROM leads WHERE marketing_campaign_id = NEW.id)
        OR EXISTS (SELECT 1 FROM marketing_spend_entries WHERE marketing_campaign_id = NEW.id) THEN
        RAISE EXCEPTION 'Linked marketing activity cannot change project/shop' USING ERRCODE = '23514';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS marketing_campaign_scope ON marketing_campaigns;
CREATE TRIGGER marketing_campaign_scope BEFORE INSERT OR UPDATE OF shop_id, project_id ON marketing_campaigns
  FOR EACH ROW EXECUTE FUNCTION validate_marketing_scope();
DROP TRIGGER IF EXISTS marketing_target_scope ON marketing_targets;
CREATE TRIGGER marketing_target_scope BEFORE INSERT OR UPDATE ON marketing_targets
  FOR EACH ROW EXECUTE FUNCTION validate_marketing_scope();
DROP TRIGGER IF EXISTS marketing_spend_scope ON marketing_spend_entries;
CREATE TRIGGER marketing_spend_scope BEFORE INSERT OR UPDATE OF shop_id, project_id, marketing_campaign_id ON marketing_spend_entries
  FOR EACH ROW EXECUTE FUNCTION validate_marketing_scope();
DROP TRIGGER IF EXISTS marketing_lead_scope ON leads;
CREATE TRIGGER marketing_lead_scope BEFORE INSERT OR UPDATE OF shop_id, project_id, marketing_campaign_id ON leads
  FOR EACH ROW EXECUTE FUNCTION validate_marketing_scope();

-- Capture first assignment in every write path (UI, AI, import and claim).
-- Existing assigned rows stay unknown until explicitly confirmed; never invent history.
CREATE OR REPLACE FUNCTION stamp_sales_handoff() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.sales_handoff_at := CASE WHEN nullif(trim(NEW.sales_manager_name), '') IS NOT NULL THEN now() ELSE NULL END;
  ELSIF OLD.sales_handoff_at IS NOT NULL THEN
    NEW.sales_handoff_at := OLD.sales_handoff_at;
  ELSIF nullif(trim(NEW.sales_manager_name), '') IS NOT NULL AND
    (NEW.sales_manager_name IS DISTINCT FROM OLD.sales_manager_name OR NEW.sales_handoff_at IS NOT NULL) THEN
    NEW.sales_handoff_at := now();
  ELSE
    NEW.sales_handoff_at := NULL;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS leads_stamp_sales_handoff ON leads;
CREATE TRIGGER leads_stamp_sales_handoff BEFORE INSERT OR UPDATE ON leads
  FOR EACH ROW EXECUTE FUNCTION stamp_sales_handoff();

-- Exact Meta campaign mapping for future incoming leads. No fuzzy name matching,
-- no overwrite of explicit attribution, and no retroactive bulk updates.
CREATE OR REPLACE FUNCTION stamp_marketing_attribution() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE campaign marketing_campaigns%ROWTYPE;
BEGIN
  IF NEW.marketing_campaign_id IS NULL AND NEW.facebook_campaign_id IS NOT NULL THEN
    SELECT * INTO campaign FROM marketing_campaigns
      WHERE shop_id = NEW.shop_id AND external_campaign_id = NEW.facebook_campaign_id;
    IF FOUND AND campaign.project_id IS NOT NULL AND campaign.marketing_owner_name IS NOT NULL
      AND campaign.channel IS NOT NULL AND (NEW.project_id IS NULL OR NEW.project_id = campaign.project_id) THEN
      NEW.marketing_campaign_id := campaign.id;
      NEW.project_id := campaign.project_id;
      NEW.marketing_owner_name := campaign.marketing_owner_name;
      NEW.marketing_channel := campaign.channel;
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS leads_stamp_marketing ON leads;
CREATE TRIGGER leads_stamp_marketing BEFORE INSERT OR UPDATE OF facebook_campaign_id ON leads
  FOR EACH ROW EXECUTE FUNCTION stamp_marketing_attribution();
