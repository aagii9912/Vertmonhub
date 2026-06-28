/**
 * API input validation schemas (Zod) — route бүрийг хамгаалдаг тул гол зан төлвийг түгжинэ.
 */

import { describe, it, expect } from 'vitest';
import {
    validateBody,
    CreateLeadSchema,
    MergeCustomersSchema,
    CreateRoleSchema,
    UpdateShopSchema,
    CreateFinanceTransactionSchema,
} from '@/lib/validations/schemas';

const UUID = '11111111-1111-4111-8111-111111111111';
const UUID2 = '22222222-2222-4222-8222-222222222222';

describe('validateBody helper', () => {
    it('хүчинтэй өгөгдөлд { success: true, data }', () => {
        const r = validateBody(CreateLeadSchema, { name: 'Болд', phone: '99112233' });
        expect(r.success).toBe(true);
        if (r.success) expect(r.data.name).toBe('Болд');
    });

    it('буруу өгөгдөлд 400 + { error, details }', async () => {
        const r = validateBody(CreateLeadSchema, { name: '' });
        expect(r.success).toBe(false);
        if (!r.success) {
            expect(r.response.status).toBe(400);
            const body = await r.response.json();
            expect(body.error).toBe('Буруу өгөгдөл');
            expect(Array.isArray(body.details)).toBe(true);
            expect(body.details.length).toBeGreaterThan(0);
        }
    });
});

describe('CreateLeadSchema', () => {
    it('нэр + утас хамгийн бага шаардлага', () => {
        expect(CreateLeadSchema.safeParse({ name: 'А', phone: '99112233' }).success).toBe(true);
    });

    it('хэт богино / буруу форматтай утсыг татгалзана', () => {
        expect(CreateLeadSchema.safeParse({ name: 'А', phone: '123' }).success).toBe(false);
        expect(CreateLeadSchema.safeParse({ name: 'А', phone: 'abcd1234' }).success).toBe(false);
    });

    it('honeypot (website) хоосон биш бол татгалзана', () => {
        expect(CreateLeadSchema.safeParse({ name: 'А', phone: '99112233', website: 'spam' }).success).toBe(false);
    });

    it('тоон талбарыг coerce хийнэ (string → number)', () => {
        const r = CreateLeadSchema.safeParse({ name: 'А', phone: '99112233', preferred_rooms: '3' });
        expect(r.success).toBe(true);
        if (r.success) expect(r.data.preferred_rooms).toBe(3);
    });
});

describe('MergeCustomersSchema', () => {
    it('өөр хоёр uuid → ок', () => {
        expect(MergeCustomersSchema.safeParse({ primaryId: UUID, duplicateId: UUID2 }).success).toBe(true);
    });

    it('ижил id-г нэгтгэхийг татгалзана (refine)', () => {
        expect(MergeCustomersSchema.safeParse({ primaryId: UUID, duplicateId: UUID }).success).toBe(false);
    });
});

describe('CreateRoleSchema', () => {
    it('том үсэгтэй нэрийг татгалзана, lowercase_underscore зөвшөөрнө', () => {
        expect(CreateRoleSchema.safeParse({ name: 'Junior', display_name: 'J', display_name_mn: 'Ж' }).success).toBe(false);
        expect(CreateRoleSchema.safeParse({ name: 'junior_sales', display_name: 'J', display_name_mn: 'Ж' }).success).toBe(true);
    });

    it('эрхийн флагууд default-аар false', () => {
        const r = CreateRoleSchema.safeParse({ name: 'viewer2', display_name: 'V', display_name_mn: 'В' });
        expect(r.success).toBe(true);
        if (r.success) {
            expect(r.data.can_write).toBe(false);
            expect(r.data.can_delete).toBe(false);
            expect(r.data.can_access_admin).toBe(false);
        }
    });
});

describe('UpdateShopSchema', () => {
    it('хоосон объектыг татгалзана (дор хаяж нэг талбар)', () => {
        expect(UpdateShopSchema.safeParse({}).success).toBe(false);
    });

    it('нэг талбартай бол ок', () => {
        expect(UpdateShopSchema.safeParse({ name: 'Шинэ нэр' }).success).toBe(true);
    });
});

describe('CreateFinanceTransactionSchema', () => {
    it('эерэг дүн + зөв type → ок', () => {
        expect(CreateFinanceTransactionSchema.safeParse({ type: 'receipt', amount: 1000 }).success).toBe(true);
    });

    it('дүн 0 эсвэл сөрөг бол татгалзана', () => {
        expect(CreateFinanceTransactionSchema.safeParse({ type: 'receipt', amount: 0 }).success).toBe(false);
    });

    it('тодорхойгүй type-г татгалзана', () => {
        expect(CreateFinanceTransactionSchema.safeParse({ type: 'refund', amount: 1000 }).success).toBe(false);
    });
});
