import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { TodayDashboard } from '../dashboard/today/TodayDashboard';
import { DirectorDashboard } from '../dashboard/director/DirectorDashboard';
import { LeadPanel } from '../leads/LeadPanel';
import { QuickCreateSheet } from '../dashboard/QuickCreateSheet';
import { openQuickCreate } from '@/lib/navigation/commandPalette';

const mocks = vi.hoisted(() => ({
    refetch: vi.fn(), push: vi.fn(), mutate: vi.fn(), enqueue: vi.fn(), isNetworkError: vi.fn(), toastError: vi.fn(),
    myStats: { data: undefined as unknown, isError: true },
    detail: { data: undefined as unknown, isLoading: false, isError: true, error: new Error('Лид олдсонгүй'), isFetching: false },
}));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: vi.fn() }) }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'manager-a' }, shop: { id: 'shop-a' } }) }));
vi.mock('@/lib/ai/context', () => ({ useRegisterAiContext: vi.fn() }));
vi.mock('@/lib/navigation/pageTitle', () => ({ usePageTitle: vi.fn() }));
vi.mock('@/lib/api/dashboardFetch', () => ({ dashboardMutate: (...args: unknown[]) => mocks.mutate(...args), dashboardFetch: vi.fn() }));
vi.mock('@/lib/offline/outbox', () => ({ enqueue: (...args: unknown[]) => mocks.enqueue(...args), isNetworkError: () => mocks.isNetworkError() }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: (...args: unknown[]) => mocks.toastError(...args) } }));
vi.mock('@/hooks/useMyStats', () => ({ useMyStats: () => ({ ...mocks.myStats, isLoading: false, error: new Error('Өгөгдөл татаж чадсангүй'), refetch: mocks.refetch }) }));
vi.mock('@/hooks/useDirector', () => ({ useDirector: () => ({ data: undefined, isLoading: false, isError: true, error: new Error('Өгөгдөл татаж чадсангүй'), refetch: mocks.refetch }) }));
vi.mock('@/hooks/useLeads', () => ({
    useLeadDetail: () => ({ ...mocks.detail, refetch: mocks.refetch }),
    useUpdateLead: () => ({ mutate: vi.fn() }), useAddLeadActivity: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock('../leads/pickers', () => ({ StatusPicker: () => null, ManagerPicker: () => null }));
vi.mock('../leads/LeadWorkActions', () => ({ LeadWorkActions: () => null }));

beforeEach(() => {
    vi.clearAllMocks();
    mocks.myStats.data = undefined;
    mocks.myStats.isError = true;
    mocks.detail.data = undefined;
    mocks.detail.isError = true;
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
        render(<LeadPanel leadId="missing" managers={[]} canWrite={false} onClose={onClose} />);
        expect(screen.getByRole('alert')).toHaveTextContent('Лид олдсонгүй');
        fireEvent.click(screen.getByRole('button', { name: 'Хаах' }));
        expect(onClose).toHaveBeenCalledOnce();
    });

    it('identifies a partial lead history without discarding the loaded lead', () => {
        mocks.detail.isError = false;
        mocks.detail.data = { lead: { id: 'lead', customer_name: 'Болд', source: 'other', status: 'new', created_at: '2026-09-13T10:00:00Z' }, viewings: [], contracts: [], activities: [], property: null, partial: ['viewings', 'contracts'] };
        render(<LeadPanel leadId="lead" managers={[]} canWrite={false} />);
        expect(screen.getByRole('alert')).toHaveTextContent('уулзалт, гэрээ');
        expect(screen.getByRole('heading', { name: 'Болд' })).toBeInTheDocument();
    });

    it('opens scheduling with the newly created lead preselected', async () => {
        render(<QuickCreateSheet />);
        act(() => openQuickCreate('lead'));
        const input = await screen.findByPlaceholderText('Ж: Г. Энхжин');
        fireEvent.change(input, { target: { value: 'Болд' } });
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
        fireEvent.click(screen.getByRole('button', { name: /^Хадгалах/ }));
        await waitFor(() => expect(mocks.toastError).toHaveBeenCalled());
        expect(input).toHaveValue('Болд');
        expect(screen.getByRole('dialog')).toBeInTheDocument();
        const firstPayload = mocks.mutate.mock.calls[0][2];
        fireEvent.click(screen.getByRole('button', { name: /^Хадгалах/ }));
        await waitFor(() => expect(mocks.mutate).toHaveBeenCalledTimes(2));
        expect(mocks.mutate.mock.calls[1][2].client_request_id).toBe(firstPayload.client_request_id);
    });
});
