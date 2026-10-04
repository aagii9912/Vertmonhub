import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { LeadPanel } from './LeadPanel';

const mocks = vi.hoisted(() => ({
    addActivity: vi.fn(), toastSuccess: vi.fn(), toastError: vi.fn(),
    detail: { data: undefined as unknown, isLoading: false, isError: false, error: null, isFetching: false },
}));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: vi.fn() }) }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'manager-a', role: 'sales_manager' }, shop: { id: 'shop-a' } }) }));
vi.mock('@/lib/ai/context', () => ({ useRegisterAiContext: vi.fn() }));
vi.mock('sonner', () => ({ toast: { success: (...args: unknown[]) => mocks.toastSuccess(...args), error: (...args: unknown[]) => mocks.toastError(...args) } }));
vi.mock('@/hooks/useLeads', () => ({
    useLeadProjects: () => ({ data: [{ id: 'mandala', name: 'Mandala Garden', status: 'active' }], isLoading: false }),
    useManagers: () => ({ data: [] }),
    useLeadDetail: () => ({ ...mocks.detail, refetch: vi.fn() }),
    useUpdateLead: () => ({ mutate: vi.fn() }),
    useAddLeadActivity: () => ({ mutateAsync: mocks.addActivity, isPending: false }),
}));
vi.mock('./pickers', () => ({ StatusPicker: () => null, ManagerPicker: () => null }));
vi.mock('./LeadWorkActions', () => ({ LeadWorkActions: () => null }));

beforeEach(() => {
    vi.clearAllMocks();
    mocks.addActivity.mockResolvedValue({ activity: null });
    mocks.detail.data = {
        lead: { id: 'lead', project_id: 'mandala', customer_name: 'Болд', customer_phone: '99112233', source: 'phone', status: 'offered', sales_manager_name: 'Манда', created_at: '2026-09-13T10:00:00Z' },
        viewings: [], contracts: [], activities: [], property: null, partial: [],
        timeline: { events: [], managers: [], conflicts: [], duplicates: null, owner: 'Манда', windowDays: 14, partial: [] },
    };
});

describe('LeadPanel price quote composer', () => {
    it('records a quote with a formatted amount and optional unit', async () => {
        render(<LeadPanel leadId="lead" canWrite={true} />);
        fireEvent.click(screen.getByRole('button', { name: 'Үнийн санал' }));
        const save = screen.getByRole('button', { name: 'Хадгалах' });
        expect(save).toBeDisabled();
        const amount = screen.getByRole('textbox', { name: 'Үнийн саналын дүн (₮)' });
        fireEvent.change(amount, { target: { value: '450 000 000₮' } });
        expect(amount).toHaveValue('450,000,000');
        fireEvent.change(screen.getByRole('textbox', { name: 'Байр/тоот (заавал биш)' }), { target: { value: ' A-1203 ' } });
        fireEvent.click(save);
        await waitFor(() => expect(mocks.addActivity).toHaveBeenCalledWith({ type: 'quote', amount: 450_000_000, unit_label: 'A-1203', content: '', next_followup_at: undefined }));
        expect(mocks.toastSuccess).toHaveBeenCalledWith('Үнийн санал бүртгэгдлээ');
        await waitFor(() => expect(screen.queryByRole('textbox', { name: 'Үнийн саналын дүн (₮)' })).not.toBeInTheDocument());
    });

    it('keeps call and quote mutually exclusive and still saves a call', async () => {
        render(<LeadPanel leadId="lead" canWrite={true} />);
        fireEvent.click(screen.getByRole('button', { name: 'Үнийн санал' }));
        fireEvent.click(screen.getByRole('button', { name: 'Залгав' }));
        expect(screen.getByRole('button', { name: 'Үнийн санал' })).toHaveAttribute('aria-pressed', 'false');
        expect(screen.queryByRole('textbox', { name: 'Үнийн саналын дүн (₮)' })).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Хадгалах' }));
        await waitFor(() => expect(mocks.addActivity).toHaveBeenCalledWith({ type: 'call', content: 'Залгав', next_followup_at: undefined }));
    });

    it('labels a degraded manager history in the partial warning', () => {
        mocks.detail.data = { ...(mocks.detail.data as object), partial: ['timeline'] };
        render(<LeadPanel leadId="lead" canWrite={false} />);
        expect(screen.getByRole('alert')).toHaveTextContent('менежерийн түүх');
        expect(screen.queryByRole('button', { name: 'Үнийн санал' })).not.toBeInTheDocument();
    });
});
