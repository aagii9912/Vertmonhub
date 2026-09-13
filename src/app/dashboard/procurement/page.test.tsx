import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import ProcurementPage from './page';
import { dashboardFetch } from '@/lib/api/dashboardFetch';

vi.mock('@/lib/api/dashboardFetch', () => ({ dashboardFetch: vi.fn() }));
vi.mock('@/components/ui/DataTable', () => ({
    DataTable: ({ data, columns }: { data: Record<string, unknown>[]; columns: { key: string; cell: (row: Record<string, unknown>) => React.ReactNode }[] }) =>
        <div>{data.map(row => <div key={String(row.id)}>{columns.find(c => c.key === 'action')?.cell(row)}</div>)}</div>,
}));
const bill = { id: 'bill-1', bill_number: 'B-1', total_amount: 1000, paid_amount: 0, status: 'pending', due_date: null };
let writes: Record<string, unknown>[];
let firstResponse: 'lost' | 'rejected';
let committed: boolean;
let loseSecondResponse: boolean;

beforeEach(() => {
    writes = [];
    firstResponse = 'lost';
    committed = false;
    loseSecondResponse = false;
    vi.mocked(dashboardFetch).mockImplementation(async (path, init) => {
        if (init?.method === 'POST') {
            const payload = JSON.parse(String(init.body));
            writes.push(payload);
            if (writes.length === 1) {
                if (firstResponse === 'rejected') return Response.json({ error: 'Дүн буруу' }, { status: 400 });
                committed = true;
                throw new TypeError('Network connection lost after payment');
            }
            if (writes.length === 2 && loseSecondResponse) throw new TypeError('Retry response lost');
            if (committed && JSON.stringify(payload) !== JSON.stringify(writes[0])) return Response.json({ error: 'Changed replay payload' }, { status: 409 });
            committed = true;
            return Response.json({ success: true, status: 'partial', paid_amount: 125 });
        }
        const url = String(path);
        if (url.endsWith('/summary')) return Response.json({ summary: { totalBills: 1, totalPayable: 1000, outstanding: committed ? 875 : 1000, overdueAmount: 0, monthSpend: 0 } });
        if (url.endsWith('/bills')) return Response.json({ bills: [{ ...bill, paid_amount: committed ? 125 : 0 }] });
        return Response.json({ vendors: [], accounts: [], projects: [] });
    });
});

async function openPayment() {
    fireEvent.click(await screen.findByRole('button', { name: /^Төлөх$/ }));
    return within(await screen.findByRole('dialog'));
}

describe('vendor payment UI recovery', () => {
    it('restores the exact submitted payload after an uncertain partial payment and modal reopen', async () => {
        render(<ProcurementPage />);
        let dialog = await openPayment();
        fireEvent.change(dialog.getByLabelText('Дүн (₮)'), { target: { value: '125' } });
        fireEvent.change(dialog.getByLabelText('Төлсөн огноо (Улаанбаатар)'), { target: { value: '2026-09-01' } });
        fireEvent.change(dialog.getByLabelText('Хэлбэр'), { target: { value: 'cash' } });
        fireEvent.click(dialog.getByRole('button', { name: /^Төлөх$/ }));
        await screen.findByText('Network connection lost after payment');
        expect(dialog.getByLabelText('Дүн (₮)')).toBeDisabled();
        expect(dialog.queryByRole('button', { name: 'Мэдээллийг засах' })).not.toBeInTheDocument();
        fireEvent.click(dialog.getByRole('button', { name: 'Дараа үргэлжлүүлэх' }));

        dialog = await openPayment();
        expect(dialog.getByLabelText('Дүн (₮)')).toHaveValue(125);
        expect(dialog.getByLabelText('Төлсөн огноо (Улаанбаатар)')).toHaveValue('2026-09-01');
        expect(dialog.getByLabelText('Хэлбэр')).toHaveValue('cash');
        expect(dialog.getByLabelText('Хэлбэр')).toBeDisabled();
        fireEvent.click(dialog.getByRole('button', { name: 'Ижил төлөлтөөр дахин шалгах' }));
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
        expect(writes).toHaveLength(2);
        expect(writes[1]).toEqual(writes[0]);

        dialog = await openPayment();
        expect(dialog.getByLabelText('Дүн (₮)')).toHaveValue(875);
        expect(dialog.getByLabelText('Дүн (₮)')).toBeEnabled();
    });

    it('starts an editable new attempt only after an explicit edit following a definitive rejection', async () => {
        firstResponse = 'rejected';
        render(<ProcurementPage />);
        const dialog = await openPayment();
        fireEvent.click(dialog.getByRole('button', { name: /^Төлөх$/ }));
        await screen.findByText('Дүн буруу');
        expect(dialog.getByLabelText('Дүн (₮)')).toBeDisabled();
        fireEvent.click(dialog.getByRole('button', { name: 'Мэдээллийг засах' }));
        expect(dialog.getByLabelText('Дүн (₮)')).toBeEnabled();
        fireEvent.change(dialog.getByLabelText('Дүн (₮)'), { target: { value: '125' } });
        fireEvent.click(dialog.getByRole('button', { name: /^Төлөх$/ }));
        await waitFor(() => expect(writes).toHaveLength(2));
        expect(writes[1].client_request_id).not.toEqual(writes[0].client_request_id);
        expect(writes[1].amount).toBe(125);
    });

    it('returns to uncertain recovery if retrying a rejected request loses its response', async () => {
        firstResponse = 'rejected';
        loseSecondResponse = true;
        render(<ProcurementPage />);
        const dialog = await openPayment();
        fireEvent.click(dialog.getByRole('button', { name: /^Төлөх$/ }));
        await screen.findByText('Дүн буруу');
        expect(dialog.getByRole('button', { name: 'Мэдээллийг засах' })).toBeInTheDocument();
        fireEvent.click(dialog.getByRole('button', { name: 'Ижил төлөлтөөр дахин шалгах' }));
        await screen.findByText('Retry response lost');
        expect(dialog.queryByRole('button', { name: 'Мэдээллийг засах' })).not.toBeInTheDocument();
        expect(dialog.getByLabelText('Дүн (₮)')).toBeDisabled();
        expect(writes[1]).toEqual(writes[0]);
    });
});
