-- Schedule, contract totals and finance receipt commit together. No historical data rewrite.
-- Apply before deploying PaymentService; its writes return 503 until this RPC is available.
ALTER TABLE public.payment_schedules ADD COLUMN IF NOT EXISTS client_request_id uuid;
ALTER TABLE public.payment_schedules ADD COLUMN IF NOT EXISTS client_request_payload jsonb;
-- Classification is explicit. Imported historical balances do not prove dated cash receipts.
ALTER TABLE public.payment_schedules ADD COLUMN IF NOT EXISTS receipt_kind text
    CHECK (receipt_kind IN ('advance', 'installment', 'other'));
ALTER TABLE public.finance_transactions ADD COLUMN IF NOT EXISTS receipt_kind text
    CHECK (receipt_kind IN ('advance', 'installment', 'other'));
CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_schedules_shop_request
    ON public.payment_schedules (shop_id, client_request_id) WHERE client_request_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.mutate_contract_payment(
    p_shop_id uuid,
    p_contract_id uuid,
    p_payment_id uuid,
    p_payload jsonb,
    p_request_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_contract public.property_contracts%ROWTYPE;
    v_prev public.payment_schedules%ROWTYPE;
    v_next public.payment_schedules%ROWTYPE;
    v_contract_id uuid := p_contract_id;
    v_delta numeric;
    v_status text;
BEGIN
    IF p_shop_id IS NULL OR p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
        RAISE EXCEPTION 'Буруу төлбөрийн өгөгдөл' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (SELECT 1 FROM jsonb_object_keys(p_payload) AS k(key)
        WHERE key NOT IN ('installment_number', 'label', 'due_date', 'amount', 'paid_amount', 'paid_date', 'payment_method', 'receipt_kind', 'notes', 'status')) THEN
        RAISE EXCEPTION 'Зөвшөөрөгдөөгүй төлбөрийн талбар' USING ERRCODE = '22023';
    END IF;
    IF (p_payload ? 'due_date' AND p_payload->>'due_date' !~ '^\d{4}-\d{2}-\d{2}$')
       OR (p_payload ? 'paid_date' AND p_payload->>'paid_date' !~ '^\d{4}-\d{2}-\d{2}$') THEN
        RAISE EXCEPTION 'Огноо YYYY-MM-DD форматтай байх ёстой' USING ERRCODE = '22023';
    END IF;
    IF p_payment_id IS NULL AND (p_request_id IS NULL OR v_contract_id IS NULL) THEN
        RAISE EXCEPTION 'Гэрээ болон хүсэлтийн UUID шаардлагатай' USING ERRCODE = '22023';
    END IF;
    IF p_payment_id IS NOT NULL AND v_contract_id IS NULL THEN
        SELECT contract_id INTO v_contract_id FROM public.payment_schedules
        WHERE id = p_payment_id AND shop_id = p_shop_id;
    END IF;

    -- Every writer locks the parent first, so different installments cannot lose paid deltas.
    SELECT * INTO v_contract FROM public.property_contracts
    WHERE id = v_contract_id AND shop_id = p_shop_id AND deleted_at IS NULL
    FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Гэрээ олдсонгүй' USING ERRCODE = 'P0002';
    END IF;
    IF v_contract.contract_status IS NULL OR v_contract.contract_status NOT IN ('active', 'closed') THEN
        RAISE EXCEPTION 'Цуцалсан гэрээнд төлбөр бүртгэх боломжгүй' USING ERRCODE = '22023';
    END IF;

    IF p_payment_id IS NULL THEN
        SELECT * INTO v_prev FROM public.payment_schedules
        WHERE shop_id = p_shop_id AND client_request_id = p_request_id FOR UPDATE;
        IF FOUND THEN
            IF v_prev.contract_id <> v_contract_id OR v_prev.client_request_payload IS DISTINCT FROM p_payload THEN
                RAISE EXCEPTION 'Энэ хүсэлтээр өөр төлбөр өмнө нь бүртгэгдсэн байна' USING ERRCODE = '23505';
            END IF;
            RETURN to_jsonb(v_prev);
        END IF;
        v_next.installment_number := 1;
        v_next.amount := 0;
        v_next.paid_amount := 0;
        v_next.status := 'pending';
    ELSE
        SELECT * INTO v_prev FROM public.payment_schedules
        WHERE id = p_payment_id AND shop_id = p_shop_id AND contract_id = v_contract_id FOR UPDATE;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Төлбөрийн мөр олдсонгүй' USING ERRCODE = 'P0002';
        END IF;
        v_next := v_prev;
    END IF;
    v_next := jsonb_populate_record(v_next, p_payload);
    IF v_next.due_date IS NULL OR v_next.amount IS NULL OR v_next.paid_amount IS NULL
       OR NOT isfinite(v_next.due_date) OR (v_next.paid_date IS NOT NULL AND NOT isfinite(v_next.paid_date))
       OR v_next.amount < 0 OR v_next.paid_amount < 0 OR v_next.paid_amount > v_next.amount
       OR v_next.amount > 1e15 OR v_next.paid_amount > 1e15
       OR v_next.amount = 'NaN'::numeric OR v_next.paid_amount = 'NaN'::numeric
       OR v_next.installment_number IS NULL OR v_next.installment_number NOT BETWEEN 1 AND 1000 THEN
        RAISE EXCEPTION 'Төлбөрийн огноо, дүн, дугаарыг шалгана уу' USING ERRCODE = '22023';
    END IF;
    v_delta := v_next.paid_amount - COALESCE(v_prev.paid_amount, 0);
    -- Reducing a receipt requires a separate, auditable refund/reversal workflow.
    IF v_delta < 0 THEN
        RAISE EXCEPTION 'Төлсөн дүнг шууд бууруулахгүй. Санхүүгийн буцаалт, залруулгаар шийднэ үү.' USING ERRCODE = '22023';
    END IF;
    IF v_delta = 0 AND COALESCE(v_prev.paid_amount, 0) > 0
       AND (v_next.paid_date IS DISTINCT FROM v_prev.paid_date OR v_next.payment_method IS DISTINCT FROM v_prev.payment_method
            OR v_next.receipt_kind IS DISTINCT FROM v_prev.receipt_kind) THEN
        RAISE EXCEPTION 'Бүртгэсэн орлогын огноо, хэлбэр, төрлийг санхүүгийн залруулгаар өөрчилнө үү' USING ERRCODE = '22023';
    END IF;
    IF v_delta > 0 THEN
        IF v_next.payment_method IS NULL OR v_next.payment_method NOT IN ('cash', 'bank', 'bank_transfer', 'barter', 'mortgage') THEN
            RAISE EXCEPTION 'Төлбөрийн хэлбэрийг сонгоно уу' USING ERRCODE = '22023';
        END IF;
        IF v_next.receipt_kind IS NULL OR v_next.receipt_kind NOT IN ('advance', 'installment', 'other') THEN
            RAISE EXCEPTION 'Төлбөр урьдчилгаа, хуваарьт төлөлт эсвэл бусад эсэхийг сонгоно уу' USING ERRCODE = '22023';
        END IF;
        -- A new receipt defaults to today, not the previous partial payment's month.
        v_next.paid_date := COALESCE((p_payload->>'paid_date')::date, (now() AT TIME ZONE 'Asia/Ulaanbaatar')::date);
    END IF;
    v_status := CASE WHEN v_next.amount > 0 AND v_next.paid_amount >= v_next.amount THEN 'paid'
        WHEN v_next.paid_amount > 0 THEN 'partial' ELSE 'pending' END;
    IF p_payload ? 'status' THEN
        IF v_next.status = 'cancelled' AND v_next.paid_amount = 0 THEN v_status := 'cancelled';
        ELSIF v_next.status = 'overdue' AND v_status <> 'paid' THEN v_status := 'overdue';
        ELSIF v_next.status IS DISTINCT FROM v_status THEN
            RAISE EXCEPTION 'Төлөв нь төлсөн дүнтэй тохирохгүй байна' USING ERRCODE = '22023';
        END IF;
    ELSIF v_next.status = 'cancelled' AND v_next.paid_amount = 0 THEN v_status := 'cancelled';
    END IF;

    IF p_payment_id IS NULL THEN
        INSERT INTO public.payment_schedules (
            shop_id, contract_id, installment_number, label, due_date, amount, paid_amount,
            paid_date, payment_method, receipt_kind, notes, status, client_request_id, client_request_payload
        ) VALUES (
            p_shop_id, v_contract_id, v_next.installment_number, v_next.label, v_next.due_date, v_next.amount, v_next.paid_amount,
            v_next.paid_date, v_next.payment_method, v_next.receipt_kind, v_next.notes, v_status, p_request_id, p_payload
        ) RETURNING * INTO v_next;
    ELSE
        UPDATE public.payment_schedules SET
            installment_number = v_next.installment_number, label = v_next.label, due_date = v_next.due_date,
            amount = v_next.amount, paid_amount = v_next.paid_amount, paid_date = v_next.paid_date,
            payment_method = v_next.payment_method, receipt_kind = v_next.receipt_kind, notes = v_next.notes, status = v_status, updated_at = now()
        WHERE id = p_payment_id AND shop_id = p_shop_id AND contract_id = v_contract_id
        RETURNING * INTO v_next;
    END IF;
    IF v_delta > 0 THEN
        INSERT INTO public.finance_transactions (
            shop_id, txn_date, type, amount, method, receipt_kind, contract_id, payment_schedule_id, project_id, note
        ) VALUES (
            p_shop_id, v_next.paid_date, 'receipt', v_delta,
            CASE WHEN v_next.payment_method = 'bank_transfer' THEN 'bank' ELSE v_next.payment_method END,
            v_next.receipt_kind,
            v_contract_id, v_next.id, v_contract.project_id, COALESCE(v_next.label, 'Гэрээний төлбөр')
        );
        UPDATE public.property_contracts SET
            paid_amount = COALESCE(paid_amount, 0) + v_delta,
            balance = GREATEST(0, COALESCE(total_price, 0) - (COALESCE(paid_amount, 0) + v_delta)),
            updated_at = now()
        WHERE id = v_contract_id AND shop_id = p_shop_id;
    END IF;
    RETURN to_jsonb(v_next);
END;
$$;

-- Browser users must go through the authenticated, module-gated API. No public RPC writes.
-- There are no remaining browser table writers; keep SELECT/RLS, remove the non-atomic write bypass.
REVOKE INSERT, UPDATE, DELETE ON public.payment_schedules FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mutate_contract_payment(uuid, uuid, uuid, jsonb, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mutate_contract_payment(uuid, uuid, uuid, jsonb, uuid) TO service_role;
COMMENT ON FUNCTION public.mutate_contract_payment(uuid, uuid, uuid, jsonb, uuid)
    IS 'Atomic payment schedule, receipt ledger and contract paid delta; service-role API only. No historical backfill.';
