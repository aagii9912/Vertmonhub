-- ERP exports are immutable snapshots. They never mutate CRM contracts or cash ledgers.
CREATE TABLE IF NOT EXISTS erp_imports (
  id uuid PRIMARY KEY,
  shop_id uuid NOT NULL REFERENCES shops(id),
  source text NOT NULL CHECK (length(trim(source)) BETWEEN 1 AND 120),
  report_date date NOT NULL,
  file_name text NOT NULL,
  content_hash text NOT NULL,
  imported_by uuid NOT NULL REFERENCES auth.users(id),
  previous_id uuid,
  datasets jsonb NOT NULL CHECK (jsonb_typeof(datasets) = 'array'),
  summary jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  sequence bigint GENERATED ALWAYS AS IDENTITY,
  UNIQUE (shop_id, id),
  FOREIGN KEY (shop_id, previous_id) REFERENCES erp_imports(shop_id, id)
);
CREATE INDEX IF NOT EXISTS erp_import_source_idx ON erp_imports(shop_id, source, sequence DESC);
ALTER TABLE erp_imports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON erp_imports FROM anon, authenticated;
GRANT SELECT, INSERT ON erp_imports TO service_role;
GRANT USAGE, SELECT ON SEQUENCE erp_imports_sequence_seq TO service_role;

CREATE OR REPLACE FUNCTION commit_erp_import(
  p_id uuid, p_shop uuid, p_source text, p_date date, p_file text, p_hash text,
  p_user uuid, p_previous uuid, p_datasets jsonb, p_summary jsonb
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE latest erp_imports%ROWTYPE; existing erp_imports%ROWTYPE;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_shop::text || ':' || p_source, 0));
  SELECT * INTO existing FROM erp_imports WHERE id = p_id;
  IF FOUND THEN
    IF existing.shop_id = p_shop AND existing.source = p_source AND existing.content_hash = p_hash AND existing.report_date = p_date THEN RETURN existing.id; END IF;
    RAISE EXCEPTION 'Import request mismatch' USING ERRCODE = '23514';
  END IF;
  SELECT * INTO latest FROM erp_imports WHERE shop_id = p_shop AND source = p_source ORDER BY sequence DESC LIMIT 1;
  IF latest.id IS DISTINCT FROM p_previous THEN RAISE EXCEPTION 'ERP_IMPORT_STALE' USING ERRCODE = '40001'; END IF;
  IF p_date < latest.report_date THEN RAISE EXCEPTION 'Import date precedes latest snapshot' USING ERRCODE = '23514'; END IF;
  IF p_date = latest.report_date AND p_hash = latest.content_hash THEN RETURN latest.id; END IF;
  INSERT INTO erp_imports(id, shop_id, source, report_date, file_name, content_hash, imported_by, previous_id, datasets, summary)
    VALUES(p_id, p_shop, p_source, p_date, p_file, p_hash, p_user, p_previous, p_datasets, p_summary);
  RETURN p_id;
END $$;
REVOKE ALL ON FUNCTION commit_erp_import(uuid,uuid,text,date,text,text,uuid,uuid,jsonb,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION commit_erp_import(uuid,uuid,text,date,text,text,uuid,uuid,jsonb,jsonb) TO service_role;

-- Dedicated module: access to ordinary reports must not expose arbitrary ERP fields.
INSERT INTO role_permissions(role_id, module)
  SELECT id, 'erp-imports' FROM roles WHERE name IN ('super_admin', 'admin', 'sales_manager', 'finance_manager', 'accountant')
  ON CONFLICT DO NOTHING;
