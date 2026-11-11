// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { emptyMonthlySales, type MonthlySalesMonth } from '@/lib/sales/monthly';

const mocks = vi.hoisted(() => ({ success: vi.fn(), close: vi.fn(), dirty: vi.fn() }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ shop: { id: 'shop-1' }, user: { id: 'user-1' } }) }));
vi.mock('sonner', () => ({ toast: { success: (...args: unknown[]) => mocks.success(...args), error: vi.fn() } }));

import { WeeklyPlanEditor } from './WeeklyPlanEditor';

const fetchMock = vi.fn();
const reply = (status: number, body: unknown) => ({ ok: status < 400, status, json: async () => body });
/** 11-р сар: Б1-ийн гэрээний дүнгийн төлөвлөгөө блокоор орсон, бусад нь хоосон. */
function months(november: Partial<MonthlySalesMonth> = {}): MonthlySalesMonth[] {
    const rows = emptyMonthlySales();
    rows[10] = { ...rows[10], revision: 4, target_amount: 900_000_000, block_amounts: { b1: { target_amount: 900_000_000 } }, ...november };
    return rows;
}
function open(data: MonthlySalesMonth[] = months()) {
    fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => init?.method === 'POST' ? reply(200, { success: true, months: [] }) : reply(200, { year: 2026, months: data, extrasAvailable: true }));
    const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={cache}><WeeklyPlanEditor shopId="shop-1" month="2026-11" onClose={mocks.close} onDirty={mocks.dirty} /></QueryClientProvider>);
    return cache;
}
const cell = (name: string) => screen.findByRole('textbox', { name }) as Promise<HTMLInputElement>;
const posts = () => fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST').map(([, init]) => JSON.parse(init.body as string));

beforeEach(() => { vi.stubGlobal('fetch', fetchMock); });
afterEach(() => { vi.clearAllMocks(); vi.unstubAllGlobals(); });

describe('weekly report: inline month plan editor', () => {
    it('shows the report month\'s block plan and saves only the changed cell against the revision it read', async () => {
        const cache = open();
        const invalidate = vi.spyOn(cache, 'invalidateQueries');
        expect(await cell('Б1 блок Гэрээний төлөвлөгөө')).toHaveValue('900,000,000');
        expect(fetchMock).toHaveBeenCalledWith('/api/admin/sales-targets?shopId=shop-1&year=2026&only=months', expect.anything());
        // Анхдагчаар зөвхөн төлөвлөгөө: 3 блок × 3 үзүүлэлт. Гүйцэтгэл заавал биш тул нуугдмал.
        expect(screen.getAllByRole('textbox')).toHaveLength(9);
        expect(screen.getByRole('cell', { name: 'Нийт Гэрээний төлөвлөгөө' })).toHaveTextContent('900,000,000');
        expect(screen.getByRole('button', { name: 'Хадгалах' })).toBeDisabled();

        fireEvent.change(await cell('Б2 блок Гэрээний төлөвлөгөө'), { target: { value: '600000000' } });
        fireEvent.blur(await cell('Б2 блок Гэрээний төлөвлөгөө'));
        expect(await cell('Б2 блок Гэрээний төлөвлөгөө')).toHaveValue('600,000,000');
        fireEvent.change(await cell('Б1 блок Гэрээний тооны төлөвлөгөө'), { target: { value: '4' } });
        expect(screen.getByRole('cell', { name: 'Нийт Гэрээний төлөвлөгөө' })).toHaveTextContent('1,500,000,000');
        await waitFor(() => expect(mocks.dirty).toHaveBeenLastCalledWith(true));

        fireEvent.click(screen.getByRole('button', { name: 'Хадгалах' }));
        await waitFor(() => expect(posts()).toEqual([{ shopId: 'shop-1', year: 2026, months: [{ month: 11, expectedRevision: 4,
            block_amounts: { b1: { contract_count_target: 4 }, b2: { target_amount: 600_000_000 } } }] }]));
        await waitFor(() => expect(mocks.close).toHaveBeenCalled());
        expect(mocks.success).toHaveBeenCalledWith('Төлөвлөгөө, гүйцэтгэл хадгалагдлаа');
        // Тайлан, энэ алхам, төлөвлөгөөний хуудас шинэ дүнгээр дахин уншина.
        for (const key of ['weekly-manual', 'weekly-sales', 'operations-report', 'plan-performance', 'admin-sales-targets'])
            expect(invalidate).toHaveBeenCalledWith({ queryKey: [key, 'shop-1'] });
        await waitFor(() => expect(mocks.dirty).toHaveBeenLastCalledWith(false));
        cache.clear();
    });

    it('never saves text that is not a number and never coerces it', async () => {
        const cache = open();
        fireEvent.change(await cell('Зогсоол Гэрээний тооны төлөвлөгөө'), { target: { value: '2.5' } });
        expect(await cell('Зогсоол Гэрээний тооны төлөвлөгөө')).toHaveAttribute('aria-invalid', 'true');
        expect(screen.getByRole('alert')).toHaveTextContent('Улаан хүрээтэй нүдний тоог засна уу');
        expect(screen.getByRole('button', { name: 'Хадгалах' })).toBeDisabled();
        // Хадгалаагүй (буруу) засвар байгаа тул хуудас алхам солихыг хаана.
        await waitFor(() => expect(mocks.dirty).toHaveBeenLastCalledWith(true));
        fireEvent.click(screen.getByRole('button', { name: 'Болих' }));
        expect(mocks.close).toHaveBeenCalled();
        expect(posts()).toEqual([]);
        cache.clear();
    });

    it('offers the manual actuals only on request, and opens them when the month already has one', async () => {
        const cache = open();
        await cell('Б1 блок Гэрээний төлөвлөгөө');
        expect(screen.queryByRole('textbox', { name: 'Б1 блок Орсон мөнгөний гүйцэтгэл' })).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('checkbox', { name: /Гүйцэтгэлийг гараар оруулах/ }));
        expect(screen.getAllByRole('textbox')).toHaveLength(18);
        fireEvent.change(await cell('Б1 блок Орсон мөнгөний гүйцэтгэл'), { target: { value: '0' } });
        fireEvent.click(screen.getByRole('button', { name: 'Хадгалах' }));
        // 0 бол оруулсан утга (хоосон биш).
        await waitFor(() => expect(posts()[0].months).toEqual([{ month: 11, expectedRevision: 4, block_amounts: { b1: { manual_cashflow_actual_amount: 0 } } }]));
        cache.clear();
    });

    it('opens the actuals and names a legacy total that was saved without a block breakdown', async () => {
        const cache = open(months({ manual_contract_actual_amount: 250_000_000 }));
        expect(await cell('Б1 блок Гэрээний гүйцэтгэл')).toHaveValue('');
        expect(screen.getByRole('checkbox', { name: /Гүйцэтгэлийг гараар оруулах/ })).toBeChecked();
        expect(screen.getByText(/Блокоор задлаагүй хадгалсан нийт дүн: Гэрээний гүйцэтгэл 250,000,000/)).toBeInTheDocument();
        // Блокийн нүдэнд оруулах хүртэл хуучин нийт дүн хэвээр.
        expect(screen.getByRole('cell', { name: 'Нийт Гэрээний гүйцэтгэл' })).toHaveTextContent('250,000,000');
        cache.clear();
    });

    it('keeps the entry and offers a reload when someone else changed the month meanwhile', async () => {
        const cache = open();
        fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => init?.method === 'POST'
            ? reply(409, { error: 'Энэ сарын мэдээллийг өөр хэрэглэгч өөрчилсөн.', code: 'MONTHLY_SALES_CONFLICT' })
            : reply(200, { year: 2026, months: months({ revision: 5, target_amount: 1_000_000_000, block_amounts: { b1: { target_amount: 1_000_000_000 } } }), extrasAvailable: true }));
        fireEvent.change(await cell('Б2 блок Гэрээний төлөвлөгөө'), { target: { value: '600000000' } });
        fireEvent.click(screen.getByRole('button', { name: 'Хадгалах' }));
        expect(await screen.findByText(/өөр хэрэглэгч өөрчилсөн/)).toBeInTheDocument();
        expect(mocks.close).not.toHaveBeenCalled();
        expect(await cell('Б2 блок Гэрээний төлөвлөгөө')).toHaveValue('600000000');
        expect(screen.getByRole('button', { name: 'Хадгалах' })).toBeDisabled();
        fireEvent.click(screen.getByRole('button', { name: 'Шинэ мэдээллийг авах' }));
        await waitFor(async () => expect(await cell('Б1 блок Гэрээний төлөвлөгөө')).toHaveValue('1,000,000,000'));
        expect(await cell('Б2 блок Гэрээний төлөвлөгөө')).toHaveValue('');
        cache.clear();
    });

    it('shows a failed read with a retry instead of an empty plan', async () => {
        fetchMock.mockResolvedValue(reply(503, { error: 'Төлөвлөгөө татахад алдаа гарлаа' }));
        const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
        render(<QueryClientProvider client={cache}><WeeklyPlanEditor shopId="shop-1" month="2026-11" onClose={mocks.close} onDirty={mocks.dirty} /></QueryClientProvider>);
        expect(await screen.findByText(/Төлөвлөгөө татахад алдаа гарлаа/)).toBeInTheDocument();
        expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Дахин оролдох' })).toBeInTheDocument();
        cache.clear();
    });
});
