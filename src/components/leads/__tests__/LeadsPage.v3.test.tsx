import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { LeadsPage } from '../LeadsPage';

const mocks = vi.hoisted(() => ({
    params: '',
    listParams: vi.fn(),
    quickCreate: vi.fn(),
    leads: [] as Record<string, unknown>[],
}));
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(mocks.params) }));
vi.mock('@/contexts/AuthContext', () => ({
    useAuth: () => ({ shop: { id: 'shop-a', name: 'Мандала Гарден' }, user: { id: 'user-a', role: 'sales_manager', permissions: { modules: ['leads'], canWrite: true, canDelete: false } } }),
}));
vi.mock('@/lib/api/dashboardFetch', () => ({ dashboardDownload: vi.fn() }));
vi.mock('@/lib/navigation/commandPalette', () => ({ openQuickCreate: (kind: string) => mocks.quickCreate(kind) }));
vi.mock('@/lib/navigation/pageTitle', () => ({ usePageTitle: vi.fn() }));
vi.mock('@/hooks/useLeads', () => ({
    useLeadsList: (params: unknown) => {
        mocks.listParams(params);
        return { data: { leads: mocks.leads, pagination: { total: mocks.leads.length, totalPages: 1 } }, isLoading: false };
    },
    useLeadSummary: () => ({ data: { all: 3, mine: 2, new: 1, meetings: 1, active: 3, queues: { unassigned: 0, uncontacted: 1, no_followup: 2, overdue: 4 } } }),
    useManagers: () => ({ data: [] }),
    useUpdateLead: () => ({ mutate: vi.fn(), mutateAsync: vi.fn() }),
    useLeadProjects: () => ({ data: [{ id: 'mandala', name: 'Мандала Гарден' }] }),
    useLeadCategories: () => ({ data: [] }),
}));
vi.mock('../pickers', () => ({ StatusPicker: () => null, ManagerPicker: () => null, CategoryPicker: () => null }));
vi.mock('../LeadCard', () => ({
    LeadCard: ({ leadId, onClose }: { leadId: string; onClose: () => void }) => <div><h2>{leadId}</h2><button onClick={onClose}>Хаах</button></div>,
}));

const lead = (id: string, name: string) => ({ id, customer_name: name, customer_phone: '99112233', status: 'contacted', source: 'phone', project_id: 'mandala', created_at: '2026-10-01T00:00:00Z' });
const lastParams = () => mocks.listParams.mock.lastCall![0] as Record<string, unknown>;
const card = () => screen.queryByRole('complementary', { name: 'Харилцагчийн карт' });

beforeEach(() => {
    vi.clearAllMocks();
    mocks.params = '';
    mocks.leads = [lead('l1', 'Б. Энхжин'), lead('l2', 'Г. Тэмүүлэн'), lead('l3', 'Д. Болормаа')];
    localStorage.clear();
    window.history.replaceState(null, '', '/dashboard/leads');
    Element.prototype.scrollIntoView = vi.fn();
});

describe('Leads workspace v3', () => {
    it('keeps the default URL clean and shows the project with its active count', () => {
        render(<LeadsPage />);
        expect(screen.getByRole('heading', { name: 'Лид' })).toBeInTheDocument();
        expect(screen.getByText('Мандала Гарден · 3 идэвхтэй')).toBeInTheDocument();
        expect(lastParams()).toMatchObject({ view: 'all', queue: undefined, sort: 'created_at', dir: 'desc', page: 1 });
        expect(window.location.search).toBe('');
        expect(screen.getByRole('link', { name: 'Жагсаалт' })).toHaveAttribute('aria-current', 'page');
        expect(screen.getByRole('link', { name: 'Шатаар' })).toHaveAttribute('href', '/dashboard/leads/pipeline');
    });

    it('turns an attention count into a filter and back', () => {
        render(<LeadsPage />);
        const overdue = screen.getByRole('button', { name: /Хугацаа хэтэрсэн/ });
        expect(overdue).toHaveTextContent('4');
        fireEvent.click(overdue);
        expect(lastParams()).toMatchObject({ queue: 'overdue', sort: 'next_followup_at', dir: 'asc' });
        expect(overdue).toHaveAttribute('aria-pressed', 'true');
        expect(window.location.search).toBe('?queue=overdue');
        expect(screen.getByRole('link', { name: 'Шатаар' })).toHaveAttribute('href', '/dashboard/leads/pipeline?queue=overdue');
        fireEvent.click(overdue);
        expect(lastParams()).toMatchObject({ queue: undefined, sort: 'created_at', dir: 'desc' });
        expect(window.location.search).toBe('');
    });

    it('starts from the filters in a shared link and follows a later navigation', () => {
        mocks.params = 'view=mine&status=new';
        const { rerender } = render(<LeadsPage />);
        expect(lastParams()).toMatchObject({ view: 'mine', status: 'new' });
        expect(screen.getByRole('button', { name: /Миний/ })).toHaveAttribute('aria-pressed', 'true');
        mocks.params = 'queue=uncontacted';
        rerender(<LeadsPage />);
        expect(lastParams()).toMatchObject({ view: 'all', status: 'all', queue: 'uncontacted' });
    });

    it('saves the current filters as a named view and reapplies or removes it', () => {
        render(<LeadsPage />);
        fireEvent.change(screen.getByRole('combobox', { name: 'Статус' }), { target: { value: 'offered' } });
        fireEvent.click(screen.getByRole('button', { name: 'Харагдац хадгалах' }));
        fireEvent.change(screen.getByLabelText('Харагдацын нэр'), { target: { value: 'Санал тавьсан' } });
        fireEvent.click(screen.getByRole('button', { name: 'Хадгалах' }));
        expect(JSON.parse(localStorage.getItem('vh:lead-views:user-a:shop-a')!)).toEqual([expect.objectContaining({ name: 'Санал тавьсан', query: 'status=offered' })]);

        fireEvent.click(screen.getByRole('button', { name: 'Цэвэрлэх' }));
        expect(lastParams()).toMatchObject({ status: 'all' });
        fireEvent.click(screen.getByRole('button', { name: 'Санал тавьсан' }));
        expect(lastParams()).toMatchObject({ status: 'offered' });
        expect(screen.getByRole('button', { name: 'Санал тавьсан' })).toHaveAttribute('aria-pressed', 'true');

        fireEvent.click(screen.getByRole('button', { name: '«Санал тавьсан» харагдацыг устгах' }));
        expect(screen.queryByRole('button', { name: 'Санал тавьсан' })).not.toBeInTheDocument();
        expect(JSON.parse(localStorage.getItem('vh:lead-views:user-a:shop-a')!)).toEqual([]);
    });

    it('moves through leads with the arrow keys, keeps the card beside the list and closes it with Esc', () => {
        render(<LeadsPage />);
        expect(card()).not.toBeInTheDocument();
        fireEvent.keyDown(window, { key: 'ArrowDown' });
        expect(within(card()!).getByRole('heading', { name: 'l1' })).toBeInTheDocument();
        expect(window.location.search).toBe('?lead=l1');
        fireEvent.keyDown(window, { key: 'ArrowDown' });
        expect(within(card()!).getByRole('heading', { name: 'l2' })).toBeInTheDocument();
        expect(screen.getByRole('row', { selected: true })).toHaveTextContent('Г. Тэмүүлэн');
        fireEvent.keyDown(window, { key: 'ArrowUp' });
        expect(within(card()!).getByRole('heading', { name: 'l1' })).toBeInTheDocument();
        fireEvent.keyDown(window, { key: 'Escape' });
        expect(card()).not.toBeInTheDocument();
        expect(window.location.search).toBe('');
    });

    it('opens the card from the name and ignores arrows while typing', () => {
        render(<LeadsPage />);
        fireEvent.click(screen.getByRole('button', { name: 'Д. Болормаа' }));
        expect(within(card()!).getByRole('heading', { name: 'l3' })).toBeInTheDocument();
        const searchbox = screen.getByRole('searchbox', { name: 'Лидийг нэр, утсаар хайх' });
        fireEvent.keyDown(searchbox, { key: 'ArrowDown' });
        expect(within(card()!).getByRole('heading', { name: 'l3' })).toBeInTheDocument();
    });

    it('offers the right empty state for a filtered and an empty list', () => {
        mocks.leads = [];
        mocks.params = 'status=new';
        const { unmount } = render(<LeadsPage />);
        expect(screen.getByText('Энэ шүүлтүүрт лид алга')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Шүүлтүүр цэвэрлэх' }));
        expect(lastParams()).toMatchObject({ status: 'all' });
        unmount();
        mocks.params = '';
        render(<LeadsPage />);
        expect(screen.getByText('Лид бүртгэгдээгүй байна')).toBeInTheDocument();
        fireEvent.click(screen.getAllByRole('button', { name: 'Лид нэмэх' }).at(-1)!);
        expect(mocks.quickCreate).toHaveBeenCalledWith('lead');
    });
});
