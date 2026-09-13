-- Bill balance, cash ledger and audit commit once under a stable caller request ID.
-- Apply before deploying FinanceOps.payBill. No historical data rewrite.
ALTER TABLE public.finance_transactions ADD COLUMN IF NOT EXISTS vendor_bill_id uuid REFERENCES public.vendor_bills(id);
ALTER TABLE public.finance_transactions ADD COLUMN IF NOT EXISTS client_request_id uuid;
ALTER TABLE public.finance_transactions ADD COLUMN IF NOT EXISTS client_request_payload jsonb;
CREATE UNIQUE INDEX IF NOT EXISTS uq_finance_transactions_shop_request
    ON public.finance_transactions (shop_id, client_request_id) WHERE client_request_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.pay_vendor_bill_atomic(
    p_shop_id uuid, p_bill_id uuid, p_request_id uuid, p_payload jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_bill public.vendor_bills%ROWTYPE;
    v_previous public.finance_transactions%ROWTYPE;
    v_transaction_id uuid;
    v_amount numeric;
    v_paid_date date;
    v_method text;
    v_new_paid numeric;
    v_status text;
BEGIN
    IF p_shop_id IS NULL OR p_bill_id IS NULL OR p_request_id IS NULL
       OR p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
        RAISE EXCEPTION 'Нэхэмжлэх, хүсэлтийн UUID болон төлбөрийн өгөгдөл шаардлагатай' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (SELECT 1 FROM jsonb_object_keys(p_payload) AS k(key)
        WHERE key NOT IN ('amount', 'method', 'paid_date')) THEN
        RAISE EXCEPTION 'Зөвшөөрөгдөөгүй төлбөрийн талбар' USING ERRCODE = '22023';
    END IF;
    IF p_payload ? 'paid_date' AND p_payload->>'paid_date' !~ '^\d{4}-\d{2}-\d{2}$' THEN
        RAISE EXCEPTION 'Огноо YYYY-MM-DD форматтай байх ёстой' USING ERRCODE = '22023';
    END IF;
    v_amount := (p_payload->>'amount')::numeric;
    v_method := p_payload->>'method';
    v_paid_date := COALESCE((p_payload->>'paid_date')::date, (now() AT TIME ZONE 'Asia/Ulaanbaatar')::date);
    IF v_amount IS NULL OR v_amount <= 0 OR v_amount > 1e15 OR v_amount = 'NaN'::numeric
       OR round(v_amount, 2) <> v_amount OR NOT isfinite(v_paid_date)
       OR (v_method IS NOT NULL AND v_method NOT IN ('cash', 'bank', 'barter', 'mortgage')) THEN
        RAISE EXCEPTION 'Төлбөрийн дүн, огноо, хэлбэрийг шалгана уу' USING ERRCODE = '22023';
    END IF;

    -- Serializes every payment to this bill, including separate installments.
    SELECT * INTO v_bill FROM public.vendor_bills
    WHERE id = p_bill_id AND shop_id = p_shop_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Нэхэмжлэх олдсонгүй' USING ERRCODE = 'P0002'; END IF;

    SELECT * INTO v_previous FROM public.finance_transactions
    WHERE shop_id = p_shop_id AND client_request_id = p_request_id FOR UPDATE;
    IF FOUND THEN
        IF v_previous.vendor_bill_id IS DISTINCT FROM p_bill_id OR v_previous.client_request_payload IS DISTINCT FROM p_payload THEN
            RAISE EXCEPTION 'Энэ хүсэлтээр өөр төлбөр өмнө нь бүртгэгдсэн байна' USING ERRCODE = '23505';
        END IF;
        RETURN jsonb_build_object('id', v_bill.id, 'paid_amount', v_bill.paid_amount, 'status', v_bill.status,
            'total_amount', v_bill.total_amount, 'transaction_id', v_previous.id);
    END IF;
    IF v_bill.status = 'cancelled' THEN
        RAISE EXCEPTION 'Цуцалсан нэхэмжлэхэд төлбөр бүртгэх боломжгүй' USING ERRCODE = '22023';
    END IF;
    IF v_bill.total_amount <= 0 OR v_bill.total_amount = 'NaN'::numeric
       OR COALESCE(v_bill.paid_amount, 0) < 0 OR v_bill.paid_amount = 'NaN'::numeric THEN
        RAISE EXCEPTION 'Нэхэмжлэхийн өмнөх дүн буруу байна. Санхүүгийн бүртгэлээ шалгана уу.' USING ERRCODE = '22023';
    END IF;
    v_new_paid := COALESCE(v_bill.paid_amount, 0) + v_amount;
    IF v_bill.total_amount IS NULL OR v_new_paid > v_bill.total_amount OR v_bill.status = 'paid' THEN
        RAISE EXCEPTION 'Төлөх дүн нэхэмжлэхийн үлдэгдлээс их байна. Жагсаалтаа шинэчилнэ үү.' USING ERRCODE = '22023';
    END IF;
    v_status := CASE WHEN v_new_paid = v_bill.total_amount THEN 'paid' ELSE 'partial' END;

    INSERT INTO public.finance_transactions (shop_id, txn_date, type, amount, method, vendor_bill_id,
        project_id, note, client_request_id, client_request_payload)
    VALUES (p_shop_id, v_paid_date, 'disbursement', v_amount, v_method, p_bill_id,
        v_bill.project_id, 'Нийлүүлэгчийн нэхэмжлэх төлбөр', p_request_id, p_payload)
    RETURNING id INTO v_transaction_id;

    UPDATE public.vendor_bills SET paid_amount = v_new_paid, status = v_status
    WHERE id = p_bill_id AND shop_id = p_shop_id;

    INSERT INTO public.finance_audit_log (shop_id, action, entity, entity_id, amount, meta)
    VALUES (p_shop_id, 'bill.pay', 'vendor_bill', p_bill_id, v_amount,
        jsonb_build_object('method', v_method, 'newStatus', v_status, 'transaction_id', v_transaction_id, 'client_request_id', p_request_id));
    RETURN jsonb_build_object('id', v_bill.id, 'paid_amount', v_new_paid, 'status', v_status,
        'total_amount', v_bill.total_amount, 'transaction_id', v_transaction_id);
END;
$$;

REVOKE ALL ON FUNCTION public.pay_vendor_bill_atomic(uuid, uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pay_vendor_bill_atomic(uuid, uuid, uuid, jsonb) TO service_role;
COMMENT ON FUNCTION public.pay_vendor_bill_atomic(uuid, uuid, uuid, jsonb)
    IS 'Atomic, idempotent vendor payment with ledger and audit; authenticated module-gated API only.';
