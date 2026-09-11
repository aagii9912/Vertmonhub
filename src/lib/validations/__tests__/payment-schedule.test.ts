import { describe, it, expect } from 'vitest';
import { UpdatePaymentScheduleSchema } from '../schemas';

/** 2026-09 review H4: PATCH body-г шууд update-д өгч shop_id/contract_id дарж бичих боломжтой байв. */
describe('UpdatePaymentScheduleSchema (strict allow-list)', () => {
    const id = '11111111-1111-4111-8111-111111111111';

    it('зөвшөөрөгдсөн талбарууд өнгөрнө', () => {
        const r = UpdatePaymentScheduleSchema.safeParse({ payment_id: id, paid_amount: '1500000', status: 'paid', paid_date: '2026-09-11' });
        expect(r.success).toBe(true);
        if (r.success) expect(r.data.paid_amount).toBe(1500000);
    });
    it('shop_id / contract_id / дурын талбар → татгалзана', () => {
        expect(UpdatePaymentScheduleSchema.safeParse({ payment_id: id, shop_id: 'x' }).success).toBe(false);
        expect(UpdatePaymentScheduleSchema.safeParse({ payment_id: id, contract_id: id }).success).toBe(false);
        expect(UpdatePaymentScheduleSchema.safeParse({ payment_id: id, anything: 1 }).success).toBe(false);
    });
    it('payment_id UUID биш / статус enum биш → татгалзана', () => {
        expect(UpdatePaymentScheduleSchema.safeParse({ payment_id: 'abc' }).success).toBe(false);
        expect(UpdatePaymentScheduleSchema.safeParse({ payment_id: id, status: 'x' }).success).toBe(false);
    });
});
