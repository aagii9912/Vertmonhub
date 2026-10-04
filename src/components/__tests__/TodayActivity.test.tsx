import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { TodayDashboard } from '../dashboard/today/TodayDashboard';

const mocks = vi.hoisted(() => ({
    mutate: vi.fn(), invalidate: vi.fn(), activityArgs: [] as unknown[],
    activity: { data: undefined as unknown, isPending: false },
}));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: mocks.invalidate }) }));
vi.mock('@/lib/ai/context', () => ({ useRegisterAiContext: vi.fn() }));
vi.mock('@/lib/api/dashboardFetch', () => ({ dashboardMutate: (...args: unknown[]) => mocks.mutate(...args) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));
vi.mock('@/hooks/useMyStats', () => ({ useMyStats: () => ({
    data: { missing: [], recentLeads: [], target: null, kpis: { salesThisMonth: 0, activeContracts: 0, viewingsThisWeek: 0, newLeads: 0 },
        tasks: [{ type: 'followup', id: 'lead-1', title: 'Болдтой холбогдох', subtitle: 'Утасгүй', dueAt: new Date().toISOString(), overdue: false, href: '/dashboard/leads?lead=lead-1' }] },
    isLoading: false, isError: false, error: null, isFetching: false, refetch: vi.fn(),
}) }));
vi.mock('@/hooks/useManagerActivity', () => ({ useManagerActivity: (...args: unknown[]) => { mocks.activityArgs.push(args[0]); return mocks.activity; } }));

const row = (values: Record<string, unknown>) => ({
    period: 'total', calls: 0, meetingsHeld: 0, meetingsNew: 0, noShows: 0,
    requests: { received: 0, resolved: 0, slaTotal: 0, slaMet: 0, onTimePct: null, avgResolutionHours: null },
    target: { calls: null, meetings: null }, attainment: { calls: null, meetings: null }, ...values,
});

beforeEach(() => {
    vi.clearAllMocks();
    mocks.activityArgs = [];
    mocks.mutate.mockResolvedValue({});
    mocks.activity = { data: undefined, isPending: false };
});

describe('Today activity', () => {
    it('logs a call when a follow-up task is marked done', async () => {
        render(<TodayDashboard />);
        fireEvent.click(screen.getAllByRole('button', { name: /Дууссан/ })[0]);
        await waitFor(() => expect(mocks.mutate).toHaveBeenCalledWith('/api/dashboard/leads/lead-1/activities', 'POST',
            { type: 'call', content: 'Залгасан («Өнөөдөр» жагсаалтаас)', next_followup_at: null }));
        expect(mocks.mutate).not.toHaveBeenCalledWith('/api/dashboard/leads/lead-1', 'PATCH', expect.anything());
        expect(mocks.invalidate).toHaveBeenCalledWith({ queryKey: ['manager-activity'] });
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
    });
});
