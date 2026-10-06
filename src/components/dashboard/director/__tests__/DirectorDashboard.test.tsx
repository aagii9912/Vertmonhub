import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { DirectorDashboard } from '../DirectorDashboard';

const mocks = vi.hoisted(() => ({
    director: undefined as unknown,
    summary: { data: undefined as unknown, isPending: false, isError: false, refetch: vi.fn() },
    summaryArgs: [] as unknown[],
    modules: ['dashboard', 'reports', 'leads'],
    role: 'admin',
}));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1', role: mocks.role, fullName: 'Ариунаа', permissions: { modules: mocks.modules } }, shop: { id: 'shop-a', name: 'Мандала Гарден' } }) }));
vi.mock('@/lib/ai/context', () => ({ useRegisterAiContext: vi.fn(), openAiPanel: vi.fn() }));
vi.mock('@/lib/navigation/pageTitle', () => ({ usePageTitle: vi.fn() }));
vi.mock('@/hooks/useDirector', () => ({ useDirector: () => ({ data: mocks.director, isLoading: false, isFetching: false, isError: false, error: null, refetch: vi.fn() }) }));
vi.mock('@/hooks/useLeads', () => ({ useLeadSummary: (...args: unknown[]) => { mocks.summaryArgs.push(args[0]); return mocks.summary; } }));

const payload = (extra: Record<string, unknown> = {}) => ({
    year: 2026, month: 10, missing: [],
    sales: { actual: 1_010_000_000, target: 900_000_000, attainmentPct: 112, momDeltaPct: 18, units: 4, unitsByType: [], trendActual: Array(12).fill(0), trendTarget: Array(12).fill(0), yearActual: 1_010_000_000, yearTarget: 9_000_000_000 },
    leaderboard: [
        { rank: 1, name: 'Номин', contracts: 2, sales: 420_000_000, viewings: 22, leads: 40, target: 300_000_000, targetPct: 140 },
        { rank: 2, name: 'Сараа', contracts: 1, sales: 180_000_000, viewings: 14, leads: 31, target: 300_000_000, targetPct: 60 },
    ],
    funnel: { rows: [{ source: 'facebook_ads', leads: 120, viewings: 40, contracts: 6, conversionPct: 5 }], totals: { leads: 186, viewings: 64, contracts: 12 } },
    meetings: { scheduled: 64, held: 50 },
    receivables: { count: 3, total: 46_200_000, items: [{ contractId: 'k1', customer: 'Б. Энхжин', amount: 21_000_000, daysOverdue: 21 }], outstandingTotal: 2_400_000_000 },
    inventory: { total: 200, available: 80, sold: 110, pending: 10, blocks: [] },
    ...extra,
});

beforeEach(() => {
    vi.clearAllMocks();
    globalThis.ResizeObserver ??= class { observe() {} disconnect() {} unobserve() {} } as unknown as typeof ResizeObserver;
    mocks.summaryArgs = [];
    mocks.role = 'admin';
    mocks.modules = ['dashboard', 'reports', 'leads'];
    mocks.director = payload();
    mocks.summary = { data: { queues: { unassigned: 7, uncontacted: 12, no_followup: 0, overdue: 5 } }, isPending: false, isError: false, refetch: vi.fn() };
});

describe('Director — Today', () => {
    it('puts the work first: assign, overdue steps, uncontacted leads and late payments, each with its filter', () => {
        render(<DirectorDashboard />);
        expect(screen.getByRole('heading', { level: 1, name: 'Сайн байна уу, Ариунаа.' })).toBeInTheDocument();
        const attention = screen.getByRole('heading', { name: 'Анхаарах' }).closest('section')!;
        const items = within(attention).getAllByRole('listitem');
        expect(items.map((li) => li.querySelector('.font-medium')?.textContent)).toEqual([
            '7 лид хуваарилаагүй', '5 лидийн алхам хугацаа хэтэрсэн', '12 лид холбоо бүртгээгүй', '3 гэрээний төлбөр хоцорсон',
        ]);
        expect(within(items[0]).getByRole('link', { name: 'Хуваарилах' })).toHaveAttribute('href', '/dashboard/leads?queue=unassigned');
        expect(within(items[1]).getByRole('link', { name: 'Харах' })).toHaveAttribute('href', '/dashboard/leads?queue=overdue');
        expect(items[3]).toHaveTextContent('хамгийн их нь 21 хоног');
    });

    it('shows each KPI against its target with the source, and the month\'s meetings', () => {
        render(<DirectorDashboard />);
        const kpis = screen.getByRole('group', { name: 'Сарын гол үзүүлэлт' });
        expect(kpis).toHaveTextContent('Зорилт 900 сая ₮-ийн 112%');
        expect(kpis).toHaveTextContent('▲ 18% өмнөх сараас');
        expect(kpis).toHaveTextContent('Хуваарилаагүй 7');
        expect(kpis).toHaveTextContent('Болсон 50 · шинэ лидийн 34% уулзалттай');
        const managers = screen.getByRole('heading', { name: 'Менежерүүд' }).closest('section')!;
        expect(within(managers).getAllByRole('row')[1]).toHaveTextContent('Номин');
        expect(within(managers).getAllByRole('row')[1]).toHaveTextContent('140%');
    });

    it('explains missing sections instead of showing zero', () => {
        mocks.director = payload({ missing: ['receivables', 'viewings'] });
        render(<DirectorDashboard />);
        const kpis = screen.getByRole('group', { name: 'Сарын гол үзүүлэлт' });
        expect(kpis).toHaveTextContent('Төлбөрийн хуваарийг уншиж чадсангүй');
        expect(kpis).toHaveTextContent('Уулзалтын мэдээлэл түр боломжгүй');
        expect(screen.getByRole('heading', { name: 'Анхаарах' }).closest('section')).not.toHaveTextContent('гэрээний төлбөр хоцорсон');
    });

    it('does not show unread sales as zero or unread targets as unconfigured', () => {
        mocks.director = payload({ missing: ['sales', 'targets'], sales: { ...payload().sales, actual: 0, target: 0, attainmentPct: 0, momDeltaPct: null } });
        render(<DirectorDashboard />);
        const kpis = screen.getByRole('group', { name: 'Сарын гол үзүүлэлт' });
        expect(kpis).toHaveTextContent('Борлуулалтын мэдээлэл түр боломжгүй');
        expect(kpis).not.toHaveTextContent('0 ₮');
        expect(screen.getByText('Борлуулалтын мэдээллийг уншиж чадсангүй. Сарын дүнг тооцоогүй.')).toBeInTheDocument();
        mocks.director = payload({ missing: ['targets'] });
        render(<DirectorDashboard />);
        expect(screen.getAllByRole('group', { name: 'Сарын гол үзүүлэлт' })[1]).toHaveTextContent('Сарын зорилтын мэдээлэл түр боломжгүй');
        expect(screen.queryByText('Сарын зорилт тохируулаагүй')).not.toBeInTheDocument();
    });

    it('does not read lead queues without the leads module and survives an empty payload', () => {
        mocks.role = 'viewer';
        mocks.modules = ['dashboard', 'reports'];
        mocks.director = { available: false };
        render(<DirectorDashboard />);
        expect(mocks.summaryArgs[0]).toEqual({ enabled: false });
        expect(screen.getByRole('heading', { name: 'Анхаарах' })).toBeInTheDocument();
        expect(screen.queryByRole('link', { name: 'Хуваарилах' })).not.toBeInTheDocument();
    });
});
