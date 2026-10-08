import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyMonthlySales, monthlySalesWithBlockTotals, MONTHLY_SALES_BLOCKS, type MonthlySalesMonth, type MonthlySalesPatch } from '@/lib/sales/monthly';
import SalesTargetsAdminPage from './page';

const shopId = '20000000-0000-4000-8000-000000000001';
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({
    shop: { id: '20000000-0000-4000-8000-000000000001' },
    shops: [{ id: '20000000-0000-4000-8000-000000000001', name: 'Elysium' }],
    user: { id: '10000000-0000-4000-8000-000000000001', role: 'super_admin' },
}) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

let months: MonthlySalesMonth[];
let posts: Array<{ shopId: string; year: number; months: MonthlySalesPatch[] }>;
let failureStatus: number;
const year = new Date().getFullYear();
const label = (field: string, block = 'Б1 блок') => `${year} оны 1-р сар ${block} ${field}`;
const open = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}>
    <SalesTargetsAdminPage />
</QueryClientProvider>);
const saveButton = () => screen.getByRole('button', { name: 'Төлөвлөгөө, гүйцэтгэл хадгалах' });

beforeEach(() => {
    months = emptyMonthlySales(); posts = []; failureStatus = 0;
    vi.mocked(fetch).mockImplementation(async (url, init) => {
        if (String(url) === '/api/admin/shops') return Response.json({ shops: [{ id: shopId, name: 'Elysium' }] });
        if (init?.method === 'POST') {
            const body = JSON.parse(String(init.body)); posts.push(body);
            if (failureStatus) return Response.json({ error: 'Хадгалсангүй' }, { status: failureStatus });
            for (const patch of body.months as MonthlySalesPatch[]) {
                const { month, expectedRevision: _revision, block_amounts, ...fields } = patch;
                const row = { ...months[month - 1], ...fields, block_amounts: { ...months[month - 1].block_amounts } };
                for (const block of MONTHLY_SALES_BLOCKS) {
                    if (block_amounts?.[block]) row.block_amounts[block] = { ...row.block_amounts[block], ...block_amounts[block] };
                }
                months[month - 1] = monthlySalesWithBlockTotals({ ...row, revision: row.revision + 1 });
            }
            return Response.json({ success: true, months: body.months.map((patch: MonthlySalesPatch) => months[patch.month - 1]) });
        }
        return Response.json({ months, teamActual: [100, ...Array(11).fill(0)], managers: [], teamMembers: [], projects: [] });
    });
});

describe('monthly sales administration form', () => {
    it('shows 144 labelled block cells and saves explicit zero without filling other metrics', async () => {
        open();
        const cashActual = await screen.findByRole('textbox', { name: label('Орсон мөнгөний гүйцэтгэл') });
        expect(screen.getAllByRole('textbox')).toHaveLength(145); // 12 months × 3 blocks × 4 amounts, plus the manager field.
        expect(cashActual).toHaveValue('');
        expect(saveButton()).toBeDisabled();
        fireEvent.change(cashActual, { target: { value: '0' } });
        fireEvent.click(saveButton());
        await waitFor(() => expect(posts).toHaveLength(1));
        expect(posts[0]).toEqual({ shopId, year, months: [{ month: 1, expectedRevision: 0, block_amounts: { b1: { manual_cashflow_actual_amount: 0 } } }] });
        await waitFor(() => expect(saveButton()).toBeDisabled());
        expect(screen.getByRole('textbox', { name: label('Орсон мөнгөний гүйцэтгэл') })).toHaveValue('0');
        expect(screen.getByRole('textbox', { name: label('Гэрээний гүйцэтгэл') })).toHaveValue('');
        expect(screen.getByText(/CRM-ээр тооцсон гэрээний дүн/)).toHaveTextContent('100');
    });

    it('retains a failed-save draft and blocks invalid negative monetary input', async () => {
        failureStatus = 503;
        open();
        const contractPlan = await screen.findByRole('textbox', { name: label('Гэрээний төлөвлөгөө') });
        fireEvent.change(contractPlan, { target: { value: '-5' } });
        expect(contractPlan).toHaveAttribute('aria-invalid', 'true');
        expect(saveButton()).toBeDisabled();
        fireEvent.change(contractPlan, { target: { value: '105' } });
        fireEvent.click(saveButton());
        await waitFor(() => expect(posts).toHaveLength(1));
        await waitFor(() => expect(saveButton()).toBeEnabled());
        expect(contractPlan).toHaveValue('105');
    });

    it('preserves conflicting edits until the user explicitly reloads and clears them', async () => {
        failureStatus = 409;
        open();
        const contractPlan = await screen.findByRole('textbox', { name: label('Гэрээний төлөвлөгөө') });
        fireEvent.change(contractPlan, { target: { value: '105' } });
        months[0] = { ...months[0], target_amount: 200, revision: 1, block_amounts: { b1: { target_amount: 200 } } };
        fireEvent.click(saveButton());
        const reload = await screen.findByRole('button', { name: 'Серверийн шинэ утгыг авах · миний засварыг цэвэрлэх' });
        expect(contractPlan).toHaveValue('105');
        expect(saveButton()).toBeDisabled();
        fireEvent.click(reload);
        await waitFor(() => expect(contractPlan).toHaveValue('200'));
        expect(saveButton()).toBeDisabled();
    });

    it('preserves unallocated totals and calculates each metric across all three blocks before saving', async () => {
        months[0].cashflow_target_amount = 50;
        open();
        const b1 = await screen.findByRole('textbox', { name: label('Гэрээний төлөвлөгөө') });
        expect(screen.getByLabelText(label('Орсон мөнгөний төлөвлөгөө', 'Нийт'))).toHaveTextContent('50');
        expect(screen.getByLabelText(label('Орсон мөнгөний төлөвлөгөө'))).toHaveValue('');
        fireEvent.change(b1, { target: { value: '100' } });
        fireEvent.change(screen.getByLabelText(label('Гэрээний төлөвлөгөө', 'Б2 блок')), { target: { value: '200' } });
        fireEvent.change(screen.getByLabelText(label('Гэрээний төлөвлөгөө', 'Зогсоол')), { target: { value: '30' } });
        expect(screen.getByLabelText(label('Гэрээний төлөвлөгөө', 'Нийт'))).toHaveTextContent('330');
        expect(screen.getByLabelText(label('Орсон мөнгөний төлөвлөгөө', 'Нийт'))).toHaveTextContent('50');
        fireEvent.click(saveButton());
        await waitFor(() => expect(saveButton()).toBeDisabled());
        expect(posts[0].months).toEqual([{ month: 1, expectedRevision: 0, block_amounts: {
            b1: { target_amount: 100 }, b2: { target_amount: 200 }, parking: { target_amount: 30 },
        } }]);
        expect(months[0].target_amount).toBe(330);
        expect(months[0].cashflow_target_amount).toBe(50);
        fireEvent.change(b1, { target: { value: '10000000000000' } });
        expect(saveButton()).toBeDisabled();
        expect(screen.getByRole('alert')).toHaveTextContent('сарын нийлбэр');
    });
});
