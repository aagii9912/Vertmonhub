import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

type Source = { id: string; name: string; sort_order: number; archived_at: string | null };
const mocks = vi.hoisted(() => ({
    referrals: undefined as { sources: Source[]; available: boolean } | undefined,
    mutate: vi.fn(), toastError: vi.fn(), toastSuccess: vi.fn(),
}));
vi.mock('sonner', () => ({ toast: { success: (...args: unknown[]) => mocks.toastSuccess(...args), error: (...args: unknown[]) => mocks.toastError(...args) } }));
vi.mock('@/lib/api/dashboardFetch', () => ({ dashboardMutate: (...args: unknown[]) => mocks.mutate(...args) }));
vi.mock('@/hooks/useDailyReport', () => ({ invalidateDailyMeetingQueries: async () => {} }));
vi.mock('@/hooks/useReferralSources', () => ({ useReferralSources: () => ({ data: mocks.referrals }) }));

import { DailyMeetingDialog } from './DailyMeetingDialog';

// jsdom-д ResizeObserver байхгүй (Radix Select).
vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });

const managers = [{ name: 'Чанцалдулам.Раднаа', title: 'Чанцалдулам', self: false }];
function renderDialog() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
        <QueryClientProvider client={client}>
            <DailyMeetingDialog open onOpenChange={() => {}} date="2026-10-17" today="2026-10-19" managers={managers as never} defaultManager="Чанцалдулам.Раднаа" />
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
});
