// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { WeeklyManual } from '@/lib/dashboard/weekly-manual';

const mocks = vi.hoisted(() => ({ json: vi.fn(), mutate: vi.fn(), success: vi.fn(), error: vi.fn() }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ shop: { id: 'shop-1' }, user: { id: 'user-1' } }) }));
vi.mock('sonner', () => ({ toast: { success: (...args: unknown[]) => mocks.success(...args), error: (...args: unknown[]) => mocks.error(...args) } }));
vi.mock('@/lib/api/dashboardFetch', async (importOriginal) => ({
    ...await importOriginal<typeof import('@/lib/api/dashboardFetch')>(), dashboardJson: mocks.json, dashboardMutate: mocks.mutate,
}));

import { WeeklyManualFixes } from './WeeklyManualFixes';

const manual = (overrides: Partial<WeeklyManual> = {}): WeeklyManual => ({
    month: '2026-11',
    managerless: { count: 2, contracts: [
        { id: 'c-53', number: null, date: '2026-11-05', block: 'Б1', unit: 'Б1-53, E2', kindLabel: 'Орон сууц', customer: 'Б.Энхжин', total: 450_000_000, inWeek: true },
        { id: 'c-54', number: 'EL-54', date: null, block: null, unit: null, kindLabel: 'Зогсоол', customer: null, total: null, inWeek: false },
    ] },
    undated: 1,
    plan: { contractAmount: true, contractCount: false, cashflow: null },
    manualActuals: { contractAmount: false, contractCount: false, cashflow: null },
    ...overrides,
});
type Access = Partial<{ contractsFromErp: boolean; canSetManager: boolean; canOpenContracts: boolean; canEditPlan: boolean; canOpenDaily: boolean }>;

function open(data: WeeklyManual | undefined, access: Access = {}) {
    const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const query = { data, isPending: false, error: data ? null : new Error('Сүлжээний алдаа') } as never;
    render(<QueryClientProvider client={cache}><WeeklyManualFixes query={query} contractsFromErp={false} canSetManager canOpenContracts canEditPlan canOpenDaily {...access} /></QueryClientProvider>);
    return cache;
}
const item = (title: string | RegExp) => screen.getByRole('heading', { name: title }).closest('li') as HTMLElement;

afterEach(() => { vi.clearAllMocks(); });

describe('weekly report: manual fixes step', () => {
    it('names what is missing and lets the manager be chosen right on the contract row', async () => {
        mocks.json.mockResolvedValue({ managers: [{ name: 'Ану.Бат', roster: true, contracts: 4 }, { name: 'Хонгорзул.Мөнхгэрэл', roster: false, contracts: 7 }] });
        mocks.mutate.mockResolvedValue({ contract: { id: 'c-53', sales_manager: 'Ану.Бат' } });
        const cache = open(manual());
        const invalidate = vi.spyOn(cache, 'invalidateQueries');
        expect(screen.getByRole('status')).toHaveTextContent('Нөхөх зүйл: менежергүй 2 гэрээ, огноогүй 1 гэрээ.');

        const managers = item('Гэрээний менежер');
        expect(managers).toHaveTextContent('2 гэрээ');
        const rows = within(within(managers).getByRole('list', { name: 'Менежергүй гэрээ' })).getAllByRole('listitem');
        expect(rows[0]).toHaveTextContent('Б1-53, E2');
        expect(rows[0]).toHaveTextContent('Энэ долоо хоног');
        expect(rows[0]).toHaveTextContent('Орон сууц · Б1 блок · 2026-11-05 · Б.Энхжин · 450 сая ₮');
        expect(within(rows[0]).getByRole('link', { name: 'Б1-53, E2' })).toHaveAttribute('href', '/dashboard/contracts/c-53');
        expect(rows[1]).toHaveTextContent('Зогсоол · огноогүй');

        const save = within(rows[0]).getByRole('button', { name: 'Б1-53, E2: менежер хадгалах' });
        expect(save).toBeDisabled();
        await within(rows[0]).findByRole('option', { name: 'Хонгорзул.Мөнхгэрэл · гэрээнд 7' });
        fireEvent.change(within(rows[0]).getByRole('combobox', { name: 'Б1-53, E2: менежер' }), { target: { value: 'Ану.Бат' } });
        fireEvent.click(save);

        await waitFor(() => expect(mocks.mutate).toHaveBeenCalledWith('/api/dashboard/contracts/c-53', 'PATCH', { sales_manager: 'Ану.Бат' }));
        await waitFor(() => expect(mocks.success).toHaveBeenCalledWith('Б1-53, E2: менежер Ану.Бат'));
        // Тайлан, энэ алхам хоёулаа шинэ менежерээр дахин уншина.
        expect(invalidate).toHaveBeenCalledWith({ queryKey: ['weekly-manual'] });
        expect(invalidate).toHaveBeenCalledWith({ queryKey: ['weekly-sales'] });
        expect(await within(rows[0]).findByText('Ану.Бат')).toBeInTheDocument();
        cache.clear();
    });

    it('points to where dates, the plan and the daily counts are entered', () => {
        const cache = open(manual());
        expect(within(item('Гэрээний огноо')).getByRole('link', { name: 'Огноогүй гэрээ' })).toHaveAttribute('href', '/dashboard/contracts?filter=undated');
        const plan = item(/Сарын төлөвлөгөө, гүйцэтгэл \(11-р сар\)/);
        expect(plan).toHaveTextContent('Зарим нь хоосон');
        expect(plan).toHaveTextContent('Төлөвлөгөө орсон: гэрээний дүн.');
        expect(plan).toHaveTextContent('Төлөвлөгөө хоосон: гэрээний тоо — эдгээрийн биелэлтийн хувь «—» гарна.');
        // Мөнгөн урсгалыг харах эрхгүй хүнд огт дурдахгүй.
        expect(plan).not.toHaveTextContent('мөнгөн урсгал');
        expect(plan).toHaveTextContent('Гүйцэтгэлийг гараар оруулаагүй — системийн бүртгэлээр тооцно (заавал биш).');
        expect(within(plan).getByRole('link', { name: 'Төлөвлөгөө оруулах' })).toHaveAttribute('href', '/admin/sales-targets');
        expect(within(item('Дуудлага, чат, уулзалт')).getByRole('link', { name: 'Өдрийн тайлан' })).toHaveAttribute('href', '/dashboard/daily-report');
        cache.clear();
    });

    it('shows who fixes it instead of controls the server would refuse', () => {
        const cache = open(manual(), { canSetManager: false, canOpenContracts: false, canEditPlan: false, canOpenDaily: false });
        expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
        expect(screen.queryByRole('link')).not.toBeInTheDocument();
        expect(item('Гэрээний менежер')).toHaveTextContent('Менежерийг удирдлага (гэрээ засах эрхтэй хүн) сонгоно.');
        expect(screen.getByText('Төлөвлөгөө, гүйцэтгэлийг удирдлага (супер админ) оруулна.')).toBeInTheDocument();
        expect(mocks.json).not.toHaveBeenCalled();
        cache.clear();
    });

    it('says nothing is left once every row is complete, and that manual actuals replace the system figures', () => {
        const cache = open(manual({ managerless: { count: 0, contracts: [] }, undated: 0,
            plan: { contractAmount: true, contractCount: true, cashflow: true }, manualActuals: { contractAmount: false, contractCount: false, cashflow: true } }));
        expect(screen.getByRole('status')).toHaveTextContent('Гараар нөхөх зүйл алга.');
        expect(item('Гэрээний менежер')).toHaveTextContent('Бүрэн');
        expect(item('Гэрээний огноо')).toHaveTextContent('Огноогүй амьд гэрээ алга.');
        const plan = item(/Сарын төлөвлөгөө/);
        expect(plan).toHaveTextContent('Оруулсан');
        expect(plan).toHaveTextContent('Гүйцэтгэлийг гараар оруулсан: мөнгөн урсгал — төлөвлөгөөний биелэлтэд системийн тооны оронд энэ дүн гарна.');
        cache.clear();
    });

    it('does not ask to fix CRM contracts in a project that reads them from the ERP sales export', () => {
        const cache = open(manual({ plan: { contractAmount: false, contractCount: false, cashflow: null } }), { contractsFromErp: true });
        expect(screen.getByRole('status')).toHaveTextContent('Нөхөх зүйл: 11-р сарын гэрээний төлөвлөгөө.');
        expect(item('Гэрээний менежер')).toHaveTextContent('Хамаарахгүй');
        expect(screen.queryByRole('list', { name: 'Менежергүй гэрээ' })).not.toBeInTheDocument();
        expect(item(/Сарын төлөвлөгөө/)).toHaveTextContent('Оруулаагүй');
        cache.clear();
    });

    it('never shows a failed load as «nothing to fix»', () => {
        const cache = open(undefined);
        expect(screen.getByText(/Гараар нөхөх зүйлсийг ачаалж чадсангүй\. Сүлжээний алдаа/)).toBeInTheDocument();
        expect(screen.queryByRole('status')).not.toBeInTheDocument();
        cache.clear();
    });
});
