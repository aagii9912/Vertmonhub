// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { WeeklyManual } from '@/lib/dashboard/weekly-manual';

const mocks = vi.hoisted(() => ({ json: vi.fn(), mutate: vi.fn(), success: vi.fn(), error: vi.fn(), confirm: vi.fn(), dirty: vi.fn() }));
vi.mock('@/components/ui/Toast', () => ({ confirmToast: (...args: unknown[]) => mocks.confirm(...args) }));
vi.mock('./WeeklyPlanEditor', () => ({ WeeklyPlanEditor: ({ month, onClose }: { month: string; onClose: () => void }) => <div role="form" aria-label={`plan ${month}`}><button type="button" onClick={onClose}>close plan</button></div> }));
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
    undated: 2,
    undatedContracts: [
        { id: 'c-54', number: 'EL-54', date: null, block: null, unit: null, kindLabel: 'Зогсоол', customer: null, total: null, inWeek: false, manager: null, dateEntry: true },
        { id: 'c-60', number: null, date: null, block: 'Б1', unit: 'Б1-60', kindLabel: 'Орон сууц', customer: null, total: 300_000_000, inWeek: false, manager: 'Ану.Бат', dateEntry: false },
    ],
    plan: { contractAmount: true, contractCount: false, cashflow: null },
    manualActuals: { contractAmount: false, contractCount: false, cashflow: null },
    ...overrides,
});
type Access = Partial<{ contractsFromErp: boolean; canEditContracts: boolean; canOpenContracts: boolean; canEditPlan: boolean; canOpenDaily: boolean }>;

function open(data: WeeklyManual | undefined, access: Access = {}) {
    const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const query = { data, isPending: false, error: data ? null : new Error('Сүлжээний алдаа') } as never;
    render(<QueryClientProvider client={cache}><WeeklyManualFixes query={query} contractsFromErp={false} canEditContracts canOpenContracts canEditPlan canOpenDaily onDirty={mocks.dirty} {...access} /></QueryClientProvider>);
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
        expect(screen.getByRole('status')).toHaveTextContent('Нөхөх зүйл: менежергүй 2 гэрээ, огноогүй 2 гэрээ.');

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

    it('enters a missing contract date on the row, once, after a confirmation', async () => {
        mocks.mutate.mockResolvedValue({ contract: { id: 'c-54' } });
        const cache = open(manual());
        const dates = item('Гэрээний огноо');
        expect(within(dates).getByRole('link', { name: 'Огноогүй гэрээ' })).toHaveAttribute('href', '/dashboard/contracts?filter=undated');
        const rows = within(within(dates).getByRole('list', { name: 'Огноогүй гэрээ' })).getAllByRole('listitem');
        expect(rows[0]).toHaveTextContent('Зогсоол · менежергүй');
        const save = within(rows[0]).getByRole('button', { name: 'EL-54: огноо хадгалах' });
        expect(save).toBeDisabled();

        // Ирээдүйн огноог хадгалахгүй (серверийн дүрэмтэй ижил шалгалт).
        fireEvent.change(within(rows[0]).getByLabelText('EL-54: захиалга өгсөн огноо'), { target: { value: '2999-01-01' } });
        fireEvent.click(save);
        expect(mocks.error).toHaveBeenCalledWith('Захиалга өгсөн огноо өнөөдрөөс хойш байж болохгүй');
        expect(mocks.confirm).not.toHaveBeenCalled();

        // Болих дарвал хадгалахгүй.
        fireEvent.change(within(rows[0]).getByLabelText('EL-54: захиалга өгсөн огноо'), { target: { value: '2026-10-20' } });
        mocks.confirm.mockResolvedValueOnce(false);
        fireEvent.click(save);
        await waitFor(() => expect(mocks.confirm).toHaveBeenCalledWith(expect.objectContaining({ title: 'EL-54: огноог 2026-10-20 гэж хадгалах уу?' })));
        expect(mocks.mutate).not.toHaveBeenCalled();

        mocks.confirm.mockResolvedValueOnce(true);
        fireEvent.click(save);
        await waitFor(() => expect(mocks.mutate).toHaveBeenCalledWith('/api/dashboard/contracts/c-54', 'PATCH', { order_date: '2026-10-20' }));
        await waitFor(() => expect(mocks.success).toHaveBeenCalledWith('EL-54: огноо 2026-10-20'));

        // «Захиалга өгсөн огноо» бүртгэлтэй гэрээнд талбар гаргахгүй (сервер дахин бичүүлэхгүй).
        expect(within(rows[1]).queryByLabelText(/захиалга өгсөн огноо/)).not.toBeInTheDocument();
        expect(rows[1]).toHaveTextContent('Ану.Бат');
        expect(rows[1]).toHaveTextContent('Захиалга өгсөн огноо бүртгэлтэй — гэрээг нээж шалгана.');
        cache.clear();
    });

    it('opens the month plan editor in place instead of sending the user to another page', () => {
        const cache = open(manual());
        const plan = item(/Сарын төлөвлөгөө, гүйцэтгэл \(11-р сар\)/);
        expect(within(plan).queryByRole('link')).not.toBeInTheDocument();
        fireEvent.click(within(plan).getByRole('button', { name: 'Төлөвлөгөө засах' }));
        expect(within(plan).getByRole('form', { name: 'plan 2026-11' })).toBeInTheDocument();
        expect(within(plan).queryByRole('button', { name: 'Төлөвлөгөө засах' })).not.toBeInTheDocument();
        fireEvent.click(within(plan).getByRole('button', { name: 'close plan' }));
        expect(within(plan).queryByRole('form')).not.toBeInTheDocument();
        expect(within(plan).getByRole('button', { name: 'Төлөвлөгөө засах' })).toBeInTheDocument();
        cache.clear();
    });

    it('says what the plan row holds and points to the daily report for the daily counts', () => {
        const cache = open(manual());
        const plan = item(/Сарын төлөвлөгөө, гүйцэтгэл \(11-р сар\)/);
        expect(plan).toHaveTextContent('Зарим нь хоосон');
        expect(plan).toHaveTextContent('Төлөвлөгөө орсон: гэрээний дүн.');
        expect(plan).toHaveTextContent('Төлөвлөгөө хоосон: гэрээний тоо — эдгээрийн биелэлтийн хувь «—» гарна.');
        // Мөнгөн урсгалыг харах эрхгүй хүнд огт дурдахгүй.
        expect(plan).not.toHaveTextContent('мөнгөн урсгал');
        expect(plan).toHaveTextContent('Гүйцэтгэлийг гараар оруулаагүй — системийн бүртгэлээр тооцно (заавал биш).');
        expect(within(item('Дуудлага, чат, уулзалт')).getByRole('link', { name: 'Өдрийн тайлан' })).toHaveAttribute('href', '/dashboard/daily-report');
        cache.clear();
    });

    it('shows who fixes it instead of controls the server would refuse', () => {
        const cache = open(manual(), { canEditContracts: false, canOpenContracts: false, canEditPlan: false, canOpenDaily: false });
        expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
        expect(screen.queryByLabelText(/захиалга өгсөн огноо/)).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Төлөвлөгөө/ })).not.toBeInTheDocument();
        expect(item('Гэрээний огноо')).toHaveTextContent('Огноог удирдлага (гэрээ засах эрхтэй хүн) оруулна.');
        expect(screen.queryByRole('link')).not.toBeInTheDocument();
        expect(item('Гэрээний менежер')).toHaveTextContent('Менежерийг удирдлага (гэрээ засах эрхтэй хүн) сонгоно.');
        expect(screen.getByText('Төлөвлөгөө, гүйцэтгэлийг удирдлага (супер админ) оруулна.')).toBeInTheDocument();
        expect(mocks.json).not.toHaveBeenCalled();
        cache.clear();
    });

    it('says nothing is left once every row is complete, and that manual actuals replace the system figures', () => {
        const cache = open(manual({ managerless: { count: 0, contracts: [] }, undated: 0, undatedContracts: [],
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
        expect(screen.queryByRole('list', { name: 'Огноогүй гэрээ' })).not.toBeInTheDocument();
        expect(item(/Сарын төлөвлөгөө/)).toHaveTextContent('Оруулаагүй');
        expect(within(item(/Сарын төлөвлөгөө/)).getByRole('button', { name: 'Төлөвлөгөө оруулах' })).toBeInTheDocument();
        cache.clear();
    });

    it('never shows a failed load as «nothing to fix»', () => {
        const cache = open(undefined);
        expect(screen.getByText(/Гараар нөхөх зүйлсийг ачаалж чадсангүй\. Сүлжээний алдаа/)).toBeInTheDocument();
        expect(screen.queryByRole('status')).not.toBeInTheDocument();
        cache.clear();
    });
});
