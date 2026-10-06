import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { QuickCreateSheet } from '../QuickCreateSheet';
import { canQuickCreate, openQuickCreate } from '@/lib/navigation/commandPalette';

type TestUser = { id: string; role: string; permissions: { modules: string[]; canWrite: boolean } };
const manager: TestUser = { id: 'manager-a', role: 'sales_manager', permissions: { modules: ['dashboard', 'leads', 'viewings'], canWrite: true } };

const mocks = vi.hoisted(() => ({ push: vi.fn(), fetch: vi.fn(), mutate: vi.fn(), user: null as unknown as TestUser }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: mocks.user, shop: { id: 'shop-a' } }) }));
vi.mock('@/hooks/useLeads', () => ({
    useLeadProjects: () => ({ data: [{ id: 'mandala', name: 'Mandala Garden' }], isLoading: false }),
    useLeadCategories: () => ({ data: [] }),
}));
vi.mock('@/lib/api/dashboardFetch', () => ({
    dashboardFetch: (...args: unknown[]) => mocks.fetch(...args),
    dashboardMutate: (...args: unknown[]) => mocks.mutate(...args),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function renderSheet() {
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    render(<QueryClientProvider client={client}><QuickCreateSheet /></QueryClientProvider>);
}
const kinds = () => within(screen.getByRole('group', { name: 'Бүртгэлийн төрөл' }));

beforeEach(() => {
    vi.clearAllMocks();
    mocks.user = manager;
    mocks.mutate.mockResolvedValue({ lead: { id: 'new-lead' } });
});

describe('Түргэн бүртгэл — sheet ба төрлийн солигч', () => {
    it('opens as the right-hand 440px sheet named «Түргэн бүртгэл» with the requested kind selected', async () => {
        renderSheet();
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        act(() => openQuickCreate('lead'));
        const dialog = await screen.findByRole('dialog', { name: 'Түргэн бүртгэл' });
        expect(dialog.className).toContain('right-0');
        expect(dialog.className).toContain('sm:max-w-[440px]');
        expect(within(dialog).getByRole('heading', { name: 'Шинэ лид' })).toBeInTheDocument();
        // Уулзалт нь Уулзалт хуудас руу шилжих үйлдэл тул дарагдсан төлөвгүй.
        expect(kinds().getAllByRole('button').map((b) => [b.textContent, b.getAttribute('aria-pressed')])).toEqual([
            ['Лид', 'true'], ['Уулзалт', null], ['Ажил', 'false'],
        ]);
        expect(screen.getByPlaceholderText('Ж: Г. Энхжин')).toHaveFocus();
    });

    it('switches between the lead and task forms', async () => {
        renderSheet();
        act(() => openQuickCreate('lead'));
        fireEvent.change(await screen.findByPlaceholderText('Ж: Г. Энхжин'), { target: { value: 'Болд' } });
        fireEvent.click(kinds().getByRole('button', { name: 'Ажил' }));
        expect(screen.getByRole('heading', { name: 'Шинэ ажил' })).toBeInTheDocument();
        expect(screen.getByRole('textbox', { name: 'Гарчиг' })).toHaveFocus();
        expect(screen.queryByPlaceholderText('Ж: Г. Энхжин')).not.toBeInTheDocument();
        expect(kinds().getByRole('button', { name: 'Ажил' })).toHaveAttribute('aria-pressed', 'true');
        fireEvent.click(kinds().getByRole('button', { name: 'Лид' }));
        expect(screen.getByRole('heading', { name: 'Шинэ лид' })).toBeInTheDocument();
        expect(screen.getByRole('dialog', { name: 'Түргэн бүртгэл' })).toBeInTheDocument();
    });

    it('preselects the task form and falls back to the lead form for unknown kinds', async () => {
        renderSheet();
        act(() => openQuickCreate('task'));
        expect(await screen.findByRole('heading', { name: 'Шинэ ажил' })).toBeInTheDocument();
        expect(kinds().getByRole('button', { name: 'Ажил' })).toHaveAttribute('aria-pressed', 'true');
        fireEvent.click(screen.getByRole('button', { name: 'Хаах' }));
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

        act(() => openQuickCreate('contract'));
        expect(await screen.findByRole('heading', { name: 'Шинэ лид' })).toBeInTheDocument();
        expect(kinds().getByRole('button', { name: 'Лид' })).toHaveAttribute('aria-pressed', 'true');
    });

    it('sends «Уулзалт» to the meeting scheduler on the Уулзалт page', async () => {
        renderSheet();
        act(() => openQuickCreate('meeting'));
        expect(mocks.push).toHaveBeenCalledWith('/dashboard/viewings?new=1');
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

        act(() => openQuickCreate('lead'));
        fireEvent.click(kinds().getByRole('button', { name: 'Уулзалт' }));
        expect(mocks.push).toHaveBeenLastCalledWith('/dashboard/viewings?new=1');
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    });

    it('still pushes the exact scheduling deep link after saving a lead', async () => {
        renderSheet();
        act(() => openQuickCreate('lead'));
        fireEvent.change(await screen.findByPlaceholderText('Ж: Г. Энхжин'), { target: { value: 'Болд' } });
        fireEvent.click(screen.getByRole('button', { name: 'Хадгалаад уулзалт товлох' }));
        await waitFor(() => expect(mocks.push).toHaveBeenCalledWith('/dashboard/viewings?lead=new-lead&new=1'));
        expect(mocks.mutate).toHaveBeenCalledWith('/api/dashboard/leads', 'POST', expect.objectContaining({ project_id: 'mandala', customer_name: 'Болд' }));
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    });

    it('offers only the kinds the user may create (like «+ Шинэ»)', async () => {
        mocks.user = { id: 'viewer', role: 'viewer', permissions: { modules: ['dashboard'], canWrite: false } };
        renderSheet();
        act(() => openQuickCreate('task'));
        expect(await screen.findByRole('heading', { name: 'Шинэ ажил' })).toBeInTheDocument();
        // Ганц сонголт — солигч харагдахгүй.
        expect(screen.queryByRole('group', { name: 'Бүртгэлийн төрөл' })).not.toBeInTheDocument();
    });

    it('lets a lead writer without meeting rights switch only between lead and task', async () => {
        mocks.user = { id: 'marketer', role: 'marketing', permissions: { modules: ['dashboard', 'leads'], canWrite: true } };
        renderSheet();
        act(() => openQuickCreate('lead'));
        await screen.findByRole('heading', { name: 'Шинэ лид' });
        expect(kinds().getAllByRole('button').map((b) => b.textContent)).toEqual(['Лид', 'Ажил']);
    });

    it('closes with Escape', async () => {
        renderSheet();
        act(() => openQuickCreate('lead'));
        const input = await screen.findByPlaceholderText('Ж: Г. Энхжин');
        fireEvent.keyDown(input, { key: 'Escape' });
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    });
});

describe('canQuickCreate', () => {
    it('matches the «+ Шинэ» rule: lead and meeting need write access, a task needs the dashboard', () => {
        const access = (modules: string[], write: boolean) => ({ can: (m: string) => modules.includes(m), canWrite: (m: string) => write && modules.includes(m) });
        expect(canQuickCreate('lead', access(['leads'], true))).toBe(true);
        expect(canQuickCreate('lead', access(['leads'], false))).toBe(false);
        expect(canQuickCreate('meeting', access(['viewings'], true))).toBe(true);
        expect(canQuickCreate('meeting', access(['leads'], true))).toBe(false);
        expect(canQuickCreate('task', access(['dashboard'], false))).toBe(true);
        expect(canQuickCreate('contract', access(['contracts'], true))).toBe(false);
    });
});
