-- Drops the unused contract-count pair from the unmerged feat/meeting-prep-bundle (20261013150000).
-- The live pair is contract_count_target / manual_contract_count_actual (20261022120000).
-- Refuses to run while the old pair holds any value (columns or block cells) or while
-- save_team_monthly_sales is still the version that writes it. Idempotent once dropped.
DO $$
DECLARE
    v_values integer;
BEGIN
    IF to_regprocedure('public.save_team_monthly_sales(uuid,integer,jsonb,uuid)') IS NOT NULL
        AND position('target_count' in pg_get_functiondef('public.save_team_monthly_sales(uuid,integer,jsonb,uuid)'::regprocedure)) > 0 THEN
        RAISE EXCEPTION 'save_team_monthly_sales still writes target_count; apply 20261022120000 first';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public'
        AND table_name = 'team_sales_targets' AND column_name IN ('target_count', 'manual_contract_actual_count')) THEN
        EXECUTE $q$SELECT count(*) FROM public.team_sales_targets
            WHERE to_jsonb(team_sales_targets)->>'target_count' IS NOT NULL
               OR to_jsonb(team_sales_targets)->>'manual_contract_actual_count' IS NOT NULL$q$ INTO v_values;
        IF v_values > 0 THEN
            RAISE EXCEPTION 'target_count / manual_contract_actual_count hold values in % rows; move them to contract_count_target / manual_contract_count_actual first', v_values;
        END IF;
    END IF;
    SELECT count(*) INTO v_values FROM public.team_sales_targets AS t, jsonb_each(t.block_amounts) AS cells(block, value)
        WHERE jsonb_typeof(cells.value) = 'object' AND cells.value ?| ARRAY['target_count', 'manual_contract_actual_count'];
    IF v_values > 0 THEN
        RAISE EXCEPTION 'block_amounts holds target_count / manual_contract_actual_count in % block cells; move them first', v_values;
    END IF;
END;
$$;

ALTER TABLE public.team_sales_targets DROP CONSTRAINT IF EXISTS team_monthly_sales_counts;
ALTER TABLE public.team_sales_targets
    DROP COLUMN IF EXISTS target_count,
    DROP COLUMN IF EXISTS manual_contract_actual_count;

COMMENT ON COLUMN public.team_sales_targets.block_amounts IS 'Б1, Б2, зогсоолын сарын гэрээний тоо (contract_count_target, manual_contract_count_actual), дүн, мөнгөн урсгалын төлөвлөгөө/гүйцэтгэл; байхгүй талбар = задаргаа оруулаагүй, NULL = хоосон, 0 = оруулсан утга';
NOTIFY pgrst, 'reload schema';
