import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { LeadPanel } from './LeadPanel';

/**
 * «Хэлэлцэж буй гэрээ», «Гэрээ болсон» тэмдэглэгээ (борлуулалтын багийн хүсэлт 2026-11-12, эзэмшигчийн шийдвэр 2026-11-13):
 * лидийн самбараас гэрээ үүсгэхгүй — менежер лидийн төлөвийг тэмдэглэнэ, гэрээ HUB импортоор орж ирнэ.
 */
const mocks = vi.hoisted(() => ({
    mutate: vi.fn(),
    detail: { data: undefined as unknown, isLoading: false, isError: false, error: null, isFetching: false },
}));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: vi.fn() }) }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'manager-a', role: 'sales_manager' }, shop: { id: 'shop-a' } }) }));
vi.mock('@/lib/ai/context', () => ({ useRegisterAiContext: vi.fn() }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/hooks/useLeads', () => ({
    useLeadProjects: () => ({ data: [{ id: 'mandala', name: 'Mandala Garden', status: 'active' }], isLoading: false }),
    useManagers: () => ({ data: [] }),
    useLeadDetail: () => ({ ...mocks.detail, refetch: vi.fn() }),
    useUpdateLead: () => ({ mutate: mocks.mutate }),
    useAddLeadActivity: () => ({ mutateAsync: vi.fn(), isPending: false }),
    useLeadCategories: () => ({ data: [] }),
}));
vi.mock('./pickers', () => ({ StatusPicker: () => null, ManagerPicker: () => null, CategoryPicker: () => null }));
vi.mock('./LeadWorkActions', () => ({ LeadWorkActions: () => null }));

function show(status: string, extra: Record<string, unknown> = {}) {
    mocks.detail.data = {
        lead: { id: 'lead', project_id: 'mandala', customer_name: 'Болд', customer_phone: '99112233', source: 'phone', status, sales_manager_name: 'Манда', created_at: '2026-09-13T10:00:00Z' },
        viewings: [], contracts: [], activities: [], property: null, partial: [],
        timeline: { events: [], managers: [], conflicts: [], duplicates: null, owner: 'Манда', windowDays: 14, partial: [] },
        ...extra,
    };
    return render(<LeadPanel leadId="lead" canWrite={true} />);
}
const sentPatch = () => (mocks.mutate.mock.calls[0][0] as { id: string; patch: Record<string, unknown> });

beforeEach(() => { vi.clearAllMocks(); });

describe('LeadPanel deal marks', () => {
    it('offers the two marks instead of creating a contract from the lead', () => {
        show('contacted');
        expect(screen.queryByRole('link', { name: /Гэрээ үүсгэх/ })).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Хэлэлцэж буй гэрээ' })).toHaveAttribute('aria-pressed', 'false');
        expect(screen.getByRole('button', { name: 'Гэрээ болсон' })).toHaveAttribute('aria-pressed', 'false');
    });

    it('marks and unmarks a negotiating deal through the lead status', () => {
        const view = show('contacted');
        fireEvent.click(screen.getByRole('button', { name: 'Хэлэлцэж буй гэрээ' }));
        expect(sentPatch()).toMatchObject({ id: 'lead', patch: { status: 'negotiating' } });
        view.unmount();
        mocks.mutate.mockClear();
        show('negotiating');
        const mark = screen.getByRole('button', { name: 'Хэлэлцэж буй гэрээ' });
        expect(mark).toHaveAttribute('aria-pressed', 'true');
        fireEvent.click(mark);
        expect(sentPatch()).toMatchObject({ patch: { status: 'contacted' } });
    });

    it('marks a deal as contracted, locks the negotiating mark and can take the mark back', () => {
        const view = show('negotiating');
        fireEvent.click(screen.getByRole('button', { name: 'Гэрээ болсон' }));
        expect(sentPatch()).toMatchObject({ id: 'lead', patch: { status: 'closed_won' } });
        view.unmount();
        mocks.mutate.mockClear();
        show('closed_won');
        expect(screen.getByRole('button', { name: 'Гэрээ болсон' })).toHaveAttribute('aria-pressed', 'true');
        expect(screen.getByRole('button', { name: 'Хэлэлцэж буй гэрээ' })).toBeDisabled();
        fireEvent.click(screen.getByRole('button', { name: 'Гэрээ болсон' }));
        expect(sentPatch()).toMatchObject({ patch: { status: 'negotiating' } });
    });

    it('hides the marks for a lost lead and for a lead the manager has not claimed', () => {
        const lost = show('closed_lost');
        expect(screen.queryByRole('button', { name: 'Гэрээ болсон' })).not.toBeInTheDocument();
        lost.unmount();
        show('contacted', { claimOnly: true });
        expect(screen.queryByRole('button', { name: 'Хэлэлцэж буй гэрээ' })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Гэрээ болсон' })).not.toBeInTheDocument();
    });
});
