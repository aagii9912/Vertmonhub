import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { TodayDashboard } from '../dashboard/today/TodayDashboard';
import { DirectorDashboard } from '../dashboard/director/DirectorDashboard';
import { LeadPanel } from '../leads/LeadPanel';
import { QuickCreateSheet } from '../dashboard/QuickCreateSheet';
import { openQuickCreate } from '@/lib/navigation/commandPalette';
import { ANONYMOUS_LEAD_CONTACT, ANONYMOUS_LEAD_LABEL, LEAD_NAME_OR_ANONYMOUS } from '@/lib/leads/labels';

const mocks = vi.hoisted(() => ({
    refetch: vi.fn(), push: vi.fn(), mutate: vi.fn(), enqueue: vi.fn(), isNetworkError: vi.fn(), toastError: vi.fn(),
    managers: vi.fn(),
    role: 'viewer', update: vi.fn(),
    myStats: { data: undefined as unknown, isError: true },
    detail: { data: undefined as unknown, isLoading: false, isError: true, error: new Error('Лид олдсонгүй'), isFetching: false },
}));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: vi.fn() }) }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'manager-a', role: mocks.role }, shop: { id: 'shop-a' } }) }));
vi.mock('@/lib/ai/context', () => ({ useRegisterAiContext: vi.fn() }));
vi.mock('@/lib/navigation/pageTitle', () => ({ usePageTitle: vi.fn() }));
vi.mock('@/lib/api/dashboardFetch', () => ({ dashboardMutate: (...args: unknown[]) => mocks.mutate(...args), dashboardFetch: vi.fn() }));
vi.mock('@/lib/offline/outbox', () => ({ enqueue: (...args: unknown[]) => mocks.enqueue(...args), isNetworkError: () => mocks.isNetworkError() }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: (...args: unknown[]) => mocks.toastError(...args) } }));
vi.mock('@/hooks/useMyStats', () => ({ useMyStats: () => ({ ...mocks.myStats, isLoading: false, error: new Error('Өгөгдөл татаж чадсангүй'), refetch: mocks.refetch }) }));
vi.mock('@/hooks/useDirector', () => ({ useDirector: () => ({ data: undefined, isLoading: false, isError: true, error: new Error('Өгөгдөл татаж чадсангүй'), refetch: mocks.refetch }) }));
vi.mock('@/hooks/useLeads', () => ({
    useLeadProjects: () => ({ data: [{ id: 'mandala', name: 'Mandala Garden', status: 'active' }, { id: 'elysium', name: 'Elysium', status: 'active' }], isLoading: false }),
    useManagers: (...args: unknown[]) => { mocks.managers(...args); return { data: [] }; },
    useLeadDetail: () => ({ ...mocks.detail, refetch: mocks.refetch }),
    useUpdateLead: () => ({ mutate: mocks.update }), useAddLeadActivity: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock('../leads/pickers', () => ({ StatusPicker: () => null, ManagerPicker: () => null }));
vi.mock('../leads/LeadWorkActions', () => ({ LeadWorkActions: () => null }));

beforeEach(() => {
    vi.clearAllMocks();
    mocks.myStats.data = undefined;
    mocks.myStats.isError = true;
    mocks.detail.data = undefined;
    mocks.detail.isError = true;
    mocks.role = 'viewer';
    mocks.isNetworkError.mockReturnValue(false);
    mocks.mutate.mockResolvedValue({ lead: { id: 'new-lead' } });
});

describe('workflow error and recovery states', () => {
    it.each([TodayDashboard, DirectorDashboard])('shows retry instead of an empty or loading dashboard after a failed read', (Dashboard) => {
        render(<Dashboard />);
        expect(screen.getByRole('alert')).toHaveTextContent('Өгөгдөл татаж чадсангүй');
        expect(screen.queryByText('Өнөөдөр төлөвлөсөн ажил алга')).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Дахин оролдох' }));
        expect(mocks.refetch).toHaveBeenCalledOnce();
    });

    it.each(['leads', 'viewings', 'tasks'])('does not claim no work when %s failed to load', (section) => {
        mocks.myStats.isError = false;
        mocks.myStats.data = { missing: [section], tasks: [], recentLeads: [], target: null, kpis: { salesThisMonth: 0, activeContracts: 0, viewingsThisWeek: 0, newLeads: 0 } };
        render(<TodayDashboard />);
        expect(screen.getByText('Ажлын жагсаалтын мэдээлэл дутуу байна')).toBeInTheDocument();
        expect(screen.queryByText('Өнөөдөр төлөвлөсөн ажил алга')).not.toBeInTheDocument();
        if (section === 'leads') expect(screen.queryByText('Өнөөдөр шинэ лид ирээгүй')).not.toBeInTheDocument();
    });

    it('does not display unavailable sales as zero or unavailable targets as unconfigured', () => {
        mocks.myStats.isError = false;
        mocks.myStats.data = { missing: ['sales', 'targets'], tasks: [], recentLeads: [], target: null, kpis: { salesThisMonth: 0, activeContracts: 0, viewingsThisWeek: 0, newLeads: 0 } };
        render(<TodayDashboard />);
        expect(screen.getByText('Борлуулалт түр боломжгүй')).toBeInTheDocument();
        expect(screen.getByText('Сарын зорилтын мэдээлэл түр боломжгүй')).toBeInTheDocument();
        expect(screen.queryByText('Сарын зорилт тохируулаагүй')).not.toBeInTheDocument();
    });

    it('shows a missing lead error and lets the user close or retry', () => {
        const onClose = vi.fn();
        render(<LeadPanel leadId="missing" canWrite={false} onClose={onClose} />);
        expect(screen.getByRole('alert')).toHaveTextContent('Лид олдсонгүй');
        fireEvent.click(screen.getByRole('button', { name: 'Хаах' }));
        expect(onClose).toHaveBeenCalledOnce();
    });

    it('identifies a partial lead history without discarding the loaded lead', () => {
        mocks.detail.isError = false;
        mocks.detail.data = { lead: { id: 'lead', customer_name: 'Болд', source: 'other', status: 'new', created_at: '2026-09-13T10:00:00Z' }, viewings: [], contracts: [], activities: [], property: null, partial: ['viewings', 'contracts'] };
        render(<LeadPanel leadId="lead" canWrite={false} />);
        expect(screen.getByRole('alert')).toHaveTextContent('уулзалт, гэрээ');
        expect(screen.getByRole('heading', { name: 'Болд' })).toBeInTheDocument();
    });

    it('opens scheduling with the newly created lead preselected', async () => {
        render(<QuickCreateSheet />);
        act(() => openQuickCreate('lead'));
        const input = await screen.findByPlaceholderText('Ж: Г. Энхжин');
        fireEvent.change(input, { target: { value: 'Болд' } });
        fireEvent.change(screen.getByRole('combobox', { name: 'Төсөл' }), { target: { value: 'mandala' } });
        fireEvent.click(screen.getByRole('button', { name: 'Хадгалаад уулзалт товлох' }));
        await waitFor(() => expect(mocks.push).toHaveBeenCalledWith('/dashboard/viewings?lead=new-lead&new=1'));
    });

    it('keeps the form and request id when both network and local saving fail', async () => {
        mocks.mutate.mockRejectedValue(new TypeError('offline'));
        mocks.isNetworkError.mockReturnValue(true);
        mocks.enqueue.mockImplementation(() => { throw new Error('storage full'); });
        render(<QuickCreateSheet />);
        act(() => openQuickCreate('lead'));
        const input = await screen.findByPlaceholderText('Ж: Г. Энхжин');
        fireEvent.change(input, { target: { value: 'Болд' } });
        fireEvent.change(screen.getByRole('combobox', { name: 'Төсөл' }), { target: { value: 'elysium' } });
        fireEvent.click(screen.getByRole('button', { name: /^Хадгалах/ }));
        await waitFor(() => expect(mocks.toastError).toHaveBeenCalled());
        expect(input).toHaveValue('Болд');
        expect(screen.getByRole('dialog')).toBeInTheDocument();
        const firstPayload = mocks.mutate.mock.calls[0][2];
        fireEvent.click(screen.getByRole('button', { name: /^Хадгалах/ }));
        await waitFor(() => expect(mocks.mutate).toHaveBeenCalledTimes(2));
        expect(mocks.mutate.mock.calls[1][2].client_request_id).toBe(firstPayload.client_request_id);
        expect(mocks.mutate.mock.calls[1][2].project_id).toBe('elysium');
    });

    it('requires a project before quick lead creation', async () => {
        render(<QuickCreateSheet />);
        act(() => openQuickCreate('lead'));
        fireEvent.change(await screen.findByPlaceholderText('Ж: Г. Энхжин'), { target: { value: 'Болд' } });
        fireEvent.click(screen.getByRole('button', { name: /^Хадгалах/ }));
        expect(mocks.toastError).toHaveBeenCalledWith('Төсөл сонгоно уу');
        expect(mocks.mutate).not.toHaveBeenCalled();
        fireEvent.change(screen.getByRole('combobox', { name: 'Төсөл' }), { target: { value: 'mandala' } });
        fireEvent.click(screen.getByRole('button', { name: /^Хадгалах/ }));
        await waitFor(() => expect(mocks.mutate).toHaveBeenCalledWith('/api/dashboard/leads', 'POST', expect.objectContaining({ project_id: 'mandala', customer_name: 'Болд' })));
    });

    it('asks for a name or the explicit anonymous option', async () => {
        render(<QuickCreateSheet />);
        act(() => openQuickCreate('lead'));
        await screen.findByPlaceholderText('Ж: Г. Энхжин');
        fireEvent.change(screen.getByRole('combobox', { name: 'Төсөл' }), { target: { value: 'mandala' } });
        fireEvent.click(screen.getByRole('button', { name: /^Хадгалах/ }));
        expect(mocks.toastError).toHaveBeenCalledWith(LEAD_NAME_OR_ANONYMOUS);
        expect(mocks.mutate).not.toHaveBeenCalled();
    });

    it('saves an anonymous lead with a phone and never sends the display label as a name', async () => {
        render(<QuickCreateSheet />);
        act(() => openQuickCreate('lead'));
        const input = await screen.findByPlaceholderText('Ж: Г. Энхжин');
        fireEvent.change(input, { target: { value: 'Болд' } });
        fireEvent.change(screen.getByRole('combobox', { name: 'Төсөл' }), { target: { value: 'mandala' } });
        fireEvent.click(screen.getByRole('checkbox', { name: /Нэр тодорхойгүй/ }));
        expect(input).toBeDisabled();
        expect(input).toHaveValue('');
        expect(input).toHaveAttribute('placeholder', ANONYMOUS_LEAD_LABEL);

        fireEvent.click(screen.getByRole('button', { name: /^Хадгалах/ }));
        expect(mocks.toastError).toHaveBeenCalledWith(ANONYMOUS_LEAD_CONTACT);
        expect(mocks.mutate).not.toHaveBeenCalled();

        fireEvent.change(screen.getByPlaceholderText('9911 2233'), { target: { value: '9911 2233' } });
        fireEvent.click(screen.getByRole('button', { name: /^Хадгалах/ }));
        await waitFor(() => expect(mocks.mutate).toHaveBeenCalledWith('/api/dashboard/leads', 'POST', expect.objectContaining({
            project_id: 'mandala', customer_name: null, anonymous: true, customer_phone: '9911 2233',
        })));
    });

    it('labels an offline anonymous lead with the anonymous display name', async () => {
        mocks.mutate.mockRejectedValue(new TypeError('offline'));
        mocks.isNetworkError.mockReturnValue(true);
        render(<QuickCreateSheet />);
        act(() => openQuickCreate('lead'));
        await screen.findByPlaceholderText('Ж: Г. Энхжин');
        fireEvent.change(screen.getByRole('combobox', { name: 'Төсөл' }), { target: { value: 'elysium' } });
        fireEvent.click(screen.getByRole('checkbox', { name: /Нэр тодорхойгүй/ }));
        fireEvent.change(screen.getByPlaceholderText('9911 2233'), { target: { value: '99112233' } });
        fireEvent.click(screen.getByRole('button', { name: /^Хадгалах/ }));
        await waitFor(() => expect(mocks.enqueue).toHaveBeenCalledWith(
            expect.objectContaining({ label: `Лид · ${ANONYMOUS_LEAD_LABEL}`, body: expect.objectContaining({ customer_name: null, anonymous: true }) }),
            { userId: 'manager-a', shopId: 'shop-a' },
        ));
    });

    it('shows the anonymous label and lets a writer add the name later', () => {
        mocks.detail.isError = false;
        mocks.detail.data = { lead: { id: 'lead', project_id: 'mandala', customer_name: null, customer_phone: '99112233', source: 'phone', status: 'new', created_at: '2026-09-13T10:00:00Z' }, viewings: [], contracts: [], activities: [], property: null };
        render(<LeadPanel leadId="lead" canWrite={true} />);
        expect(screen.getByRole('heading', { name: ANONYMOUS_LEAD_LABEL })).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Нэр нэмэх' }));
        const input = screen.getByRole('textbox', { name: 'Харилцагчийн нэр' });
        fireEvent.change(input, { target: { value: ' ' } });
        fireEvent.keyDown(input, { key: 'Enter' });
        expect(mocks.update).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole('button', { name: 'Нэр нэмэх' }));
        fireEvent.change(screen.getByRole('textbox', { name: 'Харилцагчийн нэр' }), { target: { value: ' Г. Бат ' } });
        fireEvent.keyDown(screen.getByRole('textbox', { name: 'Харилцагчийн нэр' }), { key: 'Enter' });
        expect(mocks.update).toHaveBeenCalledWith({ id: 'lead', patch: { customer_name: 'Г. Бат' } }, expect.anything());
    });

    it('lets a writer correct a named lead and ignores an unchanged name', () => {
        mocks.detail.isError = false;
        mocks.detail.data = { lead: { id: 'lead', project_id: 'mandala', customer_name: 'Болд', source: 'phone', status: 'new', created_at: '2026-09-13T10:00:00Z' }, viewings: [], contracts: [], activities: [], property: null };
        render(<LeadPanel leadId="lead" canWrite={true} />);
        fireEvent.click(screen.getByRole('button', { name: 'Болд' }));
        const input = screen.getByRole('textbox', { name: 'Харилцагчийн нэр' });
        expect(input).toHaveValue('Болд');
        fireEvent.blur(input);
        expect(mocks.update).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole('button', { name: 'Болд' }));
        fireEvent.change(screen.getByRole('textbox', { name: 'Харилцагчийн нэр' }), { target: { value: 'Болд Бат' } });
        fireEvent.blur(screen.getByRole('textbox', { name: 'Харилцагчийн нэр' }));
        expect(mocks.update).toHaveBeenCalledWith({ id: 'lead', patch: { customer_name: 'Болд Бат' } }, expect.anything());
    });

    it('does not offer name editing without write access', () => {
        mocks.detail.isError = false;
        mocks.detail.data = { lead: { id: 'lead', project_id: 'mandala', customer_name: null, source: 'phone', status: 'new', created_at: '2026-09-13T10:00:00Z' }, viewings: [], contracts: [], activities: [], property: null };
        render(<LeadPanel leadId="lead" canWrite={false} />);
        expect(screen.getByRole('heading', { name: ANONYMOUS_LEAD_LABEL })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Нэр нэмэх' })).not.toBeInTheDocument();
    });

    it('requests only managers in the selected lead project', () => {
        mocks.detail.isError = false;
        mocks.detail.data = { lead: { id: 'lead', project_id: 'elysium', customer_name: 'Болд', source: 'other', status: 'new', created_at: '2026-09-13T10:00:00Z' }, viewings: [], contracts: [], activities: [], property: null };
        render(<LeadPanel leadId="lead" canWrite={true} />);
        expect(mocks.managers).toHaveBeenCalledWith('elysium');
        expect(screen.getByText('Elysium')).toBeInTheDocument();
    });

    it('lets an admin identify a legacy lead project and clears its previous manager', () => {
        mocks.role = 'admin';
        mocks.detail.isError = false;
        mocks.detail.data = { lead: { id: 'legacy', project_id: null, sales_manager_name: 'Хуучин менежер', customer_name: 'Болд', source: 'other', status: 'new', created_at: '2026-09-13T10:00:00Z' }, viewings: [], contracts: [], activities: [], property: null };
        render(<LeadPanel leadId="legacy" canWrite={true} />);
        fireEvent.change(screen.getByRole('combobox', { name: 'Лидийн төсөл' }), { target: { value: 'mandala' } });
        expect(mocks.update).toHaveBeenCalledWith({ id: 'legacy', patch: { project_id: 'mandala', sales_manager_name: null } }, expect.any(Object));
    });

    it('does not let a sales manager move a lead to another project', () => {
        mocks.role = 'sales_manager';
        mocks.detail.isError = false;
        mocks.detail.data = { lead: { id: 'lead', project_id: 'mandala', customer_name: 'Болд', source: 'other', status: 'new', created_at: '2026-09-13T10:00:00Z' }, viewings: [], contracts: [], activities: [], property: null };
        render(<LeadPanel leadId="lead" canWrite={true} />);
        expect(screen.queryByRole('combobox', { name: 'Лидийн төсөл' })).not.toBeInTheDocument();
    });
});
