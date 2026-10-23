import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { DEFAULT_REFERRAL_SOURCES } from '@/lib/sales/referral-sources';

type Source = { id: string; name: string; sort_order: number; archived_at: string | null };
const mocks = vi.hoisted(() => ({
    permissions: { modules: ['settings'], canWrite: true, canDelete: false },
    query: { data: { sources: [] as Source[], available: true } as { sources: Source[]; available: boolean } | undefined, isLoading: false, isError: false },
    listOptions: [] as unknown[],
    create: vi.fn(), preset: vi.fn(), update: vi.fn(), updateAsync: vi.fn(), reorder: vi.fn(), refetch: vi.fn(),
    toastError: vi.fn(), toastSuccess: vi.fn(),
}));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'admin', role: 'admin', permissions: mocks.permissions } }) }));
vi.mock('sonner', () => ({ toast: { success: (...args: unknown[]) => mocks.toastSuccess(...args), error: (...args: unknown[]) => mocks.toastError(...args) } }));
vi.mock('@/hooks/useReferralSources', () => ({
    useReferralSources: (...args: unknown[]) => { mocks.listOptions.push(args[0]); return { ...mocks.query, refetch: mocks.refetch, isFetching: false }; },
    useCreateReferralSource: () => ({ mutateAsync: mocks.create, isPending: false }),
    useAddDefaultReferralSources: () => ({ mutateAsync: mocks.preset, isPending: false }),
    useUpdateReferralSource: () => ({ mutate: mocks.update, mutateAsync: mocks.updateAsync, isPending: false }),
    useReorderReferralSources: () => ({ mutate: mocks.reorder, isPending: false }),
}));

import { ReferralSourcesSettings } from './ReferralSourcesSettings';

const facebook: Source = { id: 'facebook', name: 'Facebook', sort_order: 10, archived_at: null };
const barmash: Source = { id: 'barmash', name: 'Бармаш түрээслэгч', sort_order: 20, archived_at: '2026-10-20T00:00:00Z' };

beforeEach(() => {
    vi.clearAllMocks();
    mocks.permissions = { modules: ['settings'], canWrite: true, canDelete: false };
    mocks.query = { data: { sources: [], available: true }, isLoading: false, isError: false };
    mocks.listOptions = [];
    mocks.create.mockResolvedValue({});
    mocks.preset.mockResolvedValue({ created: DEFAULT_REFERRAL_SOURCES.map((name, index) => ({ id: name, name, sort_order: index, archived_at: null })), skipped: 0 });
    mocks.updateAsync.mockResolvedValue({});
});

describe('«Сэжим (хаанаас ирсэн)» settings', () => {
    it('offers the W12 list on an empty project with one click and reports how many were added', async () => {
        render(<ReferralSourcesSettings />);
        expect(mocks.listOptions[0]).toEqual({ inlineError: true });
        expect(screen.getByRole('heading', { name: 'Сэжим (хаанаас ирсэн)' })).toBeInTheDocument();
        expect(screen.getByText(/Санал болгосон жагсаалт: Facebook, Инстаграм, Ойрхон амьдардаг/)).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Санал болгосон жагсаалт нэмэх' }));
        await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalledWith('9 сонголт нэмэгдлээ'));
    });

    it('creates a trimmed name, refusing an empty or an active duplicate before calling the API', async () => {
        mocks.query.data = { sources: [facebook, barmash], available: true };
        render(<ReferralSourcesSettings />);
        const form = within(screen.getByRole('form', { name: 'Шинэ сонголт нэмэх' }));
        fireEvent.change(form.getByLabelText('Шинэ сонголт'), { target: { value: ' FACEBOOK ' } });
        fireEvent.click(form.getByRole('button', { name: 'Нэмэх' }));
        expect(mocks.toastError).toHaveBeenCalledWith('«FACEBOOK» нэртэй сонголт байна');
        expect(mocks.create).not.toHaveBeenCalled();
        fireEvent.change(form.getByLabelText('Шинэ сонголт'), { target: { value: '  Билбоард   зар ' } });
        fireEvent.click(form.getByRole('button', { name: 'Нэмэх' }));
        await waitFor(() => expect(mocks.create).toHaveBeenCalledWith('Билбоард зар'));
        // Архивласан «Бармаш түрээслэгч» байгаа тул санал болгосон жагсаалтаас 7 үлдэнэ.
        expect(screen.getByRole('button', { name: 'Санал болгосон жагсаалт нэмэх (7)' })).toBeInTheDocument();
    });

    it('renames in place, archives and restores, and reorders the whole list in one request', async () => {
        mocks.query.data = { sources: [facebook, barmash], available: true };
        render(<ReferralSourcesSettings />);
        expect(screen.getByText('Архив', { selector: 'span.rounded-full' })).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Facebook нэр солих' }));
        fireEvent.change(screen.getByLabelText('Нэр'), { target: { value: ' Facebook пэйж ' } });
        fireEvent.click(screen.getByRole('button', { name: 'Хадгалах' }));
        await waitFor(() => expect(mocks.updateAsync).toHaveBeenCalledWith({ id: 'facebook', patch: { name: 'Facebook пэйж' } }));

        fireEvent.click(screen.getByRole('switch', { name: 'Facebook идэвхтэй' }));
        expect(mocks.update).toHaveBeenCalledWith({ id: 'facebook', patch: { archived: true } }, expect.anything());
        fireEvent.click(screen.getByRole('switch', { name: 'Бармаш түрээслэгч идэвхтэй' }));
        expect(mocks.update).toHaveBeenLastCalledWith({ id: 'barmash', patch: { archived: false } }, expect.anything());

        fireEvent.click(screen.getByRole('button', { name: 'Бармаш түрээслэгч дээш' }));
        expect(mocks.reorder).toHaveBeenCalledTimes(1);
        expect(mocks.reorder).toHaveBeenCalledWith(['barmash', 'facebook'], expect.anything());
        expect(screen.queryByRole('button', { name: /устгах/ })).not.toBeInTheDocument();
    });

    it('is read-only without settings write access and explains a missing migration or a failed read', () => {
        mocks.permissions = { modules: ['settings'], canWrite: false, canDelete: false };
        mocks.query.data = { sources: [facebook], available: true };
        const { unmount } = render(<ReferralSourcesSettings />);
        expect(screen.getByText('Facebook')).toBeInTheDocument();
        expect(screen.queryByRole('form', { name: 'Шинэ сонголт нэмэх' })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Facebook нэр солих' })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Санал болгосон/ })).not.toBeInTheDocument();
        unmount();

        mocks.permissions = { modules: ['settings'], canWrite: true, canDelete: false };
        mocks.query.data = { sources: [], available: false };
        const second = render(<ReferralSourcesSettings />);
        expect(screen.getByText(/хараахан идэвхжээгүй/)).toBeInTheDocument();
        expect(screen.queryByRole('form', { name: 'Шинэ сонголт нэмэх' })).not.toBeInTheDocument();
        second.unmount();

        mocks.query = { data: undefined, isLoading: false, isError: true };
        render(<ReferralSourcesSettings />);
        fireEvent.click(screen.getByRole('button', { name: 'Дахин оролдох' }));
        expect(mocks.refetch).toHaveBeenCalled();
    });
});
