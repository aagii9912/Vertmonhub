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
import { toast } from 'sonner';

let months: MonthlySalesMonth[];
let posts: Array<{ shopId: string; year: number; months: MonthlySalesPatch[] }>;
let failureStatus: number;
let extrasAvailable: boolean | undefined;
let managers: Array<{ name: string; is_active: boolean; user_id: string | null; year_actual: number; project_ids: string[] }>;
let renames: Array<{ shopId: string; oldName: string; newName: string }>;
let renameFailure: { status: number; error: string } | null;
const none = { value: null, lowerBound: false };
const metrics = (count: number | null, amount: number | null, lowerBound = false) => ({
    contract_count: { value: count, lowerBound }, contract: { value: amount, lowerBound }, cashflow: none,
});
// Төлөвлөгөөний биелэлтийн системийн дүн: 1-р сард Б1-д 3+ гэрээ (огноогүй гэрээтэй), бусад нь тодорхойгүй.
const system = {
    months: Array.from({ length: 12 }, (_, index) => ({
        month: index + 1, status: 'past',
        total: index === 0 ? metrics(3, 100, true) : metrics(null, null, true),
        blocks: { b1: index === 0 ? metrics(3, 100, true) : metrics(null, null, true), b2: metrics(null, null, true), parking: metrics(null, null, true) },
        outside: index === 0 ? { count: 1, amount: 40 } : { count: 0, amount: 0 },
    })),
    year: metrics(3, 100, true), undated: 2, source: 'Төслийн бүх гэрээ (менежерээр шүүхгүй)',
};
const year = new Date().getFullYear();
const label = (field: string, block = 'Б1 блок') => `${year} оны 1-р сар ${block} ${field}`;
const open = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}>
    <SalesTargetsAdminPage />
</QueryClientProvider>);
const saveButton = () => screen.getByRole('button', { name: 'Төлөвлөгөө, гүйцэтгэл хадгалах' });

beforeEach(() => {
    months = emptyMonthlySales(); posts = []; failureStatus = 0; extrasAvailable = undefined; managers = []; renames = []; renameFailure = null;
    vi.mocked(toast.success).mockClear(); vi.mocked(toast.error).mockClear();
    vi.mocked(fetch).mockImplementation(async (url, init) => {
        if (String(url) === '/api/admin/shops') return Response.json({ shops: [{ id: shopId, name: 'Elysium' }] });
        if (String(url) === '/api/admin/sales-targets/rename') {
            const body = JSON.parse(String(init!.body)); renames.push(body);
            if (renameFailure) return Response.json({ error: renameFailure.error }, { status: renameFailure.status });
            managers = managers.map(manager => manager.name === body.oldName ? { ...manager, name: body.newName } : manager);
            return Response.json({ success: true, oldName: body.oldName, newName: body.newName, counts: { leads: 57 }, summary: '57 лид' });
        }
        if (init?.method === 'POST') {
            const body = JSON.parse(String(init.body)); posts.push(body);
            if (failureStatus) return Response.json({ error: 'Хадгалсангүй' }, { status: failureStatus });
            for (const patch of body.months as MonthlySalesPatch[]) {
                const { month, expectedRevision: _revision, block_amounts, activity_targets, ...fields } = patch;
                const row = { ...months[month - 1], ...fields, block_amounts: { ...months[month - 1].block_amounts } };
                // RPC-тэй ижил: идэвхжлийн түлхүүрүүдийг нэгтгэнэ, null түлхүүр арилна, бүгд арилбал null.
                if (activity_targets !== undefined) {
                    const merged = Object.entries({ ...row.activity_targets, ...activity_targets }).filter(([, value]) => value !== null);
                    row.activity_targets = activity_targets === null || !merged.length ? null : Object.fromEntries(merged);
                }
                for (const block of MONTHLY_SALES_BLOCKS) {
                    if (block_amounts?.[block]) row.block_amounts[block] = { ...row.block_amounts[block], ...block_amounts[block] };
                }
                months[month - 1] = monthlySalesWithBlockTotals({ ...row, revision: row.revision + 1 });
            }
            return Response.json({ success: true, months: body.months.map((patch: MonthlySalesPatch) => months[patch.month - 1]) });
        }
        return Response.json({ months, system, managers, teamMembers: [], projects: [], ...(extrasAvailable === undefined ? {} : { extrasAvailable }) });
    });
});

// 217 нүдтэй маягт: ачаалал ихтэй CI/машин дээр 5 секундээс удаж болно.
describe('monthly sales administration form', { timeout: 15_000 }, () => {
    it('shows 216 labelled block cells and saves explicit zero without filling other metrics', async () => {
        open();
        const cashActual = await screen.findByRole('textbox', { name: label('Орсон мөнгөний гүйцэтгэл') });
        // 12 months × 3 blocks × (2 counts + 4 amounts), 12 months × (2 stretch + 5 activity plans), plus the manager field.
        expect(screen.getAllByRole('textbox')).toHaveLength(301);
        expect(cashActual).toHaveValue('');
        expect(saveButton()).toBeDisabled();
        fireEvent.change(cashActual, { target: { value: '0' } });
        fireEvent.click(saveButton());
        await waitFor(() => expect(posts).toHaveLength(1));
        expect(posts[0]).toEqual({ shopId, year, months: [{ month: 1, expectedRevision: 0, block_amounts: { b1: { manual_cashflow_actual_amount: 0 } } }] });
        await waitFor(() => expect(saveButton()).toBeDisabled());
        expect(screen.getByRole('textbox', { name: label('Орсон мөнгөний гүйцэтгэл') })).toHaveValue('0');
        expect(screen.getByRole('textbox', { name: label('Гэрээний гүйцэтгэл') })).toHaveValue('');
        expect(screen.getByText(/CRM-ээр тооцсон гэрээ ·/)).toHaveTextContent('3+ гэрээ · 100₮+');
        expect(screen.getByText(/Огноогүй 2 гэрээ сард ороогүй/)).toBeInTheDocument();
        expect(screen.getByText(/Төлөвлөгөөгүй 1 гэрээ · 40₮/)).toBeInTheDocument();
        // Б1-ийн гүйцэтгэлийн нүдний доор системийн дүн — гар утгыг солихгүй.
        expect(screen.getAllByText('Систем: 100₮+').length).toBe(2);
        expect(screen.getAllByText('Систем: 3+').length).toBe(2);
    });

    it('takes whole contract counts and shows each attainment % after the actual', async () => {
        open();
        const countPlan = await screen.findByRole('textbox', { name: label('Гэрээний тооны төлөвлөгөө') });
        fireEvent.change(countPlan, { target: { value: '1.5' } });
        expect(countPlan).toHaveAttribute('aria-invalid', 'true');
        expect(saveButton()).toBeDisabled();
        expect(screen.getByRole('alert')).toHaveTextContent('бүхэл тоо');
        fireEvent.change(countPlan, { target: { value: '100' } });
        fireEvent.change(screen.getByRole('textbox', { name: label('Гэрээний тооны гүйцэтгэл') }), { target: { value: '80' } });
        expect(screen.getByLabelText(label('Гэрээний тоо гүйцэтгэлийн хувь'))).toHaveTextContent('80%');
        expect(screen.getByLabelText(label('Гэрээний тоо гүйцэтгэлийн хувь', 'Нийт'))).toHaveTextContent('80%');
        expect(screen.getByLabelText(label('Гэрээний тооны төлөвлөгөө', 'Нийт'))).toHaveTextContent(/^100$/);
        expect(screen.getByLabelText(label('Гэрээний тооны төлөвлөгөө', 'Нийт'))).not.toHaveTextContent('₮');
        expect(screen.getByLabelText(label('Гэрээний дүн гүйцэтгэлийн хувь'))).toHaveTextContent('—');
        expect(screen.getByLabelText(`${year} оны жилийн Гэрээний тоо гүйцэтгэлийн хувь`)).toHaveTextContent('80%');
        fireEvent.click(saveButton());
        await waitFor(() => expect(posts).toHaveLength(1));
        expect(posts[0].months).toEqual([{ month: 1, expectedRevision: 0, block_amounts: {
            b1: { contract_count_target: 100, manual_contract_count_actual: 80 },
        } }]);
        await waitFor(() => expect(saveButton()).toBeDisabled());
        expect(months[0]).toMatchObject({ contract_count_target: 100, manual_contract_count_actual: 80, target_amount: null });
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

    it('saves month-level stretch and activity plans with the same revision, merging only changed activity keys', async () => {
        open();
        const stretch = await screen.findByRole('textbox', { name: `${year} оны 10-р сар Нэмэлт төлөвлөгөө (гэрээ)` });
        const stretchCash = screen.getByRole('textbox', { name: `${year} оны 10-р сар Нэмэлт төлөвлөгөө (мөнгө)` });
        const hotline = screen.getByRole('textbox', { name: `${year} оны 10-р сар 7786 / төслийн утас` });
        const chats = screen.getByRole('textbox', { name: `${year} оны 10-р сар Чат` });
        expect(screen.getByRole('columnheader', { name: 'Менежерийн дугаар' })).toBeInTheDocument();
        fireEvent.change(stretch, { target: { value: '7,152,996,000' } });
        fireEvent.change(stretchCash, { target: { value: '2145898800' } });
        fireEvent.change(hotline, { target: { value: '380' } });
        fireEvent.change(chats, { target: { value: '0' } });
        fireEvent.click(saveButton());
        await waitFor(() => expect(posts).toHaveLength(1));
        expect(posts[0].months).toEqual([{ month: 10, expectedRevision: 0, stretch_target_amount: 7152996000,
            stretch_cashflow_target_amount: 2145898800, activity_targets: { hotline: 380, chats: 0 } }]);
        await waitFor(() => expect(saveButton()).toBeDisabled());
        expect(months[9]).toMatchObject({ revision: 1, stretch_target_amount: 7152996000, activity_targets: { hotline: 380, chats: 0 }, target_amount: null });
        expect(screen.getByRole('textbox', { name: `${year} оны 10-р сар Нэмэлт төлөвлөгөө (гэрээ)` })).toHaveValue('7,152,996,000');
        expect(screen.getByRole('textbox', { name: `${year} оны 10-р сар Чат` })).toHaveValue('0');

        fireEvent.change(screen.getByRole('textbox', { name: `${year} оны 10-р сар 7786 / төслийн утас` }), { target: { value: '' } });
        fireEvent.change(screen.getByRole('textbox', { name: `${year} оны 10-р сар Шинэ уулзалт` }), { target: { value: '70' } });
        fireEvent.click(saveButton());
        await waitFor(() => expect(posts).toHaveLength(2));
        expect(posts[1].months).toEqual([{ month: 10, expectedRevision: 1, activity_targets: { hotline: null, meetings_new: 70 } }]);
        await waitFor(() => expect(months[9].activity_targets).toEqual({ chats: 0, meetings_new: 70 }));
    });

    it('blocks invalid stretch or activity input with its own message and disables the section without the migration', async () => {
        open();
        const meetings = await screen.findByRole('textbox', { name: `${year} оны 1-р сар Давтан уулзалт` });
        fireEvent.change(meetings, { target: { value: '1.5' } });
        expect(meetings).toHaveAttribute('aria-invalid', 'true');
        expect(saveButton()).toBeDisabled();
        expect(screen.getByRole('alert')).toHaveTextContent('идэвхжлийн төлөвлөгөө 0–1,000,000');
        fireEvent.change(meetings, { target: { value: '15' } });
        fireEvent.change(screen.getByRole('textbox', { name: `${year} оны 1-р сар Нэмэлт төлөвлөгөө (мөнгө)` }), { target: { value: '-1' } });
        expect(saveButton()).toBeDisabled();
        expect(screen.getByRole('alert')).toHaveTextContent('Нэмэлт төлөвлөгөө');
    });

    it('shows the extras as read-only until the database update exists', async () => {
        extrasAvailable = false;
        open();
        const stretch = await screen.findByRole('textbox', { name: `${year} оны 1-р сар Нэмэлт төлөвлөгөө (гэрээ)` });
        expect(stretch).toBeDisabled();
        expect(screen.getByRole('textbox', { name: `${year} оны 1-р сар Чат` })).toBeDisabled();
        expect(screen.getByRole('status')).toHaveTextContent('шинэчлэл хийгдээгүй');
        expect(screen.getByRole('textbox', { name: label('Гэрээний төлөвлөгөө') })).toBeEnabled();
    });
});

describe('roster rename', () => {
    beforeEach(() => {
        managers = [{ name: 'Khongoroo', is_active: true, user_id: '10000000-0000-4000-8000-000000000009', year_actual: 0, project_ids: [] }];
    });

    it('renames a roster entry through the audited endpoint and reloads the roster', async () => {
        open();
        fireEvent.click(await screen.findByRole('button', { name: 'Нэр солих' }));
        const input = screen.getByLabelText('«Khongoroo» — шинэ нэр');
        expect(input).toHaveValue('Khongoroo');
        const submit = screen.getByRole('button', { name: 'Нэрийг солих' });
        expect(submit).toBeDisabled();
        fireEvent.change(input, { target: { value: '  Хонгорзул.Мөнхгэрэл ' } });
        fireEvent.click(submit);
        await waitFor(() => expect(renames).toEqual([{ shopId, oldName: 'Khongoroo', newName: 'Хонгорзул.Мөнхгэрэл' }]));
        await waitFor(() => expect(toast.success).toHaveBeenCalledWith('«Khongoroo» → «Хонгорзул.Мөнхгэрэл»: 57 лид'));
        expect(await screen.findByText('Хонгорзул.Мөнхгэрэл')).toBeInTheDocument();
        expect(screen.queryByLabelText(/шинэ нэр/)).not.toBeInTheDocument();
    });

    it('keeps the form open and reports a conflict without renaming', async () => {
        renameFailure = { status: 409, error: 'Бүртгэлд «Ариунбилэг» нэртэй менежер аль хэдийн байна' };
        open();
        fireEvent.click(await screen.findByRole('button', { name: 'Нэр солих' }));
        fireEvent.change(screen.getByLabelText('«Khongoroo» — шинэ нэр'), { target: { value: 'Ариунбилэг' } });
        fireEvent.click(screen.getByRole('button', { name: 'Нэрийг солих' }));
        await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Бүртгэлд «Ариунбилэг» нэртэй менежер аль хэдийн байна'));
        expect(screen.getByLabelText('«Khongoroo» — шинэ нэр')).toHaveValue('Ариунбилэг');
        expect(screen.getByText('Khongoroo')).toBeInTheDocument();
    });
});
