import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MarketingToday } from '../MarketingToday';

const mocks = vi.hoisted(() => ({
    report: undefined as unknown,
    queryKeys: [] as unknown[],
    queryFn: undefined as undefined | (() => unknown),
    fetched: [] as string[],
}));
vi.mock('@tanstack/react-query', () => ({
    useQuery: (options: { queryKey: unknown; queryFn: () => unknown }) => {
        mocks.queryKeys.push(options.queryKey);
        mocks.queryFn = options.queryFn;
        return { data: mocks.report ? { report: mocks.report } : undefined, isError: false, isFetching: false, refetch: vi.fn() };
    },
}));
vi.mock('@/lib/api/dashboardFetch', () => ({ dashboardJson: (url: string) => { mocks.fetched.push(url); return Promise.resolve({}); } }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1', role: 'marketing', fullName: 'Солонго', permissions: { modules: ['dashboard', 'marketing-roi', 'leads'] } }, shop: { id: 'shop-a', name: 'Мандала Гарден' } }) }));
vi.mock('@/lib/ai/context', () => ({ useRegisterAiContext: vi.fn(), openAiPanel: vi.fn() }));
vi.mock('@/hooks/useLeads', () => ({ useLeadSummary: () => ({ data: { queues: { unassigned: 4, uncontacted: 0, no_followup: 0, overdue: 0 } }, isError: false }) }));

const metrics = (extra: Record<string, unknown> = {}) => ({ leads: 0, sales: 0, deals: 0, salesPct: null, dealPct: null, spend: 0, spendComplete: true, hasSpend: false, costPerLead: null, costPerSale: null, costPerDeal: null, ...extra });
const report = (extra: Record<string, unknown> = {}) => ({
    totals: { ...metrics({ leads: 186, sales: 120, deals: 12, salesPct: 64.5, dealPct: 6.5, spend: 12_000_000, hasSpend: true, costPerLead: 64_516.13 }), campaigns: 2, content: 5 },
    previous: { ...metrics({ leads: 150, sales: 90 }), campaigns: 1, content: 3 },
    teamTotal: { leadTarget: 200, dealTarget: 15, leadAttainment: 93, dealAttainment: 80, budget: 15_000_000 },
    quality: { noProject: 0, noCampaign: 9, noOwner: 0, unknownHandoff: 0, undatedCompletedActivities: 0, unlinkedContracts: 0 },
    spendQuality: { current: { missingFx: 0, pendingCurrencies: {}, excludedManual: 0, unmappedMeta: 2 }, previous: { missingFx: 0, pendingCurrencies: {}, excludedManual: 0, unmappedMeta: 0 } },
    channels: [
        { id: 'meta_ads', name: 'Meta Ads', ...metrics({ leads: 120, sales: 80, deals: 8, spend: 10_000_000, hasSpend: true, costPerLead: 83_333.33 }) },
        { id: 'google_ads', name: 'Google Ads', ...metrics() },
        { id: 'event', name: 'Event / Open Day', ...metrics({ leads: 66, sales: 40, deals: 4 }) },
    ],
    recent: [{ id: 'a1', name: 'Open Day 10/04', activity_kind: 'campaign', projectName: 'Мандала Гарден', completed_on: '2026-10-04', leads: 30, deals: 2 }],
    ...extra,
});

beforeEach(() => {
    vi.clearAllMocks();
    mocks.queryKeys = [];
    mocks.fetched = [];
    mocks.report = report();
});

describe('Marketing — Today', () => {
    it('reads the full current month from the marketing report', async () => {
        render(<MarketingToday />);
        await mocks.queryFn?.();
        expect(mocks.fetched[0]).toMatch(/^\/api\/marketing\/performance\?from=\d{4}-\d{2}-01&to=\d{4}-\d{2}-(28|29|30|31)$/);
        expect(screen.getByRole('heading', { level: 1, name: 'Сайн байна уу, Солонго.' })).toBeInTheDocument();
    });

    it('shows leads, handoffs, deals and cost per lead against target and budget', () => {
        render(<MarketingToday />);
        const kpis = screen.getByRole('group', { name: 'Маркетингийн гол үзүүлэлт' });
        expect(kpis).toHaveTextContent('Зорилт 200-ийн 93%');
        expect(kpis).toHaveTextContent('Лидийн 64.5%');
        expect(kpis).toHaveTextContent('Зорилт 15-ийн 80%');
        expect(kpis).toHaveTextContent('Зардал 12 сая ₮ / төсөв 15 сая ₮');
    });

    it('does not price a lead when spend has no exchange rate', () => {
        mocks.report = report({ totals: { ...metrics({ leads: 186, hasSpend: true, spendComplete: false, spend: 12_000_000 }), campaigns: 0, content: 0 } });
        render(<MarketingToday />);
        expect(screen.getByRole('group', { name: 'Маркетингийн гол үзүүлэлт' })).toHaveTextContent('Ханш дутуу · тооцоогүй');
    });

    it('lists records to fix and the active channels only', () => {
        render(<MarketingToday />);
        const attention = screen.getByRole('heading', { name: 'Анхаарах' }).closest('section')!;
        expect(within(attention).getAllByRole('listitem').map((li) => li.querySelector('.font-medium')?.textContent)).toEqual([
            '4 лид менежерт хуваарилаагүй', '9 лид кампанит ажилд холбогдоогүй', '2 Meta зардал кампанит ажилгүй',
        ]);
        const channels = screen.getByRole('heading', { name: 'Сувгууд' }).closest('section')!;
        const rows = within(channels).getAllByRole('row').slice(1);
        expect(rows.map((r) => (r as HTMLTableRowElement).cells[0].textContent)).toEqual(['Meta Ads', 'Event / Open Day']);
        expect(rows[1]).toHaveTextContent('—');
        expect(screen.getByText('Open Day 10/04')).toBeInTheDocument();
    });
});
