-- Гэрээ шилжүүлэх (шинэ эзэмшигч) ба эзэмшигчийн нэр засах.
-- Гэрээний мөр (property_contracts.id) хэвээр үлдэнэ: зөвхөн эзэмшигчийн snapshot
-- (customer_* баганууд, customer_id) солигдож, өмнөх/шинэ эзэмшигч append-only
-- contract_transfers түүхэнд хадгалагдана. Төлсөн дүн, үлдэгдэл, төлбөрийн график,
-- менежер, гэрээний огноо, лид, тоот, гэрээний дугаар, төсөл ӨӨРЧЛӨГДӨХГҮЙ —
-- борлуулалт, KPI, маркетингийн attribution анхны гэрээгээр хэвээр.
-- transfer_contract RPC нь гэрээг төлбөрийн RPC-тэй ижил дарааллаар (эхэлж FOR UPDATE)
-- түгжиж, түүх, эзэмшигч, шинэ харилцагч, лидийн timeline, data_audit_log-ийг нэг
-- гүйлгээнд бичнэ. Давхар илгээлт (shop_id, client_request_id)-аар идемпотент.
-- Additive: шинэ хүснэгт + функц; одоогийн өгөгдлийг өөрчлөхгүй, backfill хийхгүй.

CREATE TABLE IF NOT EXISTS public.contract_transfers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
    contract_id uuid NOT NULL REFERENCES public.property_contracts(id) ON DELETE CASCADE,
    -- transfer = өөр хүнд шилжүүлэх, rename = ижил хүний нэр засвар
    kind text NOT NULL CHECK (kind IN ('transfer', 'rename')),
    effective_date date NOT NULL,
    from_customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
    from_customer_name text,
    from_first_name text,
    from_last_name text,
    from_registration text,
    from_phone text,
    from_mobile text,
    to_customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
    to_customer_name text NOT NULL CHECK (length(btrim(to_customer_name)) BETWEEN 1 AND 255),
    to_first_name text,
    to_last_name text,
    to_registration text,
    to_phone text,
    to_mobile text,
    -- Шилжүүлэх үеийн мөнгөн дүнгийн хуулбар (зөвхөн түүх; гэрээний дүнг өөрчлөхгүй)
    total_price_at_transfer numeric(18, 2),
    paid_amount_at_transfer numeric(18, 2),
    balance_at_transfer numeric(18, 2),
    reason text CHECK (reason IS NULL OR length(reason) <= 2000),
    -- auth.users FK-гүй (sales_kpi_months-ийн адил); нэр нь тухайн үеийн snapshot
    created_by uuid,
    created_by_name text,
    client_request_id uuid NOT NULL,
    client_request_payload jsonb NOT NULL CHECK (jsonb_typeof(client_request_payload) = 'object'),
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT uq_contract_transfers_request UNIQUE (shop_id, client_request_id)
);

CREATE INDEX IF NOT EXISTS idx_contract_transfers_contract
    ON public.contract_transfers (contract_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_contract_transfers_shop
    ON public.contract_transfers (shop_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_contract_transfers_from_customer
    ON public.contract_transfers (from_customer_id) WHERE from_customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contract_transfers_to_customer
    ON public.contract_transfers (to_customer_id) WHERE to_customer_id IS NOT NULL;

COMMENT ON TABLE public.contract_transfers IS
    'Гэрээний эзэмшигчийн өөрчлөлтийн түүх (append-only): шилжүүлэг ба нэр засвар. Зөвхөн transfer_contract RPC бичнэ.';

-- Browser хандалтгүй. service_role зөвхөн уншиж, нэмнэ; харилцагч нэгтгэхэд (mergeCustomers)
-- зөвхөн customer id-уудыг дахин холбоно. Түүхийг засах/устгах эрх байхгүй.
ALTER TABLE public.contract_transfers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.contract_transfers FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT ON TABLE public.contract_transfers TO service_role;
GRANT UPDATE (from_customer_id, to_customer_id) ON TABLE public.contract_transfers TO service_role;

CREATE OR REPLACE FUNCTION public.transfer_contract(
    p_shop_id uuid,
    p_contract_id uuid,
    p_payload jsonb,
    p_request_id uuid,
    p_actor uuid,
    p_actor_name text,
    -- Хязгаарлагдсан борлуулалтын менежер: зөвхөн өөрийн (sales_manager) гэрээ. NULL = байгууллагын эрх.
    p_scope_manager text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public
AS $$
DECLARE
    v_contract public.property_contracts%ROWTYPE;
    v_prev public.contract_transfers%ROWTYPE;
    v_transfer public.contract_transfers%ROWTYPE;
    v_today date := (now() AT TIME ZONE 'Asia/Ulaanbaatar')::date;
    v_kind text;
    v_date date;
    v_name text;
    v_first text;
    v_last text;
    v_reg text;
    v_phone text;
    v_mobile text;
    v_phone_norm text;
    v_reason text;
    v_to_customer uuid;
    v_customer_created boolean := false;
    v_label text;
BEGIN
    IF p_shop_id IS NULL OR p_contract_id IS NULL OR p_request_id IS NULL OR p_actor IS NULL
       OR p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
        RAISE EXCEPTION 'Гэрээ шилжүүлэх өгөгдөл буруу байна' USING ERRCODE = '22023';
    END IF;
    -- Зөвхөн зөвшөөрөгдсөн түлхүүр, текст эсвэл null утга (мөнгө, менежер, огноо, лид орж болохгүй).
    IF EXISTS (SELECT 1 FROM jsonb_each(p_payload) AS fields(key, value)
        WHERE key NOT IN ('kind', 'customer_name', 'customer_first_name', 'customer_last_name', 'customer_registration',
                          'customer_phone', 'customer_mobile', 'phone_normalized', 'effective_date', 'reason', 'expected_customer_name')
           OR jsonb_typeof(value) NOT IN ('string', 'null')) THEN
        RAISE EXCEPTION 'Гэрээ шилжүүлэхэд зөвшөөрөгдөөгүй талбар байна' USING ERRCODE = '22023';
    END IF;

    -- Давтан илгээлт: ижил хүсэлт өмнөх үр дүнгээ буцаана, өөр агуулгатай бол татгалзана.
    SELECT * INTO v_prev FROM public.contract_transfers
    WHERE shop_id = p_shop_id AND client_request_id = p_request_id;
    IF FOUND THEN
        IF v_prev.contract_id <> p_contract_id OR v_prev.client_request_payload IS DISTINCT FROM p_payload THEN
            RAISE EXCEPTION 'Энэ хүсэлтээр өөр шилжүүлэг бүртгэгдсэн байна' USING ERRCODE = '23505';
        END IF;
        RETURN to_jsonb(v_prev) || jsonb_build_object('replayed', true, 'customer_created', false);
    END IF;

    -- Гэрээг ЭХЛЭЖ түгжинэ (mutate_contract_payment-тэй ижил) — зэрэгцээ төлбөр, шилжүүлэг дараалалд орно.
    SELECT * INTO v_contract FROM public.property_contracts
    WHERE id = p_contract_id AND shop_id = p_shop_id AND deleted_at IS NULL
    FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Гэрээ олдсонгүй' USING ERRCODE = 'P0002';
    END IF;
    -- Менежерийн хүрээг түгжээний дотор шалгана (зэрэгцээ хариуцагч солих үйлдэл түрүүлж болно).
    IF p_scope_manager IS NOT NULL AND v_contract.sales_manager IS DISTINCT FROM p_scope_manager THEN
        RAISE EXCEPTION 'Зөвхөн өөрийн борлуулсан гэрээг шилжүүлэх боломжтой' USING ERRCODE = '42501';
    END IF;
    -- Түгжээ хүлээх хооронд ижил хүсэлт бүртгэгдсэн бол түүнийг буцаана.
    SELECT * INTO v_prev FROM public.contract_transfers
    WHERE shop_id = p_shop_id AND client_request_id = p_request_id;
    IF FOUND THEN
        IF v_prev.contract_id <> p_contract_id OR v_prev.client_request_payload IS DISTINCT FROM p_payload THEN
            RAISE EXCEPTION 'Энэ хүсэлтээр өөр шилжүүлэг бүртгэгдсэн байна' USING ERRCODE = '23505';
        END IF;
        RETURN to_jsonb(v_prev) || jsonb_build_object('replayed', true, 'customer_created', false);
    END IF;
    -- ERP-ийн 'transferred' (тоот шилжсэн) болон цуцалсан гэрээг шилжүүлэхгүй.
    IF v_contract.contract_status IS NULL OR v_contract.contract_status NOT IN ('active', 'closed') THEN
        RAISE EXCEPTION 'Зөвхөн идэвхтэй эсвэл хаагдсан гэрээг шилжүүлнэ' USING ERRCODE = '22023';
    END IF;
    -- Хуучирсан цонх: харсан эзэмшигч одоогийнхтой таарахгүй бол дахин уншуулна.
    IF p_payload ? 'expected_customer_name'
       AND (p_payload->>'expected_customer_name') IS DISTINCT FROM v_contract.customer_name THEN
        RAISE EXCEPTION 'Гэрээний эзэмшигч өөрчлөгдсөн байна. Хуудсаа шинэчлээд дахин оролдоно уу' USING ERRCODE = '40001';
    END IF;

    v_kind := p_payload->>'kind';
    IF v_kind IS NULL OR v_kind NOT IN ('transfer', 'rename') THEN
        RAISE EXCEPTION 'Шилжүүлгийн төрлийг сонгоно уу' USING ERRCODE = '22023';
    END IF;

    v_name := nullif(btrim(p_payload->>'customer_name'), '');
    IF v_name IS NULL OR length(v_name) > 255 THEN
        RAISE EXCEPTION 'Шинэ эзэмшигчийн нэрийг оруулна уу' USING ERRCODE = '22023';
    END IF;
    -- transfer: шинэ хүний мэдээлэл бүрэн солигдоно (өгөөгүй талбар хоосон).
    -- rename: өгсөн талбар л солигдоно, бусад нь (регистр, утас) хэвээр.
    IF v_kind = 'transfer' THEN
        v_first := nullif(btrim(p_payload->>'customer_first_name'), '');
        v_last := nullif(btrim(p_payload->>'customer_last_name'), '');
        v_reg := nullif(btrim(p_payload->>'customer_registration'), '');
        v_phone := nullif(btrim(p_payload->>'customer_phone'), '');
        v_mobile := nullif(btrim(p_payload->>'customer_mobile'), '');
    ELSE
        v_first := CASE WHEN p_payload ? 'customer_first_name' THEN nullif(btrim(p_payload->>'customer_first_name'), '') ELSE v_contract.customer_first_name END;
        v_last := CASE WHEN p_payload ? 'customer_last_name' THEN nullif(btrim(p_payload->>'customer_last_name'), '') ELSE v_contract.customer_last_name END;
        v_reg := CASE WHEN p_payload ? 'customer_registration' THEN nullif(btrim(p_payload->>'customer_registration'), '') ELSE v_contract.customer_registration END;
        v_phone := CASE WHEN p_payload ? 'customer_phone' THEN nullif(btrim(p_payload->>'customer_phone'), '') ELSE v_contract.customer_phone END;
        v_mobile := CASE WHEN p_payload ? 'customer_mobile' THEN nullif(btrim(p_payload->>'customer_mobile'), '') ELSE v_contract.customer_mobile END;
    END IF;
    v_phone_norm := nullif(p_payload->>'phone_normalized', '');
    v_reason := nullif(btrim(p_payload->>'reason'), '');
    IF length(v_first) > 100 OR length(v_last) > 100 OR length(v_phone) > 50 OR length(v_mobile) > 50
       OR (v_phone_norm IS NOT NULL AND v_phone_norm !~ '^\d{1,20}$') OR length(v_reason) > 2000 THEN
        RAISE EXCEPTION 'Эзэмшигчийн нэр, утас, шалтгааны уртыг шалгана уу' USING ERRCODE = '22023';
    END IF;
    IF (p_payload ? 'customer_registration' OR v_kind = 'transfer')
       AND v_reg IS NOT NULL AND (length(v_reg) NOT BETWEEN 4 AND 20 OR v_reg ~ '\s') THEN
        RAISE EXCEPTION 'Регистрийн дугаар 4–20 тэмдэгт, зайгүй байна' USING ERRCODE = '22023';
    END IF;
    IF v_kind = 'transfer' THEN
        IF v_reg IS NULL OR v_reason IS NULL THEN
            RAISE EXCEPTION 'Өөр хүнд шилжүүлэхэд шинэ эзэмшигчийн регистр, шалтгааныг заавал оруулна' USING ERRCODE = '22023';
        END IF;
        IF upper(regexp_replace(coalesce(v_contract.customer_registration, ''), '\s', '', 'g')) = upper(v_reg) THEN
            RAISE EXCEPTION 'Регистр одоогийн эзэмшигчийнхтэй ижил байна. Ижил хүний нэрийг засах бол «Нэр засах»-ыг сонгоно уу' USING ERRCODE = '22023';
        END IF;
    END IF;
    IF v_name IS NOT DISTINCT FROM v_contract.customer_name
       AND v_first IS NOT DISTINCT FROM v_contract.customer_first_name
       AND v_last IS NOT DISTINCT FROM v_contract.customer_last_name
       AND v_reg IS NOT DISTINCT FROM v_contract.customer_registration
       AND v_phone IS NOT DISTINCT FROM v_contract.customer_phone
       AND v_mobile IS NOT DISTINCT FROM v_contract.customer_mobile THEN
        RAISE EXCEPTION 'Эзэмшигчийн мэдээлэл өөрчлөгдөөгүй байна' USING ERRCODE = '22023';
    END IF;

    -- Шилжүүлсэн огноо: YYYY-MM-DD, гэрээний огнооноос хойш, өнөөдрөөс (УБ) өмнө. Анхдагч нь өнөөдөр.
    IF p_payload->>'effective_date' IS NULL THEN
        v_date := v_today;
    ELSE
        IF p_payload->>'effective_date' !~ '^\d{4}-\d{2}-\d{2}$' THEN
            RAISE EXCEPTION 'Шилжүүлсэн огноо YYYY-MM-DD хэлбэртэй байна' USING ERRCODE = '22023';
        END IF;
        BEGIN
            v_date := (p_payload->>'effective_date')::date;
        EXCEPTION WHEN others THEN
            RAISE EXCEPTION 'Шилжүүлсэн огноо буруу байна' USING ERRCODE = '22023';
        END;
    END IF;
    IF v_date > v_today OR (v_contract.contract_date IS NOT NULL AND v_date < v_contract.contract_date) THEN
        RAISE EXCEPTION 'Шилжүүлсэн огноо гэрээний огнооноос хойш, өнөөдрөөс хэтрэхгүй байна' USING ERRCODE = '22023';
    END IF;

    -- Шинэ эзэмшигчийн харилцагч: утсаар (өмнөх эзэмшигчээс бусад) олдвол холбоно, эс бөгөөс үүсгэнэ.
    -- Нэр засварт харилцагчийн холбоос хэвээр (харилцагчийн нэрийг автоматаар солихгүй).
    IF v_kind = 'transfer' THEN
        IF v_phone_norm IS NOT NULL THEN
            SELECT id INTO v_to_customer FROM public.customers
            WHERE shop_id = p_shop_id AND phone_normalized = v_phone_norm AND deleted_at IS NULL
              AND id IS DISTINCT FROM v_contract.customer_id
            ORDER BY created_at, id
            LIMIT 1;
        END IF;
        IF v_to_customer IS NULL THEN
            INSERT INTO public.customers (shop_id, name, phone, phone_normalized, tags)
            VALUES (p_shop_id, v_name, coalesce(v_phone, v_mobile), v_phone_norm, '["source:contract_transfer"]'::jsonb)
            RETURNING id INTO v_to_customer;
            v_customer_created := true;
        END IF;
    ELSE
        v_to_customer := v_contract.customer_id;
    END IF;

    INSERT INTO public.contract_transfers (
        shop_id, contract_id, kind, effective_date,
        from_customer_id, from_customer_name, from_first_name, from_last_name, from_registration, from_phone, from_mobile,
        to_customer_id, to_customer_name, to_first_name, to_last_name, to_registration, to_phone, to_mobile,
        total_price_at_transfer, paid_amount_at_transfer, balance_at_transfer, reason,
        created_by, created_by_name, client_request_id, client_request_payload
    ) VALUES (
        p_shop_id, p_contract_id, v_kind, v_date,
        v_contract.customer_id, v_contract.customer_name, v_contract.customer_first_name, v_contract.customer_last_name,
        v_contract.customer_registration, v_contract.customer_phone, v_contract.customer_mobile,
        v_to_customer, v_name, v_first, v_last, v_reg, v_phone, v_mobile,
        v_contract.total_price, v_contract.paid_amount, v_contract.balance, v_reason,
        p_actor, nullif(btrim(p_actor_name), ''), p_request_id, p_payload
    ) RETURNING * INTO v_transfer;

    -- Зөвхөн эзэмшигчийн snapshot. Мөнгө, менежер, огноо, лид, тоот, дугаар, төсөлд хүрэхгүй.
    UPDATE public.property_contracts SET
        customer_name = v_name,
        customer_first_name = v_first,
        customer_last_name = v_last,
        customer_registration = v_reg,
        customer_phone = v_phone,
        customer_mobile = v_mobile,
        customer_id = v_to_customer,
        updated_at = now()
    WHERE id = p_contract_id AND shop_id = p_shop_id;

    v_label := coalesce(nullif(v_contract.contract_number, ''), nullif(v_contract.unit_label, ''), 'гэрээ');
    IF v_contract.lead_id IS NOT NULL THEN
        INSERT INTO public.lead_activities (shop_id, lead_id, type, content, meta, created_by, created_by_name)
        VALUES (
            p_shop_id, v_contract.lead_id, 'contract',
            CASE WHEN v_kind = 'transfer'
                THEN format('Гэрээ %s шилжүүлэв: %s → %s', v_label, coalesce(v_contract.customer_name, '—'), v_name)
                ELSE format('Гэрээ %s эзэмшигчийн нэр засав: %s → %s', v_label, coalesce(v_contract.customer_name, '—'), v_name)
            END,
            jsonb_build_object('transfer_id', v_transfer.id, 'contract_id', p_contract_id, 'kind', v_kind,
                'from', v_contract.customer_name, 'to', v_name, 'effective_date', v_date),
            p_actor, v_transfer.created_by_name
        );
    END IF;

    IF v_customer_created THEN
        INSERT INTO public.data_audit_log (shop_id, actor_id, entity, entity_id, action, changes)
        VALUES (p_shop_id, p_actor, 'customer', v_to_customer::text, 'create',
            jsonb_build_object('name', v_name, 'source', 'contract_transfer', 'contract_id', p_contract_id));
    END IF;
    INSERT INTO public.data_audit_log (shop_id, actor_id, entity, entity_id, action, changes)
    VALUES (p_shop_id, p_actor, 'contract', p_contract_id::text, 'transfer', jsonb_build_object(
        'transfer_id', v_transfer.id, 'kind', v_kind, 'effective_date', v_date,
        'from', jsonb_build_object('customer_id', v_contract.customer_id, 'customer_name', v_contract.customer_name,
            'customer_registration', v_contract.customer_registration, 'customer_phone', v_contract.customer_phone),
        'to', jsonb_build_object('customer_id', v_to_customer, 'customer_name', v_name,
            'customer_registration', v_reg, 'customer_phone', v_phone)));

    RETURN to_jsonb(v_transfer) || jsonb_build_object('replayed', false, 'customer_created', v_customer_created);
END;
$$;

REVOKE ALL ON FUNCTION public.transfer_contract(uuid, uuid, jsonb, uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.transfer_contract(uuid, uuid, jsonb, uuid, uuid, text, text) TO service_role;
COMMENT ON FUNCTION public.transfer_contract(uuid, uuid, jsonb, uuid, uuid, text, text)
    IS 'Гэрээний эзэмшигчийг солих (шилжүүлэг/нэр засвар): түүх, харилцагч, лидийн timeline, аудит нэг гүйлгээнд; мөнгө, менежер, огноо хэвээр. Зөвхөн service-role API.';
