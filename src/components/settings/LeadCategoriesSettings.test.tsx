import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { DEFAULT_LEAD_CATEGORIES } from '@/lib/leads/labels';

const mocks = vi.hoisted(() => ({
    permissions: { modules: ['settings', 'leads'], canWrite: true, canDelete: true },
    categories: [] as Record<string, unknown>[],
    counts: undefined as unknown,
    create: vi.fn(), preset: vi.fn(), update: vi.fn(), updateAsync: vi.fn(), remove: vi.fn(), reorder: vi.fn(),
    categoryOptions: [] as unknown[],
    toastError: vi.fn(), toastSuccess: vi.fn(), confirm: vi.fn(),
}));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'admin', role: 'admin', permissions: mocks.permissions } }) }));
vi.mock('sonner', () => ({ toast: { success: (...args: unknown[]) => mocks.toastSuccess(...args), error: (...args: unknown[]) => mocks.toastError(...args) } }));
vi.mock('@/components/ui/Toast', () => ({ confirmToast: (...args: unknown[]) => mocks.confirm(...args) }));
vi.mock('@/hooks/useLeads', () => ({
    useLeadCategories: (...args: unknown[]) => { mocks.categoryOptions.push(args[0]); return { data: mocks.categories, isLoading: false, isError: false }; },
}));
vi.mock('@/hooks/useLeadCategorySettings', () => ({
    useLeadCategoryCounts: () => ({ data: mocks.counts }),
    useCreateLeadCategory: () => ({ mutateAsync: mocks.create, isPending: false }),
    useAddDefaultLeadCategories: () => ({ mutateAsync: mocks.preset, isPending: false }),
    useUpdateLeadCategory: () => ({ mutate: mocks.update, mutateAsync: mocks.updateAsync, isPending: false }),
    useDeleteLeadCategory: () => ({ mutate: mocks.remove, isPending: false }),
    useReorderLeadCategories: () => ({ mutate: mocks.reorder, isPending: false }),
}));

import { LeadCategoriesSettings } from './LeadCategoriesSettings';

const investor = { id: 'investor', name: 'Хөрөнгө оруулагч', description: 'Дахин зарах', tone: 'success', sort_order: 10, is_active: true };
const barter = { id: 'barter', name: 'Бартер', description: null, tone: 'neutral', sort_order: 20, is_active: false };

beforeEach(() => {
    vi.clearAllMocks();
    mocks.permissions = { modules: ['settings', 'leads'], canWrite: true, canDelete: true };
    mocks.categories = [];
    mocks.counts = undefined;
    mocks.categoryOptions = [];
    mocks.create.mockResolvedValue({});
    mocks.preset.mockResolvedValue({ created: DEFAULT_LEAD_CATEGORIES, skipped: 0 });
    mocks.updateAsync.mockResolvedValue({});
    mocks.confirm.mockResolvedValue(true);
});

describe('lead category settings', () => {
    it('offers the suggested preset on an empty project and reports how many were added', async () => {
        render(<LeadCategoriesSettings />);
        // Хуудас өөрөө Alert харуулдаг тул жагсаалтын алдаа давхар toast гаргахгүй.
        expect(mocks.categoryOptions[0]).toEqual({ inlineError: true });
        expect(screen.getByText('Энэ төсөлд лидийн ангилал алга')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Санал болгох ангиллууд нэмэх' }));
        await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalledWith(`${DEFAULT_LEAD_CATEGORIES.length} ангилал нэмэгдлээ`));
    });

    it('is read-only without settings write access', () => {
        mocks.permissions = { modules: ['settings'], canWrite: false, canDelete: false };
        mocks.categories = [investor];
        render(<LeadCategoriesSettings />);
        expect(screen.getByText('Хөрөнгө оруулагч')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Санал болгох/ })).not.toBeInTheDocument();
        expect(screen.queryByRole('form', { name: 'Шинэ ангилал нэмэх' })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Хөрөнгө оруулагч засах' })).not.toBeInTheDocument();
    });

    it('validates and creates a category with the chosen tone', async () => {
        mocks.categories = [investor];
        render(<LeadCategoriesSettings />);
        const form = within(screen.getByRole('form', { name: 'Шинэ ангилал нэмэх' }));
        fireEvent.change(form.getByLabelText('Нэр'), { target: { value: 'Ангилалгүй' } });
        fireEvent.click(form.getByRole('button', { name: 'Ангилал нэмэх' }));
        expect(mocks.toastError).toHaveBeenCalledWith(expect.stringContaining('Ангилалгүй'));
        expect(mocks.create).not.toHaveBeenCalled();
        fireEvent.change(form.getByLabelText('Нэр'), { target: { value: ' Дилер / Агент ' } });
        fireEvent.click(form.getByRole('button', { name: 'Шар' }));
        fireEvent.click(form.getByRole('button', { name: 'Ангилал нэмэх' }));
        await waitFor(() => expect(mocks.create).toHaveBeenCalledWith({ name: 'Дилер / Агент', description: null, tone: 'pending' }));
        // Байхгүй санал болгох ангилал үлдсэн тул товч харагдана.
        expect(screen.getByRole('button', { name: `Санал болгох ангиллууд нэмэх (${DEFAULT_LEAD_CATEGORIES.length - 1})` })).toBeInTheDocument();
    });

    it('archives, restores, reorders and deletes only unused categories', async () => {
        mocks.categories = [investor, barter];
        mocks.counts = { byCategory: { investor: 4, barter: 0 }, uncategorized: 7, referenced: ['investor'] };
        render(<LeadCategoriesSettings />);
        expect(screen.getByText('4 лид')).toBeInTheDocument();
        expect(screen.getByText('Бартер (архив)')).toBeInTheDocument();
        expect(screen.getByText(/Ангилалгүй:/)).toHaveTextContent('Ангилалгүй: 7 лид');

        fireEvent.click(screen.getByRole('switch', { name: 'Хөрөнгө оруулагч идэвхтэй' }));
        expect(mocks.update).toHaveBeenCalledWith({ id: 'investor', patch: { is_active: false } }, expect.anything());
        fireEvent.click(screen.getByRole('switch', { name: 'Бартер идэвхтэй' }));
        expect(mocks.update).toHaveBeenLastCalledWith({ id: 'barter', patch: { is_active: true } }, expect.anything());

        expect(screen.getByRole('button', { name: 'Хөрөнгө оруулагч устгах' })).toBeDisabled();
        fireEvent.click(screen.getByRole('button', { name: 'Бартер устгах' }));
        await waitFor(() => expect(mocks.remove).toHaveBeenCalledWith('barter', expect.anything()));

        // Дээш/доош нь бүх дарааллыг НЭГ хүсэлтээр илгээнэ (мөр бүрт PATCH биш).
        fireEvent.click(screen.getByRole('button', { name: 'Бартер дээш' }));
        expect(mocks.reorder).toHaveBeenCalledTimes(1);
        expect(mocks.reorder).toHaveBeenCalledWith(['barter', 'investor'], expect.anything());
        expect(mocks.updateAsync).not.toHaveBeenCalled();
    });

    it('disables delete for a category used only by deleted leads', () => {
        mocks.categories = [investor, barter];
        mocks.counts = { byCategory: { investor: 0, barter: 0 }, uncategorized: 0, referenced: ['barter'] };
        render(<LeadCategoriesSettings />);
        expect(screen.getByRole('button', { name: 'Хөрөнгө оруулагч устгах' })).toBeEnabled();
        const barterDelete = screen.getByRole('button', { name: 'Бартер устгах' });
        expect(barterDelete).toBeDisabled();
        expect(barterDelete).toHaveAttribute('title', 'Устгасан лидэд ашиглагдсан — архивлана уу');
    });

    it('hides delete without delete permission and edits in place', async () => {
        mocks.permissions = { modules: ['settings'], canWrite: true, canDelete: false };
        mocks.categories = [investor];
        render(<LeadCategoriesSettings />);
        expect(screen.queryByRole('button', { name: 'Хөрөнгө оруулагч устгах' })).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Хөрөнгө оруулагч засах' }));
        fireEvent.change(screen.getAllByLabelText('Нэр')[0], { target: { value: 'Хөрөнгө оруулагч (B2B)' } });
        fireEvent.click(screen.getByRole('button', { name: 'Хадгалах' }));
        await waitFor(() => expect(mocks.updateAsync).toHaveBeenCalledWith({ id: 'investor', patch: { name: 'Хөрөнгө оруулагч (B2B)', description: 'Дахин зарах', tone: 'success' } }));
    });
});
