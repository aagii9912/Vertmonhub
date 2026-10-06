// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const transport = vi.hoisted(() => ({ json: vi.fn(), fetch: vi.fn(), meta: {} as Record<string, unknown>, timeline: {} as Record<string, unknown> }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ shop: { id: 'shop-1' }, user: { id: 'user-1', role: 'marketing', permissions: { modules: ['marketing-roi'], canWrite: true } } }) }));
vi.mock('@/lib/api/dashboardFetch', () => ({ dashboardJson: transport.json, dashboardFetch: transport.fetch }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/components/charts/BarChart', () => ({ BarChart: () => <div data-testid="bar-chart" /> }));
// ResponsiveContainer jsdom-д 0 хэмжээтэй тул хүүхдээ зурдаггүй.
vi.mock('@/components/ui/ChartCard', () => ({ ChartCard: ({ title, children }: { title?: React.ReactNode; children: React.ReactNode }) => <section>{title}{children}</section> }));
vi.mock('@/components/charts/ComboChart', () => ({
    ComboChart: ({ data, line, lineFormatter }: { data: Array<Record<string, unknown>>; line?: { name?: string }; lineFormatter?: (value: number) => string }) => (
        <div data-testid="combo-chart" data-spend={JSON.stringify(data.map((row) => row.spend))}>{line?.name} · {lineFormatter?.(300.38)}</div>
    ),
}));

import MarketingROIPage from './page';

const campaign = { id: 'c1', name: 'Мандала кампанит ажил', external_id: '120200', status: 'active', objective: null, budget: 0,
    spend: 300.38, impressions: 10_000, clicks: 700, conversions: 3, ctr: 7, cpc: 0.43, last_synced_at: null };
// Сервер бүх лидээр нэгтгэнэ — 1000-аас олон лидтэй төсөл.
const sourceStats = {
    totals: { total: 2345, won: 45, lost: 300, active: 2000, conversionRate: 2 },
    sources: [
        { source: 'facebook', total: 2000, won: 30, lost: 250, active: 1720, conversionRate: 2 },
        { source: 'referral', total: 345, won: 15, lost: 50, active: 280, conversionRate: 4 },
    ],
    bestSource: 'referral',
    monthly: [{ month: '2026-09', label: '9-р сар', count: 1200 }, { month: '2026-10', label: '10-р сар', count: 1145 }],
};
const roiTotals = { spend: 300.38, leads: 3, won: 1, revenue: 250_000_000, cpl: null, cpa: null, roas: null, profit: null };

beforeEach(() => {
    transport.meta = { accountId: 'act_1', tokenSource: 'system', status: { currency: 'USD' } };
    transport.timeline = { months: [{ month: '2026-10', label: '10-р сар', leads: 1, meetings: 0, activity: 1, spend: 300.38, spendDays: 5, spendPartial: false }] };
    transport.json.mockImplementation(async (url: string) => {
        if (url === '/api/dashboard/marketing-roi/sources') return { stats: sourceStats };
        if (url.startsWith('/api/marketing/data/ad_campaigns')) return { rows: [campaign] };
        if (url === '/api/dashboard/marketing-roi') return { roi: { campaigns: [{ external_id: '120200', name: campaign.name, ...roiTotals }], sources: [], totals: roiTotals } };
        if (url === '/api/dashboard/marketing/social-history') return { posts: [], insights: [] };
        if (url === '/api/dashboard/marketing-roi/timeline') return transport.timeline;
        if (url === '/api/marketing/facebook/ads/spend-sync') return transport.meta;
        throw new Error(`unexpected ${url}`);
    });
});
afterEach(() => { vi.clearAllMocks(); });

const renderPage = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MarketingROIPage /></QueryClientProvider>);

it('shows lead-source totals from the server aggregate over every lead, not the newest 1,000', async () => {
    renderPage();
    expect((await screen.findAllByText('Эх үүсвэрийн шинжилгээ')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('2345').length).toBeGreaterThan(0);
    expect(screen.getByText('4% конверс')).toBeInTheDocument();
    expect(transport.json).not.toHaveBeenCalledWith(expect.stringMatching(/^\/api\/dashboard\/leads/), expect.anything());
    expect(screen.queryByText(/Тайлан бүрэн биш/)).not.toBeInTheDocument();
});

it('renders Meta spend and CPC in the ad-account currency, never as tugrik', async () => {
    renderPage();
    expect(await screen.findByText('Зарын дансны валютаар (USD), төгрөгт хөрвүүлээгүй')).toBeInTheDocument();
    expect(screen.getAllByText('$300.38').length).toBeGreaterThanOrEqual(3);
    expect(screen.getAllByText('$0.43').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Зарцуулалт (USD)').length).toBeGreaterThan(0);
    expect(screen.getByTestId('combo-chart')).toHaveTextContent('Зарын зардал (USD) · $300.38');
    expect(document.body.textContent).not.toMatch(/300(\.38)?₮|0\.43₮|\b0₮/);
    // Гэрээний дүн жинхэнэ төгрөг хэвээр.
    expect(screen.getAllByText('250.0 сая₮').length).toBeGreaterThan(0);
});

it('labels the currency as unknown instead of assuming tugrik when no account currency is recorded', async () => {
    transport.meta = { accountId: 'act_1', tokenSource: 'system', status: null };
    renderPage();
    expect(await screen.findByText('Зарын дансны валют тодорхойгүй, төгрөгт хөрвүүлээгүй')).toBeInTheDocument();
    expect(screen.getAllByText('300.38').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Зарцуулалт (валют тодорхойгүй)').length).toBeGreaterThan(0);
    expect(document.body.textContent).not.toMatch(/300(\.38)?₮/);
});

it('draws timeline spend in the series currency, leaves unsynced months empty and names partial months', async () => {
    transport.timeline = { currency: 'USD', months: [
        { month: '2026-08', label: '8-р сар', leads: 1, meetings: 0, activity: 0, spend: 12.5, spendDays: 15, spendPartial: true },
        { month: '2026-09', label: '9-р сар', leads: 2, meetings: 1, activity: 1, spend: null, spendDays: 0, spendPartial: false },
    ] };
    transport.meta = { accountId: 'act_1', tokenSource: 'system', status: null };
    renderPage();
    const chart = await screen.findByTestId('combo-chart');
    expect(chart).toHaveTextContent('Зарын зардал (USD) · $300.38');
    expect(chart).toHaveAttribute('data-spend', '[12.5,null]');
    expect(screen.getByText(/зарын дансны валютаар \(USD\), төгрөгт хөрвүүлээгүй\. Зардал татагдаагүй сард шугам тасарна\. Зөвхөн зарим өдөр нь татагдсан: 8-р сар \(15 өдөр\)\./)).toBeInTheDocument();
});

it('says the daily Meta spend was never pulled instead of drawing a zero line', async () => {
    transport.timeline = { currency: null, months: [{ month: '2026-10', label: '10-р сар', leads: 1, meetings: 0, activity: 1, spend: null, spendDays: 0, spendPartial: false }] };
    renderPage();
    expect(await screen.findByText(/Meta-аас өдрийн зардал татагдаагүй тул шугам хоосон/)).toBeInTheDocument();
    expect(screen.getByTestId('combo-chart')).toHaveAttribute('data-spend', '[null]');
});
