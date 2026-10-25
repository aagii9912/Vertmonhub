// @vitest-environment jsdom
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    json: vi.fn(),
    fetch: vi.fn(),
    sync: vi.fn(),
    timeline: {} as Record<string, unknown>,
    auth: { shop: { id: 'shop-a' }, user: { id: 'user-a', role: 'marketing', permissions: { modules: ['marketing-roi'], canWrite: true, canDelete: false } } },
}));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => mocks.auth }));
vi.mock('@/lib/api/dashboardFetch', () => ({ dashboardJson: mocks.json, dashboardFetch: mocks.fetch }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/components/charts/BarChart', () => ({ BarChart: () => <div data-testid="bar-chart" /> }));
// ResponsiveContainer jsdom-д 0 өргөнтэй тул чартын өгөгдлийг шууд харуулна.
vi.mock('@/components/ui/ChartCard', () => ({ ChartCard: ({ title, children }: { title: string; children: React.ReactNode }) => <section><h3>{title}</h3>{children}</section> }));
vi.mock('@/components/charts/ComboChart', () => ({
    ComboChart: ({ data, line, lineFormatter }: { data: unknown[]; line?: { name?: string }; lineFormatter?: (value: number) => string }) => (
        <div data-testid="combo-chart" data-line={`${line?.name} · ${lineFormatter?.(35000)}`}>{JSON.stringify(data)}</div>
    ),
}));
vi.mock('@/components/marketing/MetaSpendSync', () => ({ MetaSpendSync: (props: { from: string; to: string }) => { mocks.sync(props); return <div data-testid="meta-sync" />; } }));

import MarketingROIPage from './page';
import { ubMonth } from '@/components/marketing/MetaAdsParts';

const spend = (mnt: number, pending: Record<string, number> = {}) => ({ mnt, complete: !Object.keys(pending).length, pending, native: { USD: 15 + (pending.USD ?? 0) } });
const calls = { type: 'calls', label: 'Дуудлага (Meta)', costLabel: 'Нэг дуудлагын өртөг', results: 5, spend: spend(52500), cost: { value: 10500, currency: 'MNT' } };
const roi = (range: { from: string; to: string }) => ({
    range,
    campaigns: [{ campaignId: '101', name: 'Mandala дуудлага', spend: spend(52500), results: [calls], leads: 3, won: 1, revenue: 300_000_000, cpl: 17500, cpa: 52500, roas: 5714.29 }],
    totals: { spend: spend(52500, { USD: 20 }), leads: 3, won: 1, revenue: 300_000_000, cpl: null, cpa: null, roas: null },
    quality: { unattributedMetaLeads: 2, leadsWithoutSpend: 0 },
    meta: { range, spend: spend(52500, { USD: 20 }), delivery: null, results: [calls], campaigns: [], coverage: {}, notes: ['Ханшгүй зардал 20 USD — төгрөгийн нийтэд ороогүй.'], basis: 'Meta дүрэм' },
    basis: { revenue: 'cohort_valid_contract_total', leadPeriod: 'created_at_ub', spendPeriod: 'meta_account_day', note: 'ROI дүрэм' },
});
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
const months = [
    { month: '2026-08', label: '8-р сар', leads: 2, meetings: 0, activity: 0, spend: null, pending: {}, spendDays: 0, spendPartial: false },
    { month: '2026-09', label: '9-р сар', leads: 4, meetings: 2, activity: 1, spend: 35000, pending: {}, spendDays: 15, spendPartial: true },
    { month: '2026-10', label: '10-р сар', leads: 1, meetings: 0, activity: 0, spend: 7000, pending: { USD: 4 }, spendDays: 5, spendPartial: false },
];

function respond(url: string) {
    if (url === '/api/dashboard/marketing-roi/sources') return { stats: sourceStats };
    if (url.startsWith('/api/dashboard/marketing-roi?')) {
        const params = new URLSearchParams(url.split('?')[1]);
        return { roi: roi({ from: params.get('from')!, to: params.get('to')! }) };
    }
    if (url === '/api/dashboard/marketing-roi/timeline') return mocks.timeline;
    if (url === '/api/dashboard/marketing/social-history') return { posts: [], page: null, sync: null, daily: null };
    if (url === '/api/marketing/facebook/ads/spend-sync') return { tokenSource: 'system', accountId: 'act_1' };
    throw new Error(`unexpected ${url}`);
}

const renderPage = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MarketingROIPage /></QueryClientProvider>);

beforeEach(() => {
    vi.clearAllMocks();
    mocks.timeline = { months };
    mocks.json.mockImplementation(async (url: string) => respond(url));
});

describe('marketing ROI page', () => {
    it('reads dated ROI for the selected UB month and never the ad_campaigns snapshot', async () => {
        const month = ubMonth();
        renderPage();
        expect(await screen.findByText('Mandala дуудлага')).toBeInTheDocument();
        expect(mocks.json).toHaveBeenCalledWith(`/api/dashboard/marketing-roi?${new URLSearchParams(month)}`);
        expect(mocks.json.mock.calls.some(([url]) => String(url).includes('ad_campaigns') || String(url).includes('/ads/campaigns') || String(url).includes('/ads/insights'))).toBe(false);
        // Ханшгүй зардлыг төгрөгтэй нийлүүлэхгүй, эх валютаар тэмдэглэнэ.
        expect(screen.getByText('+ 20 USD ханшгүй — төгрөгт ороогүй')).toBeInTheDocument();
        expect(screen.getByText('Ханшгүй зардал 20 USD — төгрөгийн нийтэд ороогүй.')).toBeInTheDocument();
        expect(screen.getAllByText('Дуудлага (Meta)').length).toBeGreaterThan(0);
        expect(screen.getByText('CPL тооцоогүй')).toBeInTheDocument();
        expect(mocks.sync).toHaveBeenLastCalledWith(expect.objectContaining({ shopId: 'shop-a', canWrite: true, from: month.from, to: month.to }));
        // System User токентой үед OAuth холболтын товч харагдахгүй.
        expect(screen.queryByText('Meta Ads холбох')).not.toBeInTheDocument();
    });

    it('shows lead-source totals from the server aggregate over every lead, not the newest 1,000', async () => {
        renderPage();
        expect((await screen.findAllByText('Эх үүсвэрийн шинжилгээ')).length).toBeGreaterThan(0);
        expect(screen.getAllByText('2345').length).toBeGreaterThan(0);
        expect(screen.getByText('4% конверс')).toBeInTheDocument();
        expect(mocks.json).not.toHaveBeenCalledWith(expect.stringMatching(/^\/api\/dashboard\/leads/));
    });

    it('draws timeline spend in tugrik from stored rates, leaves unsynced months empty and lists unconverted and partial months', async () => {
        renderPage();
        const chart = await screen.findByTestId('combo-chart');
        expect(JSON.parse(chart.textContent!)).toEqual([
            { label: '8-р сар', leads: 2, meetings: 0, activity: 0, spend: null },
            { label: '9-р сар', leads: 4, meetings: 2, activity: 1, spend: 35000 },
            { label: '10-р сар', leads: 1, meetings: 0, activity: 0, spend: 7000 },
        ]);
        expect(chart).toHaveAttribute('data-line', 'Meta зардал (₮) · 35,000₮');
        expect(screen.getByText(/Зардал татагдаагүй сард шугам тасарна\. Зөвхөн зарим өдөр нь татагдсан: 9-р сар \(15 өдөр\)\./)).toBeInTheDocument();
        expect(screen.getByText(/Ханшгүй Meta зардал төгрөгийн шугамд ороогүй: 10-р сар 4 USD/)).toBeInTheDocument();
    });

    it('says the daily Meta spend was never pulled instead of drawing a zero line', async () => {
        mocks.timeline = { months: [{ month: '2026-10', label: '10-р сар', leads: 1, meetings: 0, activity: 1, spend: null, pending: {}, spendDays: 0, spendPartial: false }] };
        renderPage();
        expect(await screen.findByText(/өдрийн зардал татагдаагүй тул шугам хоосон/)).toBeInTheDocument();
        expect(JSON.parse(screen.getByTestId('combo-chart').textContent!)[0].spend).toBeNull();
    });

    it('re-reads ROI for a new range and hands the whole range to the Meta sync, which limits it to 93 days itself', async () => {
        renderPage();
        await screen.findByText('Mandala дуудлага');
        fireEvent.change(screen.getByLabelText('Эхлэх өдөр'), { target: { value: '2026-01-01' } });
        fireEvent.change(screen.getByLabelText('Дуусах өдөр'), { target: { value: '2026-09-30' } });
        await waitFor(() => expect(mocks.json).toHaveBeenCalledWith('/api/dashboard/marketing-roi?from=2026-01-01&to=2026-09-30'));
        // 93 өдрийн хязгаар, мэдэгдэл: MetaSpendSync.test.tsx.
        expect(mocks.sync).toHaveBeenLastCalledWith(expect.objectContaining({ from: '2026-01-01', to: '2026-09-30' }));
    });

    it('keeps the page when a date is cleared and asks for a valid range without reading', async () => {
        renderPage();
        await screen.findByText('Mandala дуудлага');
        const reads = mocks.json.mock.calls.length;
        fireEvent.change(screen.getByLabelText('Дуусах өдөр'), { target: { value: '' } });
        expect(await screen.findByText(/зөв дарааллаар/)).toBeInTheDocument();
        expect(screen.getByTestId('meta-sync')).toBeInTheDocument();
        expect(mocks.json.mock.calls.slice(reads).some(([url]) => String(url).startsWith('/api/dashboard/marketing-roi?'))).toBe(false);
    });

    it('shows a failed ROI read as an error with retry instead of zeros', async () => {
        mocks.json.mockImplementation(async (url: string) => {
            if (url.startsWith('/api/dashboard/marketing-roi?')) throw new Error('Сүлжээ тасарлаа');
            return respond(url);
        });
        renderPage();
        expect(await screen.findByText('Meta зардал, гэрээний ROI тайланг уншиж чадсангүй')).toBeInTheDocument();
        expect(screen.getByText('Сүлжээ тасарлаа')).toBeInTheDocument();
        expect(screen.queryByText('Кампанит ажлын ROI')).not.toBeInTheDocument();
    });
});
