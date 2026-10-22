-- Гэрээний жагсаалт (ERP-ийн «HUB» загвар, 16 багана) — импорт ба төлбөр хоцролт ₮ (эзэмшигчийн шийдвэр 2026-10-22).
--
-- • property_contracts.overdue_amount / overdue_as_of — «Төлбөр хоцролт» ₮, HUB/ERP файлын огноогоор.
--   overdue_days (cron-ийн хоногийн тооцоо)-оос тусдаа; cron бичихгүй. NULL = мэдэгдэхгүй, 0 = хоцролтгүй.
-- • contract_list_imports — импорт бүрийн бүртгэл (зөвхөн нэмэгдэнэ): хүсэлтийн ID + төлөвлөгөөний hash
--   (давтан илгээлт идемпотент), файлын огноо, нормчилсон мөрүүд (ирээдүйд «Нийт төлсөн дүн»-гийн зөрүүнд).
-- • property_units_with_buyer — цуцалсан, устгасан гэрээний худалдан авагчийг нэгжид харуулахгүй (дахин
--   зарагдсан/чөлөөлөгдсөн байрны шатар хуучин эзэмшигчийг харуулдаг байв). Багана, security_invoker, эрх хэвээр.
-- • import_contract_list — API-ийн тооцоолсон өөрчлөлтийг (update/insert) нэг гүйлгээнд: эхлээд бүгдийг шалгана
--   (юу ч бичихгүй; зөрчил байвал {ok:false, conflicts}), дараа нь бичиж, гэрээ бүрт data_audit_log, нэг
--   admin_audit_log, импортын мөр. Төлсөн дүн, үлдэгдэл, урьдчилгааны төлөлт, эзэмшигчийн нэр (customer_name),
--   байрны төлөвт ХҮРЭХГҮЙ; шинэ гэрээний paid_amount / balance нь NULL (баганын анхдагч 0 биш).
--
-- Эрх (contracts + erp-imports бичих, хязгааргүй хэрэглэгч, төсөл)-ийг API шалгана; функц хэлбэр, shop/төслийг
-- дахин шалгаад атомаар бичнэ. Additive, дахин ажиллуулж болно. Browser шууд хандахгүй: зөвхөн service_role.

ALTER TABLE public.property_contracts
    ADD COLUMN IF NOT EXISTS overdue_amount numeric(18, 2),
    ADD COLUMN IF NOT EXISTS overdue_as_of date;

DO $$ BEGIN
    ALTER TABLE public.property_contracts ADD CONSTRAINT chk_contracts_overdue_amount_nonneg
        CHECK (overdue_amount IS NULL OR overdue_amount >= 0) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- Шинэ багана бүгд NULL тул шалгалт шууд баталгаажна (дахин ажиллуулахад хоосон үйлдэл).
ALTER TABLE public.property_contracts VALIDATE CONSTRAINT chk_contracts_overdue_amount_nonneg;

COMMENT ON COLUMN public.property_contracts.overdue_amount IS
    'Төлбөр хоцролт ₮ — HUB/ERP файлын огноогоор (overdue_as_of); overdue_days-аас тусдаа, cron бичихгүй. NULL = мэдэгдэхгүй.';
COMMENT ON COLUMN public.property_contracts.overdue_as_of IS
    'overdue_amount-ийн эх файлын огноо (гэрээний жагсаалтын импортын report_date).';

CREATE TABLE IF NOT EXISTS public.contract_list_imports (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
    project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
    request_id text NOT NULL CHECK (char_length(request_id) BETWEEN 1 AND 100),
    plan_hash text NOT NULL CHECK (plan_hash ~ '^[0-9a-f]{64}$'),
    report_date date NOT NULL,
    file_name text CHECK (file_name IS NULL OR char_length(file_name) <= 255),
    row_count integer NOT NULL CHECK (row_count >= 0),
    summary jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(summary) = 'object'),
    -- Нормчилсон файлын мөрүүд (нэмэлт багана, ж: «Нийт төлсөн дүн» орно) — гэрээнд бичигдэхгүй, зөвхөн түүх.
    rows jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(rows) = 'array'),
    created_by uuid NOT NULL,
    created_by_name text CHECK (created_by_name IS NULL OR char_length(created_by_name) <= 255),
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT contract_list_imports_request_key UNIQUE (shop_id, request_id)
);

CREATE INDEX IF NOT EXISTS idx_contract_list_imports_shop_date
    ON public.contract_list_imports (shop_id, report_date DESC);

COMMENT ON TABLE public.contract_list_imports IS
    'Гэрээний жагсаалтын (HUB) импорт бүр (зөвхөн нэмэгдэнэ): файлын огноо, хүсэлтийн ID + төлөвлөгөөний hash, нормчилсон мөрүүд. Зөвхөн import_contract_list бичнэ.';

-- Append-only: service_role зөвхөн уншиж, нэмнэ (Supabase-ийн default privilege-ийг цуцална).
ALTER TABLE public.contract_list_imports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.contract_list_imports FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT ON TABLE public.contract_list_imports TO service_role;

-- Нэгж + худалдан авагч: 20260624120000-ийн тодорхойлолт + цуцалсан/устгасан гэрээг алгасна. CREATE OR REPLACE
-- нь эрхийг хадгалдаг; reloptions-ийг дахин тохируулдаг тул security_invoker-ийг ил заана (20260707130000).
CREATE OR REPLACE VIEW public.property_units_with_buyer WITH (security_invoker = on) AS
SELECT
    pu.*,
    pc.customer_name        AS buyer_name,
    pc.customer_registration AS buyer_registration,
    pc.total_price          AS contract_total_price,
    pc.paid_amount          AS contract_paid_amount,
    pc.price_per_sqm        AS contract_price_per_sqm,
    pc.contract_status      AS contract_status,
    pc.contract_date        AS contract_date,
    pc.order_date           AS contract_order_date
FROM public.property_units pu
LEFT JOIN LATERAL (
    SELECT customer_name, customer_registration, total_price, paid_amount,
           price_per_sqm, contract_status, contract_date, order_date
    FROM public.property_contracts c
    WHERE c.shop_id = pu.shop_id
      AND split_part(c.unit_label, ',', 1) = pu.code
      AND c.product_type = pu.category
      AND c.deleted_at IS NULL
      AND c.contract_status IS DISTINCT FROM 'cancelled'
    ORDER BY (c.contract_status = 'closed') DESC,
             (c.contract_status = 'active') DESC,
             c.contract_date DESC NULLS LAST
    LIMIT 1
) pc ON TRUE;

-- p_ops (API-ийн төлөвлөгөө, planContractListImport):
--   {"op":"update","id":uuid,"expect":{багана: одоогийн утга},"set":{багана: шинэ утга},"label":text,"review":bool}
--   {"op":"insert","fields":{багана: утга},"label":text,"review":bool}
-- update бүрийн set-ийн түлхүүр expect-д байж, одоогийн утгатай тэнцүү байх ёстой (өөр хүн энэ хооронд
-- өөрчилсөн бол зөрчил). Бүтцийн алдаа (зөвшөөрөгдөөгүй багана, буруу төрөл) = 22023.
CREATE OR REPLACE FUNCTION public.import_contract_list(
    p_shop_id uuid,
    p_project_id uuid,
    p_report_date date,
    p_file_name text,
    p_request_id text,
    p_plan_hash text,
    p_rows jsonb,
    p_ops jsonb,
    p_summary jsonb,
    p_allow_older boolean,
    p_actor uuid,
    p_actor_name text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
DECLARE
    -- Зөвхөн гэрээний нөхцөл, огноо, хоцролт, хоосон нэр/дугаар/менежер. Мөнгөн төлөлт, эзэмшигч, байр биш.
    v_update_cols constant text[] := ARRAY['order_date', 'contract_date', 'payment_condition', 'prepayment_condition',
        'prepayment_due', 'total_price', 'price_per_sqm', 'contracted_area', 'overdue_amount', 'overdue_as_of',
        'contract_status', 'customer_first_name', 'customer_last_name', 'contract_number', 'sales_manager'];
    v_insert_cols constant text[] := ARRAY['product_type', 'block_name', 'floor', 'unit_number', 'legacy_unit_number',
        'model', 'unit_label', 'contracted_area', 'price_per_sqm', 'total_price', 'prepayment_condition', 'prepayment_due',
        'payment_condition', 'order_date', 'contract_date', 'contract_status', 'customer_name', 'customer_first_name',
        'customer_last_name', 'overdue_amount', 'overdue_as_of', 'contract_number', 'sales_manager', 'notes'];
    v_numeric_cols constant text[] := ARRAY['total_price', 'price_per_sqm', 'contracted_area', 'prepayment_due', 'overdue_amount'];
    v_date_cols constant text[] := ARRAY['order_date', 'contract_date', 'overdue_as_of'];
    -- Төлсөн дүн мэдэгдэж байвал (үлдэгдэл = нийт − төлсөн) эдгээрийг импорт өөрчлөхгүй.
    v_money_cols constant text[] := ARRAY['total_price', 'price_per_sqm', 'prepayment_due', 'prepayment_condition'];
    v_today date := (now() AT TIME ZONE 'Asia/Ulaanbaatar')::date;
    v_stored public.contract_list_imports%ROWTYPE;
    v_latest date;
    v_older boolean := false;
    v_op jsonb;
    v_set jsonb;
    v_expect jsonb;
    v_fields jsonb;
    v_label text;
    v_key text;
    v_value jsonb;
    v_same boolean;
    v_id uuid;
    v_existing uuid;
    v_row public.property_contracts%ROWTYPE;
    v_new public.property_contracts%ROWTYPE;
    v_current jsonb;
    v_unit_key text;
    v_claimed text[] := ARRAY[]::text[];
    v_cancel_ids uuid[] := ARRAY[]::uuid[];
    v_conflicts jsonb := '[]'::jsonb;
    v_import_id uuid := gen_random_uuid();
    v_meta jsonb;
    v_changes jsonb;
    v_inserted integer := 0;
    v_updated integer := 0;
    v_summary jsonb;
BEGIN
    IF p_shop_id IS NULL OR p_project_id IS NULL OR p_report_date IS NULL OR p_actor IS NULL
        OR p_request_id IS NULL OR char_length(p_request_id) NOT BETWEEN 1 AND 100
        OR p_plan_hash IS NULL OR p_plan_hash !~ '^[0-9a-f]{64}$'
        OR char_length(coalesce(p_file_name, '')) > 255 OR char_length(coalesce(p_actor_name, '')) > 255
        OR jsonb_typeof(p_rows) IS DISTINCT FROM 'array' OR jsonb_typeof(p_ops) IS DISTINCT FROM 'array'
        OR jsonb_typeof(p_summary) IS DISTINCT FROM 'object'
        OR jsonb_array_length(p_rows) > 10000 OR jsonb_array_length(p_ops) > 10000 THEN
        RAISE EXCEPTION 'Гэрээний жагсаалтын импортын өгөгдөл буруу байна' USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.projects WHERE id = p_project_id AND shop_id = p_shop_id) THEN
        RAISE EXCEPTION 'Төсөл энэ байгууллагад харьяалагдахгүй байна' USING ERRCODE = '22023';
    END IF;
    IF p_report_date > v_today THEN
        RAISE EXCEPTION 'Файлын огноо өнөөдрөөс хойш байж болохгүй' USING ERRCODE = '22023';
    END IF;

    -- Бүтэц: зөвшөөрөгдсөн түлхүүр, багана, утгын төрөл. Бичихээс өмнө бүгдийг.
    FOR v_op IN SELECT value FROM jsonb_array_elements(p_ops) LOOP
        IF jsonb_typeof(v_op) IS DISTINCT FROM 'object'
            OR coalesce(jsonb_typeof(v_op->'label'), 'null') NOT IN ('string', 'null')
            OR coalesce(jsonb_typeof(v_op->'review'), 'boolean') <> 'boolean' THEN
            RAISE EXCEPTION 'Импортын өөрчлөлтийн бүтэц буруу байна' USING ERRCODE = '22023';
        END IF;
        IF v_op->>'op' = 'update' THEN
            IF EXISTS (SELECT 1 FROM jsonb_object_keys(v_op) AS k(key) WHERE key NOT IN ('op', 'id', 'expect', 'set', 'label', 'review'))
                OR jsonb_typeof(v_op->'id') IS DISTINCT FROM 'string'
                OR (v_op->>'id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                OR jsonb_typeof(v_op->'set') IS DISTINCT FROM 'object' OR v_op->'set' = '{}'::jsonb
                OR jsonb_typeof(v_op->'expect') IS DISTINCT FROM 'object' THEN
                RAISE EXCEPTION 'Импортын өөрчлөлтийн бүтэц буруу байна' USING ERRCODE = '22023';
            END IF;
            FOR v_key IN SELECT jsonb_object_keys(v_op->'set') LOOP
                IF NOT (v_key = ANY (v_update_cols)) THEN
                    RAISE EXCEPTION 'Импорт «%» талбарыг өөрчлөхгүй', v_key USING ERRCODE = '22023';
                END IF;
                IF NOT (v_op->'expect') ? v_key THEN
                    RAISE EXCEPTION 'Импортын өөрчлөлтөд «%» талбарын одоогийн утга алга', v_key USING ERRCODE = '22023';
                END IF;
            END LOOP;
            FOR v_key IN SELECT jsonb_object_keys(v_op->'expect') LOOP
                IF NOT (v_key = ANY (v_update_cols) OR v_key = 'customer_name') THEN
                    RAISE EXCEPTION 'Импортын өөрчлөлтийн бүтэц буруу байна' USING ERRCODE = '22023';
                END IF;
            END LOOP;
            IF ((v_op->'set') ? 'customer_first_name' OR (v_op->'set') ? 'customer_last_name')
                AND NOT (v_op->'expect') ? 'customer_name' THEN
                RAISE EXCEPTION 'Нэр бөглөхөд эзэмшигчийн одоогийн нэр шаардлагатай' USING ERRCODE = '22023';
            END IF;
        ELSIF v_op->>'op' = 'insert' THEN
            IF EXISTS (SELECT 1 FROM jsonb_object_keys(v_op) AS k(key) WHERE key NOT IN ('op', 'fields', 'label', 'review'))
                OR jsonb_typeof(v_op->'fields') IS DISTINCT FROM 'object' THEN
                RAISE EXCEPTION 'Импортын өөрчлөлтийн бүтэц буруу байна' USING ERRCODE = '22023';
            END IF;
            FOR v_key IN SELECT jsonb_object_keys(v_op->'fields') LOOP
                IF NOT (v_key = ANY (v_insert_cols)) THEN
                    RAISE EXCEPTION 'Импорт шинэ гэрээнд «%» талбар бичихгүй', v_key USING ERRCODE = '22023';
                END IF;
            END LOOP;
            IF jsonb_typeof(v_op->'fields'->'product_type') IS DISTINCT FROM 'string'
                OR (v_op->'fields'->>'product_type') NOT IN ('residential', 'parking', 'industry', 'commercial')
                OR jsonb_typeof(v_op->'fields'->'unit_label') IS DISTINCT FROM 'string' OR btrim(v_op->'fields'->>'unit_label') = ''
                OR jsonb_typeof(v_op->'fields'->'contract_status') IS DISTINCT FROM 'string'
                OR jsonb_typeof(v_op->'fields'->'order_date') IS DISTINCT FROM 'string' THEN
                RAISE EXCEPTION 'Шинэ гэрээнд төрөл, байрны код, төлөв, захиалгын огноо шаардлагатай' USING ERRCODE = '22023';
            END IF;
        ELSE
            RAISE EXCEPTION 'Импортын өөрчлөлтийн төрөл буруу байна' USING ERRCODE = '22023';
        END IF;
    END LOOP;
    -- Утгын төрөл: мөнгө/талбай сөрөг биш тоо, огноо YYYY-MM-DD, бусад текст; төлөв зөвхөн active/closed/cancelled.
    IF EXISTS (
        SELECT 1
        FROM jsonb_array_elements(p_ops) AS o(op),
            LATERAL jsonb_each(CASE WHEN o.op->>'op' = 'update' THEN o.op->'set' ELSE o.op->'fields' END) AS f(key, value)
        WHERE NOT CASE
            WHEN jsonb_typeof(f.value) = 'null' THEN f.key <> 'contract_status'
            WHEN f.key = ANY (v_numeric_cols) THEN
                CASE WHEN jsonb_typeof(f.value) = 'number' THEN (f.value #>> '{}')::numeric >= 0 ELSE false END
            WHEN f.key = ANY (v_date_cols) THEN
                jsonb_typeof(f.value) = 'string' AND (f.value #>> '{}') ~ '^\d{4}-\d{2}-\d{2}$'
            WHEN f.key = 'contract_status' THEN
                jsonb_typeof(f.value) = 'string' AND (f.value #>> '{}') IN ('active', 'closed', 'cancelled')
            ELSE jsonb_typeof(f.value) = 'string'
        END
    ) THEN
        RAISE EXCEPTION 'Импортын утгын төрөл буруу байна' USING ERRCODE = '22023';
    END IF;
    IF (SELECT count(*) <> count(DISTINCT lower(value->>'id')) FROM jsonb_array_elements(p_ops) WHERE value->>'op' = 'update') THEN
        RAISE EXCEPTION 'Нэг гэрээнд хоёр өөрчлөлт байна' USING ERRCODE = '22023';
    END IF;

    -- Давтан илгээлт: ижил төлөвлөгөө өмнөх үр дүнгээ буцаана, өөр төлөвлөгөөтэй бол татгалзана.
    SELECT * INTO v_stored FROM public.contract_list_imports WHERE shop_id = p_shop_id AND request_id = p_request_id;
    IF FOUND THEN
        IF v_stored.plan_hash IS DISTINCT FROM p_plan_hash THEN
            RAISE EXCEPTION 'Энэ хүсэлтээр өөр импорт бүртгэгдсэн байна' USING ERRCODE = '23505';
        END IF;
        RETURN jsonb_build_object('ok', true, 'replayed', true, 'import_id', v_stored.id,
            'inserted', coalesce(v_stored.summary->'inserted', '0'::jsonb), 'updated', coalesce(v_stored.summary->'updated', '0'::jsonb),
            'summary', v_stored.summary);
    END IF;

    -- Нэг төслийн зэрэгцээ импортыг дарааллуулна.
    PERFORM pg_advisory_xact_lock(hashtextextended('contract_list_import:' || p_shop_id::text, 0));
    SELECT * INTO v_stored FROM public.contract_list_imports WHERE shop_id = p_shop_id AND request_id = p_request_id;
    IF FOUND THEN
        IF v_stored.plan_hash IS DISTINCT FROM p_plan_hash THEN
            RAISE EXCEPTION 'Энэ хүсэлтээр өөр импорт бүртгэгдсэн байна' USING ERRCODE = '23505';
        END IF;
        RETURN jsonb_build_object('ok', true, 'replayed', true, 'import_id', v_stored.id,
            'inserted', coalesce(v_stored.summary->'inserted', '0'::jsonb), 'updated', coalesce(v_stored.summary->'updated', '0'::jsonb),
            'summary', v_stored.summary);
    END IF;

    -- Хуучин файл (сүүлийн импортоос өмнөх огноотой) статус, хоцролтыг буцааж болзошгүй — ил зөвшөөрөлтэй л.
    SELECT max(report_date) INTO v_latest FROM public.contract_list_imports WHERE shop_id = p_shop_id;
    IF v_latest IS NOT NULL AND v_latest > p_report_date THEN
        IF NOT coalesce(p_allow_older, false) THEN
            RETURN jsonb_build_object('ok', false, 'code', 'older_file', 'latest', v_latest);
        END IF;
        v_older := true;
    END IF;

    -- Энэ импортоор цуцлагдах гэрээ байрыг чөлөөлнө (байр эзэлсэн эсэхийг шалгахад).
    SELECT coalesce(array_agg((value->>'id')::uuid), ARRAY[]::uuid[]) INTO v_cancel_ids
    FROM jsonb_array_elements(p_ops)
    WHERE value->>'op' = 'update' AND value->'set'->>'contract_status' = 'cancelled';

    -- 1-р шат: шалгалт (юу ч бичихгүй). Гэрээг id-ийн дарааллаар түгжинэ.
    FOR v_op IN SELECT value FROM jsonb_array_elements(p_ops) WHERE value->>'op' = 'update' ORDER BY lower(value->>'id') LOOP
        v_id := (v_op->>'id')::uuid;
        v_set := v_op->'set';
        v_expect := v_op->'expect';
        v_label := v_op->>'label';
        SELECT * INTO v_row FROM public.property_contracts
        WHERE id = v_id AND shop_id = p_shop_id AND deleted_at IS NULL
        FOR UPDATE;
        IF NOT FOUND THEN
            v_conflicts := v_conflicts || jsonb_build_array(jsonb_build_object('id', v_id, 'label', v_label, 'code', 'missing'));
            CONTINUE;
        END IF;
        v_current := to_jsonb(v_row);
        -- Хуучирсан төлөвлөгөө: харсан утга одоогийнхтой таарахгүй (тоог тоогоор, огноог огноогоор).
        FOR v_key, v_value IN SELECT key, value FROM jsonb_each(v_expect) LOOP
            IF v_key = ANY (v_numeric_cols) THEN
                v_same := (v_current->>v_key)::numeric IS NOT DISTINCT FROM (v_value #>> '{}')::numeric;
            ELSIF v_key = ANY (v_date_cols) THEN
                v_same := (v_current->>v_key)::date IS NOT DISTINCT FROM (v_value #>> '{}')::date;
            ELSE
                v_same := (v_current->>v_key) IS NOT DISTINCT FROM (v_value #>> '{}');
            END IF;
            IF NOT v_same THEN
                v_conflicts := v_conflicts || jsonb_build_array(jsonb_build_object('id', v_id, 'label', v_label, 'code', 'changed',
                    'field', v_key, 'current', v_current->v_key, 'expected', v_value));
            END IF;
        END LOOP;
        IF v_row.paid_amount IS NOT NULL AND EXISTS (SELECT 1 FROM jsonb_object_keys(v_set) AS k(key) WHERE key = ANY (v_money_cols)) THEN
            v_conflicts := v_conflicts || jsonb_build_array(jsonb_build_object('id', v_id, 'label', v_label, 'code', 'paid_known'));
        END IF;
        -- Нэрийг зөвхөн хоосон байхад бөглөнө; «Гэрээ шилжүүлэх»-ээр солигдсон эзэмшигчид хүрэхгүй.
        IF (v_set ? 'customer_first_name' AND v_row.customer_first_name IS NOT NULL)
            OR (v_set ? 'customer_last_name' AND v_row.customer_last_name IS NOT NULL) THEN
            v_conflicts := v_conflicts || jsonb_build_array(jsonb_build_object('id', v_id, 'label', v_label, 'code', 'name_filled'));
        ELSIF (v_set ? 'customer_first_name' OR v_set ? 'customer_last_name')
            AND EXISTS (SELECT 1 FROM public.contract_transfers WHERE shop_id = p_shop_id AND contract_id = v_id) THEN
            v_conflicts := v_conflicts || jsonb_build_array(jsonb_build_object('id', v_id, 'label', v_label, 'code', 'holder_transferred'));
        END IF;
        IF (v_set ? 'contract_number' AND v_row.contract_number IS NOT NULL)
            OR (v_set ? 'sales_manager' AND v_row.sales_manager IS NOT NULL) THEN
            v_conflicts := v_conflicts || jsonb_build_array(jsonb_build_object('id', v_id, 'label', v_label, 'code', 'already_set'));
        END IF;
        IF v_set ? 'contract_status' THEN
            IF v_row.contract_status = 'transferred' THEN
                -- ERP-ийн «Тоот шилжсэн» гэрээний төлвийг импорт хэзээ ч өөрчлөхгүй.
                v_conflicts := v_conflicts || jsonb_build_array(jsonb_build_object('id', v_id, 'label', v_label, 'code', 'transferred'));
            ELSIF v_set->>'contract_status' = 'cancelled' AND v_row.contract_status IS DISTINCT FROM 'cancelled'
                AND (coalesce(v_row.paid_amount, 0) > 0 OR EXISTS (SELECT 1 FROM public.payment_schedules WHERE contract_id = v_id)) THEN
                v_conflicts := v_conflicts || jsonb_build_array(jsonb_build_object('id', v_id, 'label', v_label, 'code', 'has_payments'));
            ELSIF v_row.contract_status = 'cancelled' AND v_set->>'contract_status' IN ('active', 'closed') AND v_row.unit_label IS NOT NULL THEN
                -- Цуцалсан гэрээг сэргээхэд байр өөр амьд гэрээгүй байх ёстой.
                v_unit_key := v_row.product_type || '|' || v_row.unit_label;
                SELECT c.id INTO v_existing FROM public.property_contracts c
                WHERE c.shop_id = p_shop_id AND c.id <> v_id AND c.deleted_at IS NULL
                    AND c.contract_status IS DISTINCT FROM 'cancelled' AND NOT (c.id = ANY (v_cancel_ids))
                    AND c.product_type = v_row.product_type AND c.unit_label = v_row.unit_label
                LIMIT 1;
                IF v_existing IS NOT NULL OR v_unit_key = ANY (v_claimed) THEN
                    v_conflicts := v_conflicts || jsonb_build_array(jsonb_build_object('id', v_id, 'label', v_label,
                        'code', 'unit_taken', 'existing_id', v_existing));
                ELSE
                    v_claimed := array_append(v_claimed, v_unit_key);
                END IF;
            END IF;
        END IF;
    END LOOP;

    -- Нэг байранд хоёр амьд гэрээ үүсгэхгүй (цуцалсан бүртгэлийг нэмж болно).
    FOR v_op IN SELECT value FROM jsonb_array_elements(p_ops) WHERE value->>'op' = 'insert' LOOP
        v_fields := v_op->'fields';
        CONTINUE WHEN v_fields->>'contract_status' = 'cancelled';
        v_unit_key := (v_fields->>'product_type') || '|' || (v_fields->>'unit_label');
        SELECT c.id INTO v_existing FROM public.property_contracts c
        WHERE c.shop_id = p_shop_id AND c.deleted_at IS NULL AND c.contract_status IS DISTINCT FROM 'cancelled'
            AND NOT (c.id = ANY (v_cancel_ids))
            AND c.product_type = v_fields->>'product_type' AND c.unit_label = v_fields->>'unit_label'
        LIMIT 1;
        IF v_existing IS NOT NULL OR v_unit_key = ANY (v_claimed) THEN
            v_conflicts := v_conflicts || jsonb_build_array(jsonb_build_object('id', NULL, 'label', v_op->>'label',
                'code', 'unit_taken', 'existing_id', v_existing));
        ELSE
            v_claimed := array_append(v_claimed, v_unit_key);
        END IF;
    END LOOP;

    IF jsonb_array_length(v_conflicts) > 0 THEN
        RETURN jsonb_build_object('ok', false, 'conflicts', v_conflicts);
    END IF;

    -- 2-р шат: бичнэ. Цуцлалт (update) эхэлж, дараа нь шинэ гэрээ.
    v_meta := jsonb_build_object('source', 'contract_list_import', 'import_id', v_import_id, 'report_date', p_report_date);
    FOR v_op IN SELECT value FROM jsonb_array_elements(p_ops) WHERE value->>'op' = 'update' ORDER BY lower(value->>'id') LOOP
        v_id := (v_op->>'id')::uuid;
        v_set := v_op->'set';
        SELECT * INTO v_row FROM public.property_contracts WHERE id = v_id AND shop_id = p_shop_id;
        UPDATE public.property_contracts SET
            order_date = CASE WHEN v_set ? 'order_date' THEN (v_set->>'order_date')::date ELSE order_date END,
            contract_date = CASE WHEN v_set ? 'contract_date' THEN (v_set->>'contract_date')::date ELSE contract_date END,
            payment_condition = CASE WHEN v_set ? 'payment_condition' THEN v_set->>'payment_condition' ELSE payment_condition END,
            prepayment_condition = CASE WHEN v_set ? 'prepayment_condition' THEN v_set->>'prepayment_condition' ELSE prepayment_condition END,
            prepayment_due = CASE WHEN v_set ? 'prepayment_due' THEN (v_set->>'prepayment_due')::numeric ELSE prepayment_due END,
            total_price = CASE WHEN v_set ? 'total_price' THEN (v_set->>'total_price')::numeric ELSE total_price END,
            price_per_sqm = CASE WHEN v_set ? 'price_per_sqm' THEN (v_set->>'price_per_sqm')::numeric ELSE price_per_sqm END,
            contracted_area = CASE WHEN v_set ? 'contracted_area' THEN (v_set->>'contracted_area')::numeric ELSE contracted_area END,
            overdue_amount = CASE WHEN v_set ? 'overdue_amount' THEN (v_set->>'overdue_amount')::numeric ELSE overdue_amount END,
            overdue_as_of = CASE WHEN v_set ? 'overdue_as_of' THEN (v_set->>'overdue_as_of')::date ELSE overdue_as_of END,
            contract_status = CASE WHEN v_set ? 'contract_status' THEN v_set->>'contract_status' ELSE contract_status END,
            customer_first_name = CASE WHEN v_set ? 'customer_first_name' THEN v_set->>'customer_first_name' ELSE customer_first_name END,
            customer_last_name = CASE WHEN v_set ? 'customer_last_name' THEN v_set->>'customer_last_name' ELSE customer_last_name END,
            contract_number = CASE WHEN v_set ? 'contract_number' THEN v_set->>'contract_number' ELSE contract_number END,
            sales_manager = CASE WHEN v_set ? 'sales_manager' THEN v_set->>'sales_manager' ELSE sales_manager END,
            updated_at = now()
        WHERE id = v_id AND shop_id = p_shop_id
        RETURNING * INTO v_new;
        -- Аудит: PATCH-ийн хэлбэр {талбар: {from, to}}; импортын мэдээлэл «_meta»-д (талбар биш).
        SELECT coalesce(jsonb_object_agg(k.key, jsonb_build_object('from', to_jsonb(v_row)->k.key, 'to', to_jsonb(v_new)->k.key)), '{}'::jsonb)
        INTO v_changes
        FROM jsonb_object_keys(v_set) AS k(key)
        WHERE (to_jsonb(v_row)->k.key) IS DISTINCT FROM (to_jsonb(v_new)->k.key);
        INSERT INTO public.data_audit_log (shop_id, actor_id, entity, entity_id, action, changes)
        VALUES (p_shop_id, p_actor, 'contract', v_id::text, 'update', v_changes || jsonb_build_object('_meta',
            v_meta || jsonb_build_object('label', coalesce(v_op->>'label', v_new.unit_label), 'review', coalesce((v_op->>'review')::boolean, false))));
        v_updated := v_updated + 1;
    END LOOP;

    FOR v_op IN SELECT value FROM jsonb_array_elements(p_ops) WHERE value->>'op' = 'insert' LOOP
        v_fields := v_op->'fields';
        INSERT INTO public.property_contracts (
            shop_id, project_id, product_type, block_name, floor, unit_number, legacy_unit_number, model, unit_label,
            contracted_area, price_per_sqm, total_price, prepayment_condition, prepayment_due, payment_condition,
            order_date, contract_date, contract_status, customer_name, customer_first_name, customer_last_name,
            overdue_amount, overdue_as_of, contract_number, sales_manager, notes,
            paid_amount, balance, penalty_amount, overdue_days
        ) VALUES (
            p_shop_id, p_project_id, v_fields->>'product_type', v_fields->>'block_name', v_fields->>'floor',
            v_fields->>'unit_number', v_fields->>'legacy_unit_number', v_fields->>'model', v_fields->>'unit_label',
            (v_fields->>'contracted_area')::numeric, (v_fields->>'price_per_sqm')::numeric, (v_fields->>'total_price')::numeric,
            v_fields->>'prepayment_condition', (v_fields->>'prepayment_due')::numeric, v_fields->>'payment_condition',
            (v_fields->>'order_date')::date, (v_fields->>'contract_date')::date, v_fields->>'contract_status',
            v_fields->>'customer_name', v_fields->>'customer_first_name', v_fields->>'customer_last_name',
            (v_fields->>'overdue_amount')::numeric, (v_fields->>'overdue_as_of')::date,
            v_fields->>'contract_number', v_fields->>'sales_manager', v_fields->>'notes',
            -- Төлсөн дүн, үлдэгдэл, алданги, хоцорсон хоног мэдэгдэхгүй — 0 гэж таахгүй (баганын анхдагч 0).
            NULL, NULL, NULL, NULL
        ) RETURNING * INTO v_new;
        SELECT jsonb_build_object('name', v_new.unit_label)
            || coalesce(jsonb_object_agg(k.key, to_jsonb(v_new)->k.key) FILTER (WHERE k.key <> 'unit_label'), '{}'::jsonb)
        INTO v_changes
        FROM jsonb_object_keys(v_fields) AS k(key);
        INSERT INTO public.data_audit_log (shop_id, actor_id, entity, entity_id, action, changes)
        VALUES (p_shop_id, p_actor, 'contract', v_new.id::text, 'create', v_changes || jsonb_build_object('_meta',
            v_meta || jsonb_build_object('label', coalesce(v_op->>'label', v_new.unit_label), 'review', coalesce((v_op->>'review')::boolean, false))));
        v_inserted := v_inserted + 1;
    END LOOP;

    v_summary := p_summary || jsonb_build_object('inserted', v_inserted, 'updated', v_updated)
        || CASE WHEN v_older THEN jsonb_build_object('older_than', v_latest) ELSE '{}'::jsonb END;
    INSERT INTO public.contract_list_imports (id, shop_id, project_id, request_id, plan_hash, report_date, file_name,
        row_count, summary, rows, created_by, created_by_name)
    VALUES (v_import_id, p_shop_id, p_project_id, p_request_id, p_plan_hash, p_report_date, nullif(btrim(p_file_name), ''),
        jsonb_array_length(p_rows), v_summary, p_rows, p_actor, nullif(btrim(p_actor_name), ''));
    -- admin_audit_log-д shop_id багана байхгүй (20260608250000) — meta-д.
    INSERT INTO public.admin_audit_log (actor_id, action, target_id, meta)
    VALUES (p_actor, 'contracts.list_import', v_import_id::text, jsonb_build_object(
        'shop_id', p_shop_id, 'project_id', p_project_id, 'report_date', p_report_date, 'file_name', p_file_name,
        'request_id', p_request_id, 'summary', v_summary));

    RETURN jsonb_build_object('ok', true, 'replayed', false, 'import_id', v_import_id,
        'inserted', v_inserted, 'updated', v_updated, 'summary', v_summary);
END;
$$;

REVOKE ALL ON FUNCTION public.import_contract_list(uuid, uuid, date, text, text, text, jsonb, jsonb, jsonb, boolean, uuid, text)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.import_contract_list(uuid, uuid, date, text, text, text, jsonb, jsonb, jsonb, boolean, uuid, text)
    TO service_role;
COMMENT ON FUNCTION public.import_contract_list(uuid, uuid, date, text, text, text, jsonb, jsonb, jsonb, boolean, uuid, text)
    IS 'Гэрээний жагсаалтын (HUB) импорт: шалгаад (зөрчилтэй бол юу ч бичихгүй) гэрээний нөхцөл, огноо, хоцролтыг шинэчилж, шинэ гэрээг төлсөн дүнгүй (NULL) нэмнэ; аудит, импортын бүртгэл нэг гүйлгээнд. Зөвхөн service-role API.';
