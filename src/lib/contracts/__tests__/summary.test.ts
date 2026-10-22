import { describe, expect, it } from 'vitest';
import { summarizeContracts } from '../summary';

const rows = [
    { contract_status: 'active', total_price: '403416000.00', prepayment_due: 121024800, paid_amount: null, balance: null, contracted_area: '58.10', overdue_amount: '20010000.00', overdue_as_of: '2026-10-21', overdue_days: 0 },
    { contract_status: 'active', total_price: 0.1, prepayment_due: null, paid_amount: null, balance: null, contracted_area: 0.2, overdue_amount: 0, overdue_as_of: '2026-10-21' },
    { contract_status: 'closed', total_price: 79700000, prepayment_due: 79700000, paid_amount: 79700000, balance: 0, contracted_area: 12.5, overdue_amount: 5, overdue_as_of: '2026-10-01', overdue_days: 3 },
    { contract_status: 'transferred', total_price: 100, paid_amount: 40, balance: 60, overdue_amount: null, overdue_as_of: null },
    { contract_status: 'cancelled', total_price: 384675000, prepayment_due: 115402500, paid_amount: null, balance: null, contracted_area: 70, overdue_amount: 9, overdue_as_of: '2026-10-21', overdue_days: 50 },
    { contract_status: null, total_price: null, paid_amount: 10, balance: 5 },
];

describe('summarizeContracts', () => {
    it('цуцалсныг тоонд оруулж, мөнгө/талбайд оруулахгүй; төлсөн дүн NULL бол 0 гэж нэмэхгүй', () => {
        const summary = summarizeContracts(rows, { latestImportDate: '2026-10-21' });
        expect(summary).toMatchObject({
            total: 6, active: 3, closed: 1, cancelled: 1, transferred: 1,
            total_sales: 483116100.1, prepayment_due: 200724800, area: 70.8,
            total_paid: 79700050, total_balance: 65, unknown_paid: 2,
            overdue_days_count: 1,
        });
    });

    it('хоцролт: зөвхөн сүүлийн файлын огноотой мөр, хуучирсныг тусад нь тоолно', () => {
        const summary = summarizeContracts(rows, { latestImportDate: '2026-10-21' });
        expect(summary).toMatchObject({ overdue_amount: 20010000, overdue_as_of: '2026-10-21', overdue_count: 1, overdue_stale: 1 });
    });

    it('импортгүй төсөлд мэдэгдэж буй бүх утга; хадгалсан утга алга бол null («—»), 0 биш', () => {
        expect(summarizeContracts(rows)).toMatchObject({ overdue_amount: 20010005, overdue_as_of: null, overdue_count: 2, overdue_stale: 0 });
        expect(summarizeContracts([{ contract_status: 'active', total_price: 1, overdue_amount: null }], { latestImportDate: null }).overdue_amount).toBeNull();
        expect(summarizeContracts([{ contract_status: 'active', overdue_amount: 7, overdue_as_of: '2026-09-01' }], { latestImportDate: '2026-10-21' }))
            .toMatchObject({ overdue_amount: null, overdue_stale: 1 });
        expect(summarizeContracts([])).toMatchObject({ total: 0, total_sales: 0, overdue_amount: null, unknown_paid: 0 });
    });
});
