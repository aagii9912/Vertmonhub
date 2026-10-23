import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

type Source = { id: string; name: string; sort_order: number; archived_at: string | null };
const mocks = vi.hoisted(() => ({
    referrals: undefined as { sources: Source[]; available: boolean } | undefined,
    referralState: 'ready' as 'ready' | 'loading' | 'error', refetch: vi.fn(), openChange: vi.fn(),
    mutate: vi.fn(), toastError: vi.fn(), toastSuccess: vi.fn(),
}));
vi.mock('sonner', () => ({ toast: { success: (...args: unknown[]) => mocks.toastSuccess(...args), error: (...args: unknown[]) => mocks.toastError(...args) } }));
vi.mock('@/lib/api/dashboardFetch', () => ({ dashboardMutate: (...args: unknown[]) => mocks.mutate(...args) }));
vi.mock('@/hooks/useDailyReport', () => ({ invalidateDailyMeetingQueries: async () => {} }));
vi.mock('@/hooks/useReferralSources', () => ({ useReferralSources: () => ({
    data: mocks.referrals, isLoading: mocks.referralState === 'loading', isError: mocks.referralState === 'error', isFetching: false, refetch: mocks.refetch,
}) }));

import { DailyMeetingDialog } from './DailyMeetingDialog';
import { REFERRAL_LIST_LOADING } from '@/lib/sales/referral-sources';

// jsdom-д ResizeObserver байхгүй (Radix Select).
vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });

const managers = [{ name: 'Чанцалдулам.Раднаа', title: 'Чанцалдулам', self: false }];
function renderDialog() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
        <QueryClientProvider client={client}>
            <DailyMeetingDialog open onOpenChange={mocks.openChange} date="2026-10-17" today="2026-10-19" managers={managers as never} defaultManager="Чанцалдулам.Раднаа" />
        </QueryClientProvider>,
    );
}
const fill = () => {
    fireEvent.change(screen.getByPlaceholderText('9909 1122'), { target: { value: '9911 2233' } });
    fireEvent.change(screen.getByPlaceholderText('Б. Болд'), { target: { value: 'Бат' } });
};

beforeEach(() => {
    vi.clearAllMocks();
    mocks.referrals = undefined;
    mocks.referralState = 'ready';
    mocks.mutate.mockResolvedValue({ ok: true, viewing_id: 'viewing', lead_id: 'lead', lead_created: true });
});

describe('daily report «Уулзалт нэмэх» — «Сэжим (хаанаас ирсэн)»', () => {
    it('requires the referral for a new customer when the project has a list, and sends the chosen id', async () => {
        mocks.referrals = { sources: [
            { id: 'ref-facebook', name: 'Facebook', sort_order: 10, archived_at: null },
            { id: 'ref-barmash', name: 'Бармаш түрээслэгч', sort_order: 20, archived_at: '2026-10-18T00:00:00Z' },
        ], available: true };
        const { container } = renderDialog();
        fill();
        expect(screen.getByRole('combobox', { name: 'Сэжим (хаанаас ирсэн)' })).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Бүртгэх' }));
        expect(mocks.toastError).toHaveBeenCalledWith('Шинэ харилцагчийн уулзалтад «Сэжим (хаанаас ирсэн)»-ийг сонгоно уу');
        expect(mocks.mutate).not.toHaveBeenCalled();

        // Radix Select-ийн нуусан native select (зөвхөн идэвхтэй сонголтууд).
        const native = [...container.ownerDocument.querySelectorAll('select')].find(select => [...select.options].some(option => option.value === 'ref-facebook'));
        expect(native && [...native.options].map(option => option.value).filter(Boolean)).toEqual(['ref-facebook']);
        fireEvent.change(native!, { target: { value: 'ref-facebook' } });
        fireEvent.click(screen.getByRole('button', { name: 'Бүртгэх' }));
        await waitFor(() => expect(mocks.mutate).toHaveBeenCalledWith('/api/dashboard/daily-report/meetings', 'POST', expect.objectContaining({
            action: 'record', meeting_type: 'new_customer', referral_source_id: 'ref-facebook',
        })));
    });

    it('lets a repeat customer through without it and hides the field without a list', async () => {
        mocks.referrals = { sources: [{ id: 'ref-facebook', name: 'Facebook', sort_order: 10, archived_at: null }], available: true };
        const first = renderDialog();
        fill();
        fireEvent.click(screen.getByRole('button', { name: 'Давтан' }));
        fireEvent.click(screen.getByRole('button', { name: 'Бүртгэх' }));
        await waitFor(() => expect(mocks.mutate).toHaveBeenCalledWith(expect.any(String), 'POST', expect.objectContaining({ meeting_type: 'repeat_customer' })));
        expect(mocks.mutate.mock.calls[0][2]).not.toHaveProperty('referral_source_id');
        first.unmount();

        mocks.mutate.mockClear();
        mocks.referrals = { sources: [], available: false };
        renderDialog();
        fill();
        expect(screen.queryByRole('combobox', { name: 'Сэжим (хаанаас ирсэн)' })).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Бүртгэх' }));
        await waitFor(() => expect(mocks.mutate).toHaveBeenCalledWith(expect.any(String), 'POST', expect.objectContaining({ meeting_type: 'new_customer' })));
        expect(mocks.mutate.mock.calls[0][2]).not.toHaveProperty('referral_source_id');
    });

    it('holds a new-customer meeting while the list loads or failed, with an inline retry', async () => {
        mocks.referralState = 'loading';
        const first = renderDialog();
        fill();
        expect(screen.getByRole('combobox', { name: 'Сэжим (хаанаас ирсэн)' })).toBeDisabled();
        expect(screen.getByText('Ачаалж байна…')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Бүртгэх' }));
        expect(mocks.toastError).toHaveBeenCalledWith(REFERRAL_LIST_LOADING);
        expect(mocks.mutate).not.toHaveBeenCalled();
        first.unmount();

        mocks.referralState = 'error';
        renderDialog();
        fill();
        expect(screen.getByText(/«Сэжим \(хаанаас ирсэн\)»-ийн жагсаалтыг уншиж чадсангүй/)).toHaveAttribute('role', 'alert');
        fireEvent.click(screen.getByRole('button', { name: 'Дахин оролдох' }));
        expect(mocks.refetch).toHaveBeenCalledTimes(1);
        fireEvent.click(screen.getByRole('button', { name: 'Бүртгэх' }));
        expect(mocks.toastError).toHaveBeenLastCalledWith(expect.stringContaining('«Дахин оролдох»'));
        expect(mocks.mutate).not.toHaveBeenCalled();
        // Давтан харилцагчид заавал биш тул жагсаалтыг хүлээхгүй.
        fireEvent.click(screen.getByRole('button', { name: 'Давтан' }));
        fireEvent.click(screen.getByRole('button', { name: 'Бүртгэх' }));
        await waitFor(() => expect(mocks.mutate).toHaveBeenCalledWith(expect.any(String), 'POST', expect.objectContaining({ meeting_type: 'repeat_customer' })));
    });

    it('refreshes a stale list when the server asks for the referral, keeping the dialog open', async () => {
        mocks.referrals = { sources: [], available: true };
        mocks.mutate.mockRejectedValueOnce(new Error('Шинэ харилцагчийн уулзалтад «Сэжим (хаанаас ирсэн)»-ийг сонгоно уу. Боломжтой: Facebook.'));
        renderDialog();
        fill();
        fireEvent.click(screen.getByRole('button', { name: 'Бүртгэх' }));
        await waitFor(() => expect(mocks.refetch).toHaveBeenCalledTimes(1));
        expect(mocks.toastError).toHaveBeenCalledWith(expect.stringContaining('Боломжтой: Facebook.'));
        expect(mocks.openChange).not.toHaveBeenCalledWith(false);
        expect(screen.getByPlaceholderText('9909 1122')).toHaveValue('9911 2233');
    });
});
