// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { emptyMonthlySales } from '@/lib/sales/monthly';
import { buildPlanPerformance, type PlanContract, type PlanReceipt } from '@/lib/sales/plan-performance';
import { DashboardApiError } from '@/lib/api/dashboardFetch';

const transport = vi.hoisted(() => ({ json: vi.fn() }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ shop: { id: 'shop-1' }, user: { id: 'user-1', role: 'admin' } }) }));
vi.mock('@/lib/api/dashboardFetch', async (importOriginal) => ({ ...await importOriginal<typeof import('@/lib/api/dashboardFetch')>(), dashboardJson: transport.json }));

import PlanPerformancePage from './page';

const contract = (id: string, over: Partial<PlanContract>): PlanContract => ({
    id, contract_date: '2026-09-05', contract_status: 'active', product_type: 'residential', block_name: 'Б1', unit_label: `Б1-${id}`,
    total_price: 600, prepayment_due: 180, paid_amount: null, overdue_amount: 0, overdue_as_of: '2026-10-20', ...over,
});

function report(receipts: PlanReceipt[] | null) {
    const months = emptyMonthlySales();
    for (const index of [8, 9]) months[index] = { ...months[index], target_amount: 1_100, cashflow_target_amount: 330,
        block_amounts: { b1: { target_amount: 1_000, cashflow_target_amount: 300 }, parking: { target_amount: 100, cashflow_target_amount: 30 } } };
    const built = buildPlanPerformance({
        year: 2026, now: new Date('2026-10-22T04:00:00Z'), months, planYears: [2026], latestImportDate: '2026-10-20', receipts,
        contracts: [
            contract('1', {}), contract('2', { overdue_amount: 250 }),
            contract('3', { product_type: 'parking', contract_date: null, unit_label: 'Б1-108 (01)', total_price: 80 }),
            contract('4', { product_type: 'industry', total_price: 40 }),
            contract('5', { contract_status: 'cancelled', total_price: 900 }),
        ],
    });
    return { ...built, shopName: 'Elysium Residence', ...(receipts === null ? { cashHidden: true } : {}) };
}

function open(data: ReturnType<typeof report>) {
    transport.json.mockResolvedValue(data);
    const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={cache}><PlanPerformancePage /></QueryClientProvider>);
    return cache;
}

afterEach(() => { vi.clearAllMocks(); });

describe('plan fulfilment page', () => {
    it('shows system actuals with a lower bound, outside-plan contracts and the undated list', async () => {
        const cache = open(report(null));
        const september = (await screen.findByRole('rowheader', { name: '9-р сар' })).closest('tr')!;
        expect(within(september).getByText((_, node) => node?.textContent === '1,200+*' && node.tagName === 'SPAN')).toBeInTheDocument();
        expect(within(september).getByText('109.1%+')).toBeInTheDocument();
        const october = screen.getByRole('rowheader', { name: /10-р сар/ }).closest('tr')!;
        expect(within(october).getByText('явцын')).toBeInTheDocument();
        expect(within(october).getAllByText('—').length).toBeGreaterThan(0);
        expect(screen.getByText(/Агуулах — 1 гэрээ · 40/)).toBeInTheDocument();
        expect(screen.getByText('Огноогүй 1 гэрээ сарын гүйцэтгэлд ороогүй')).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'Б1-108 (01)' })).toHaveAttribute('href', '/dashboard/contracts/3');
        expect(screen.getByRole('link', { name: 'Гэрээний жагсаалтаас харах' })).toHaveAttribute('href', '/dashboard/contracts?filter=undated');
        expect(screen.queryByText(/бусад .* гэрээг жагсаалтаас харна уу/)).not.toBeInTheDocument();
        expect(screen.getByText(/Энэ онд цуцлагдсан: 1 гэрээ · 900 \(9-р сар 1 · 900\)/)).toBeInTheDocument();
        expect(screen.getAllByText('Мөнгөн урсгалыг санхүүгийн эрхтэй ажилтан харна.').length).toBeGreaterThan(0);
        expect(screen.queryByRole('heading', { name: /Мөнгөн урсгал/ })).not.toBeInTheDocument();
        expect(transport.json).toHaveBeenCalledWith(expect.stringMatching(/^\/api\/dashboard\/reports\/plan-performance\?year=\d{4}$/), expect.any(Object));
        cache.clear();
    });

    it('switches to a block and keeps an undated block without contracts unknown', async () => {
        const cache = open(report(null));
        await screen.findByRole('rowheader', { name: '9-р сар' });
        fireEvent.click(screen.getByRole('button', { name: 'Зогсоол' }));
        expect(screen.getByRole('button', { name: 'Зогсоол' })).toHaveAttribute('aria-pressed', 'true');
        expect(screen.getByRole('heading', { name: 'Гэрээ · Зогсоол' })).toBeInTheDocument();
        const september = screen.getByRole('rowheader', { name: '9-р сар' }).closest('tr')!;
        expect(within(september).queryByText(/\d+%/)).not.toBeInTheDocument();
        expect(screen.queryByText(/Агуулах — 1 гэрээ/)).not.toBeInTheDocument();
        cache.clear();
    });

    it('says how many undated contracts the capped list leaves out', async () => {
        const data = report(null);
        const cache = open({ ...data, undated: { ...data.undated, count: 130 } });
        expect(await screen.findByText('Огноогүй 130 гэрээ сарын гүйцэтгэлд ороогүй')).toBeInTheDocument();
        expect(screen.getByText((_, node) => node?.tagName === 'P' && node.textContent === '… бусад 129 гэрээг жагсаалтаас харна уу.')).toBeInTheDocument();
        cache.clear();
    });

    it('counts undated other-block residential contracts in «Нийт» when the plan has no block breakdown', async () => {
        const months = emptyMonthlySales();
        for (let index = 0; index < 12; index++) months[index] = { ...months[index], target_amount: 1_000 };
        const built = buildPlanPerformance({
            year: 2026, now: new Date('2026-10-22T04:00:00Z'), months, planYears: [2026], latestImportDate: null, receipts: null,
            contracts: [contract('1', { block_name: 'Г1485', unit_label: 'Г1485-1' }), contract('2', { block_name: 'Г1485', unit_label: 'Г1485-2', contract_date: null })],
        });
        const cache = open({ ...built, shopName: 'Mandala Garden', cashHidden: true });
        expect(await screen.findByText('Огноогүй 1 гэрээ сарын гүйцэтгэлд ороогүй')).toBeInTheDocument();
        expect(screen.getByText(/Энэ хэсэгт 1 нь хамаарна/)).toBeInTheDocument();
        expect(screen.queryByText(/Энэ хэсгийн хувьд бүрэн/)).not.toBeInTheDocument();
        cache.clear();
    });

    it('explains an empty cash ledger instead of showing 0 to finance users', async () => {
        const cache = open(report([]));
        expect(await screen.findByText('Орсон мөнгө бүртгэгдээгүй')).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: 'Мөнгөн урсгал · Нийт' })).toBeInTheDocument();
        expect(screen.getByText('Оруулаагүй')).toBeInTheDocument();
        expect(screen.queryByText('0₮')).not.toBeInTheDocument();
        cache.clear();
    });

    it('does not say cash is unrecorded when a month has a manually entered amount', async () => {
        const months = emptyMonthlySales();
        months[8] = { ...months[8], cashflow_target_amount: 330, manual_cashflow_actual_amount: 190 };
        const built = buildPlanPerformance({
            year: 2026, now: new Date('2026-10-22T04:00:00Z'), months, planYears: [2026], latestImportDate: '2026-10-20',
            receipts: [], contracts: [contract('1', {})],
        });
        const cache = open({ ...built, shopName: 'Elysium Residence' });
        expect(await screen.findByText('Зөвхөн гараар оруулсан орсон мөнгө')).toBeInTheDocument();
        expect(screen.queryByText('Орсон мөнгө бүртгэгдээгүй')).not.toBeInTheDocument();
        cache.clear();
    });

    it('says «Бүртгэл алга» instead of 0₮ when paid amounts are known but no payment was recorded', async () => {
        const built = buildPlanPerformance({
            year: 2026, now: new Date('2026-10-22T04:00:00Z'), months: emptyMonthlySales(), planYears: [2026], latestImportDate: null,
            receipts: [], ledgerSince: null, contracts: [contract('1', { paid_amount: 300 })],
        });
        const cache = open({ ...built, shopName: 'Mandala Garden' });
        expect(await screen.findByText('Системд төлбөр бүртгэгдээгүй (Бүртгэл алга)')).toBeInTheDocument();
        expect(screen.getByText('Бүртгэл алга')).toBeInTheDocument();
        expect(screen.queryByText('Орсон мөнгө бүртгэгдээгүй')).not.toBeInTheDocument();
        expect(screen.queryByText('0₮')).not.toBeInTheDocument();
        cache.clear();
    });

    it('tells a restricted manager the team plan is for management, without a danger alert or a retry', async () => {
        transport.json.mockRejectedValue(new DashboardApiError('Багийн төлөвлөгөө удирдлагад харагдана', 403));
        const cache = new QueryClient();
        render(<QueryClientProvider client={cache}><PlanPerformancePage /></QueryClientProvider>);
        expect(await screen.findByText('Багийн төлөвлөгөөний биелэлт удирдлагад харагдана.')).toBeInTheDocument();
        expect(screen.queryByText('Тайлан гарсангүй')).not.toBeInTheDocument();
        expect(screen.queryByRole('group', { name: 'Блок' })).not.toBeInTheDocument();
        expect(transport.json).toHaveBeenCalledTimes(1);
        cache.clear();
    });
});
