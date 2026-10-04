import { describe, expect, it } from 'vitest';
import {
    TransferContractSchema, isTransferableContract, normalizeRegistration, summarizeContractTransfers,
    transferDateError, transferInputError,
} from '../transfer';
import { contractTransferKindLabel } from '../labels';

const requestId = '11111111-1111-4111-8111-111111111111';
const parse = (input: object) => TransferContractSchema.safeParse({ client_request_id: requestId, ...input });
const error = (input: object) => {
    const result = parse(input);
    return result.success ? null : transferInputError(result.error);
};

describe('transfer schema', () => {
    it('requires name, registration and reason for a transfer, only the name for a rename', () => {
        expect(error({ kind: 'transfer', customer_name: 'Дорж', customer_registration: 'ЧБ88020202', reason: 'Худалдсан' })).toBeNull();
        expect(error({ kind: 'transfer', customer_name: 'Дорж', reason: 'Худалдсан' })).toBe('Шинэ эзэмшигчийн регистрийг оруулна уу');
        expect(error({ kind: 'transfer', customer_name: 'Дорж', customer_registration: 'ЧБ88020202' })).toBe('Шилжүүлсэн шалтгааныг оруулна уу');
        expect(error({ kind: 'transfer', customer_name: '  ', customer_registration: 'ЧБ88020202', reason: 'x' })).toBe('Шинэ эзэмшигчийн нэрийг оруулна уу');
        expect(error({ kind: 'rename', customer_name: 'Бат-Болд' })).toBeNull();
        expect(error({ kind: 'gift', customer_name: 'Бат' })).toBe('Шилжүүлгийн төрлийг сонгоно уу');
    });

    it('normalizes registrations and accepts foreign passports, but not malformed ids', () => {
        expect(parse({ kind: 'transfer', customer_name: 'A', customer_registration: ' уб 99 010101 ', reason: 'x' })).toMatchObject({ success: true, data: { customer_registration: 'УБ99010101' } });
        expect(parse({ kind: 'transfer', customer_name: 'A', customer_registration: 'e1234567', reason: 'x' })).toMatchObject({ success: true, data: { customer_registration: 'E1234567' } });
        expect(normalizeRegistration('ab 12')).toBe('AB12');
        expect(error({ kind: 'transfer', customer_name: 'A', customer_registration: 'УБ#123', reason: 'x' })).toBe('Регистр/паспортын дугаар 4–20 үсэг, тоо байна');
        expect(error({ kind: 'rename', customer_name: 'A', customer_registration: 'AB1' })).toBe('Регистр/паспортын дугаар 4–20 үсэг, тоо байна');
    });

    it('is a strict allow-list: money, manager, contract date and server-only keys are rejected', () => {
        for (const key of ['paid_amount', 'balance', 'sales_manager', 'contract_date', 'contract_number', 'phone_normalized', 'customer_id', 'lead_id']) {
            expect(error({ kind: 'rename', customer_name: 'A', [key]: 'x' }), key).toContain('зөвшөөрөгдөөгүй талбар');
        }
        expect(error({ kind: 'rename', customer_name: 'A', client_request_id: 'not-a-uuid' })).toContain('UUID');
        expect(error({ kind: 'rename', customer_name: 'A', effective_date: '2026-02-31' })).toBe('Шилжүүлсэн огноо буруу байна');
        expect(error({ kind: 'rename', customer_name: 'A', effective_date: '01/10/2026' })).toBe('Шилжүүлсэн огноо YYYY-MM-DD хэлбэртэй байна');
    });
});

describe('transfer rules', () => {
    it('allows only active and closed contracts (not cancelled or ERP unit moves)', () => {
        expect(isTransferableContract('active')).toBe(true);
        expect(isTransferableContract('closed')).toBe(true);
        for (const status of ['cancelled', 'transferred', null, undefined, '']) expect(isTransferableContract(status)).toBe(false);
    });

    it('bounds the effective date between the contract date and today', () => {
        expect(transferDateError('2026-10-04', '2026-01-15', '2026-10-04')).toBeNull();
        expect(transferDateError('2026-10-05', null, '2026-10-04')).toBe('Шилжүүлсэн огноо өнөөдрөөс хэтрэхгүй');
        expect(transferDateError('2026-01-14', '2026-01-15T00:00:00', '2026-10-04')).toBe('Шилжүүлсэн огноо гэрээ байгуулсан огнооноос өмнө байж болохгүй');
        expect(transferDateError('2026-01-15', '2026-01-15', '2026-10-04')).toBeNull();
    });

    it('summarizes the original buyer and latest transfer date, ignoring rename-only history', () => {
        const rows = [
            { kind: 'rename' as const, effective_date: '2026-10-02', from_customer_name: 'Ганаа', created_at: '2026-10-02T01:00:00Z' },
            { kind: 'transfer' as const, effective_date: '2026-06-01', from_customer_name: 'Бат Болд', created_at: '2026-06-01T01:00:00Z' },
            { kind: 'transfer' as const, effective_date: '2026-09-01', from_customer_name: 'Дорж', created_at: '2026-09-01T01:00:00Z' },
        ];
        expect(summarizeContractTransfers(rows)).toEqual({ originalHolder: 'Бат Болд', lastTransferDate: '2026-09-01', transfers: 2 });
        expect(summarizeContractTransfers([rows[0]])).toEqual({ originalHolder: null, lastTransferDate: null, transfers: 0 });
        expect(summarizeContractTransfers([])).toEqual({ originalHolder: null, lastTransferDate: null, transfers: 0 });
    });

    it('labels holder changes separately from the ERP «Тоот шилжсэн» status', () => {
        expect(contractTransferKindLabel('transfer')).toBe('Шилжүүлэг');
        expect(contractTransferKindLabel('rename')).toBe('Нэр засвар');
        expect(contractTransferKindLabel('transferred')).toBe('transferred');
        expect(contractTransferKindLabel(null)).toBe('—');
    });
});
