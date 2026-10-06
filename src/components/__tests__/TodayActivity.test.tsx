import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { TodayDashboard } from '../dashboard/today/TodayDashboard';
import { ubStartOfDay } from '@/lib/utils/date';

const mocks = vi.hoisted(() => ({
    mutate: vi.fn(), invalidate: vi.fn(), addActivity: vi.fn(), updateViewing: vi.fn(), activityArgs: [] as unknown[],
    activity: { data: undefined as unknown, isPending: false },
    stats: {} as Record<string, unknown>,
}));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: mocks.invalidate }) }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1', role: 'sales_manager', fullName: 'Номин', permissions: { modules: ['dashboard', 'leads'] } }, shop: { id: 'shop-a', name: 'Мандала Гарден' } }) }));
vi.mock('@/lib/ai/context', () => ({ useRegisterAiContext: vi.fn(), openAiPanel: vi.fn() }));
vi.mock('@/lib/api/dashboardFetch', () => ({ dashboardMutate: (...args: unknown[]) => mocks.mutate(...args) }));
vi.mock('@/lib/navigation/commandPalette', () => ({ openQuickCreate: vi.fn() }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));
vi.mock('@/hooks/useMyStats', () => ({ useMyStats: () => ({ data: mocks.stats, isLoading: false, isError: false, error: null, isFetching: false, refetch: vi.fn() }) }));
vi.mock('@/hooks/useManagerActivity', () => ({ useManagerActivity: (...args: unknown[]) => { mocks.activityArgs.push(args[0]); return mocks.activity; } }));
vi.mock('@/hooks/useLeads', () => ({ useAddLeadActivity: () => ({ mutateAsync: mocks.addActivity, isPending: false }) }));
vi.mock('@/hooks/useViewings', () => ({ useUpdateViewing: () => ({ mutateAsync: mocks.updateViewing, isPending: false }) }));

const now = () => new Date().toISOString();
const followup = (extra: Record<string, unknown> = {}) => ({ type: 'followup', id: 'lead-1', title: 'Болдтой холбогдох', subtitle: 'Утасгүй', dueAt: now(), overdue: false, href: '/dashboard/leads?lead=lead-1', leadId: 'lead-1', ...extra });
const stats = (extra: Record<string, unknown> = {}) => ({
    missing: [], recentLeads: [], target: null, kpis: { salesThisMonth: 0, activeContracts: 0, viewingsThisWeek: 0, newLeads: 0 },
    tasks: [followup()], ...extra,
});
const row = (values: Record<string, unknown>) => ({
    period: 'total', calls: 0, meetingsHeld: 0, meetingsNew: 0, noShows: 0,
    requests: { received: 0, resolved: 0, slaTotal: 0, slaMet: 0, onTimePct: null, avgResolutionHours: null },
    target: { calls: null, meetings: null }, attainment: { calls: null, meetings: null }, ...values,
});
const work = () => screen.getByRole('heading', { name: 'Дараагийн ажил' }).closest('section')!;

beforeEach(() => {
    vi.clearAllMocks();
    mocks.activityArgs = [];
    mocks.stats = stats();
    mocks.mutate.mockResolvedValue({});
    mocks.addActivity.mockResolvedValue({});
    mocks.updateViewing.mockResolvedValue({});
    mocks.activity = { data: undefined, isPending: false };
});

describe('Today — manager', () => {
    it('asks for the result and next step when a follow-up is done, and logs it as a call', async () => {
        render(<TodayDashboard />);
        fireEvent.click(within(work()).getByRole('button', { name: /Дууссан/ }));
        expect(mocks.mutate).not.toHaveBeenCalled();
        expect(within(work()).getByRole('button', { name: /Залгав/ })).toHaveAttribute('aria-pressed', 'true');
        fireEvent.change(within(work()).getByRole('textbox', { name: 'Тэмдэглэл эсвэл дуудлагын үр дүн' }), { target: { value: 'Бямба гарагт ирнэ' } });
        fireEvent.click(within(work()).getByRole('button', { name: 'Маргааш' }));
        fireEvent.click(within(work()).getByRole('button', { name: /Хадгалах/ }));
        await waitFor(() => expect(mocks.addActivity).toHaveBeenCalledWith(expect.objectContaining({ type: 'call', content: 'Бямба гарагт ирнэ', next_followup_at: expect.stringMatching(/T02:00:00\.000Z$/) })));
        await waitFor(() => expect(within(work()).queryByRole('textbox', { name: 'Тэмдэглэл эсвэл дуудлагын үр дүн' })).not.toBeInTheDocument());
    });

    it('does not log a second call when one was already logged today, and lets a director clear a manager\'s step', async () => {
        mocks.stats = stats({ tasks: [followup({ contactedToday: true })] });
        const { unmount } = render(<TodayDashboard />);
        fireEvent.click(within(work()).getByRole('button', { name: /Дууссан/ }));
        expect(within(work()).getByRole('button', { name: /Залгав/ })).toHaveAttribute('aria-pressed', 'false');
        expect(within(work()).getByRole('button', { name: /Хадгалах/ })).toBeDisabled();
        fireEvent.change(within(work()).getByRole('textbox', { name: 'Тэмдэглэл эсвэл дуудлагын үр дүн' }), { target: { value: 'Мессежээр хариулсан' } });
        fireEvent.click(within(work()).getByRole('button', { name: /Хадгалах/ }));
        await waitFor(() => expect(mocks.addActivity).toHaveBeenCalledWith({ type: 'note', content: 'Мессежээр хариулсан', next_followup_at: null }));
        unmount();
        mocks.stats = stats();
        render(<TodayDashboard managerName="Сараа" embedded />);
        fireEvent.click(within(work()).getByRole('button', { name: /Дууссан/ }));
        await waitFor(() => expect(mocks.mutate).toHaveBeenCalledWith('/api/dashboard/leads/lead-1', 'PATCH', { next_followup_at: null }));
        expect(mocks.addActivity).toHaveBeenCalledTimes(1);
    });

    it('records a meeting as held with the customer\'s feedback, and closes a reminder at once', async () => {
        mocks.stats = stats({ tasks: [
            { type: 'viewing', id: 'view-1', title: 'В-1202', subtitle: 'Уулзалт · Болд', dueAt: now(), overdue: false, href: '/dashboard/leads?lead=lead-2', leadId: 'lead-2' },
            { type: 'personal', id: 'task-1', title: 'Үнийн санал бэлтгэх', subtitle: 'Миний ажил', dueAt: now(), overdue: false, href: '/dashboard/tasks' },
        ] });
        render(<TodayDashboard />);
        const [meeting, reminder] = within(work()).getAllByRole('button', { name: /Дууссан/ });
        fireEvent.click(reminder);
        await waitFor(() => expect(mocks.mutate).toHaveBeenCalledWith('/api/dashboard/tasks/task-1', 'PATCH', { status: 'done' }));
        fireEvent.click(meeting);
        fireEvent.change(within(work()).getByRole('textbox', { name: 'Харилцагчийн санал' }), { target: { value: 'Үнэд тохирсон' } });
        fireEvent.click(within(work()).getByRole('button', { name: /Хадгалах/ }));
        await waitFor(() => expect(mocks.updateViewing).toHaveBeenCalledWith({ id: 'view-1', patch: { status: 'completed', customer_feedback: 'Үнэд тохирсон' } }));
    });

    it('greets the manager with the true number of tasks and points to the rest', () => {
        mocks.stats = stats({ taskCounts: { all: 26, followup: 24, viewing: 1, personal: 1, overdue: 7 } });
        render(<TodayDashboard />);
        expect(screen.getByRole('heading', { level: 1, name: 'Сайн байна уу, Номин.' })).toBeInTheDocument();
        expect(screen.getByText(/хугацаа хэтэрсэн/)).toHaveTextContent('7 хугацаа хэтэрсэн');
        expect(within(work()).getByRole('button', { name: /Бүгд/ })).toHaveTextContent('26');
        expect(within(work()).getByRole('link', { name: /Өөр 25 ажил байна/ })).toHaveAttribute('href', '/dashboard/leads?view=mine&sort=next_followup_at&dir=asc');
    });

    it('shows personal sales apart from the team target and the manager\'s share of it', () => {
        mocks.stats = stats({ kpis: { salesThisMonth: 300_000_000, activeContracts: 2, viewingsThisWeek: 4, newLeads: 0 },
            target: { periods: { month: { target: 900_000_000, actual: 450_000_000 } }, mine: { month: 300_000_000 } } });
        render(<TodayDashboard />);
        const card = screen.getByRole('heading', { name: /^Миний \d+-р сар$/ }).closest('section')!;
        expect(card).toHaveTextContent('Миний борлуулалт300 сая ₮');
        expect(card).toHaveTextContent('Багийн зорилт 900 сая ₮50%');
        expect(card).toHaveTextContent('миний хувь 33%');
    });

    it('lists today\'s new leads, longest waiting uncontacted first', () => {
        // Өнөөдрийн (УБ) хилээс гарахгүй хугацаа.
        const sinceMidnight = Math.max(0, Math.floor((Date.now() - ubStartOfDay().getTime()) / 60_000));
        const ago = (minutes: number) => new Date(Date.now() - Math.min(minutes, sinceMidnight) * 60_000).toISOString();
        mocks.stats = stats({ kpis: { salesThisMonth: 0, activeContracts: 0, viewingsThisWeek: 0, newLeads: 7 }, recentLeads: [
            { id: 'a', customer_name: 'Г. Тэмүүлэн', customer_phone: '88112233', status: 'contacted', created_at: ago(10), last_contact_at: ago(5) },
            { id: 'b', customer_name: 'Д. Болормаа', customer_phone: '99112233', status: 'new', created_at: ago(130) },
        ] });
        render(<TodayDashboard />);
        const panel = screen.getByRole('heading', { name: 'Өнөөдөр ирсэн лид' }).closest('section')!;
        const items = within(panel).getAllByRole('listitem');
        expect(items[0]).toHaveTextContent('Д. Болормаа');
        expect(items[0]).toHaveTextContent('хүлээж байна');
        expect(items[1]).toHaveTextContent('Холбогдсон');
        expect(within(panel).getByRole('link', { name: /Бүгдийг харах \(7\)/ })).toHaveAttribute('href', '/dashboard/leads?view=mine');
    });

    it('shows today calls and meetings against the daily target, and no target as such', () => {
        mocks.activity = { isPending: false, data: { personal: true, onboarding: false, targetDays: 1, managers: [{ manager: 'Номин', active: true, inRoster: true, openOverdue: 2,
            daily: { calls: 20, meetings: null }, rows: [], totals: row({ calls: 15, meetingsHeld: 1, target: { calls: 20, meetings: null }, attainment: { calls: 75, meetings: null } }) }] } };
        render(<TodayDashboard />);
        const strip = screen.getByRole('group', { name: 'Өнөөдрийн идэвх' });
        expect(strip).toHaveTextContent('15 / 20');
        expect(strip).toHaveTextContent('75%');
        expect(strip).toHaveTextContent('1 зорилтгүй');
        expect(strip).toHaveTextContent('2хэтэрсэн санал хүсэлт');
        expect(mocks.activityArgs[0]).toMatchObject({ group: 'day', manager: null });
    });

    it('asks for the drilled-in manager and explains a missing roster link', () => {
        mocks.activity = { isPending: false, data: { personal: true, onboarding: true, targetDays: 1, managers: [] } };
        render(<TodayDashboard managerName="Сараа" embedded />);
        expect(mocks.activityArgs[0]).toMatchObject({ manager: 'Сараа' });
        expect(screen.getByText('Менежерийн бүртгэлд холбогдоогүй тул идэвх тооцогдохгүй.')).toBeInTheDocument();
        expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument();
    });
});
