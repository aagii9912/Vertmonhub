import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    json: vi.fn(),
    fetch: vi.fn(),
    sync: vi.fn(),
    auth: { shop: { id: 'shop-a' }, user: { id: 'user-a', role: 'marketing', permissions: { modules: ['marketing-roi'], canWrite: true, canDelete: false } } },
}));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => mocks.auth }));
vi.mock('@/lib/api/dashboardFetch', () => ({ dashboardJson: mocks.json, dashboardFetch: mocks.fetch }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/components/charts/BarChart', () => ({ BarChart: () => <div data-testid="bar-chart" /> }));
// ResponsiveContainer jsdom-д 0 өргөнтэй тул чартын өгөгдлийг шууд харуулна.
vi.mock('@/components/ui/ChartCard', () => ({ ChartCard: ({ title, children }: { title: string; children: React.ReactNode }) => <section><h3>{title}</h3>{children}</section> }));
vi.mock('@/components/charts/ComboChart', () => ({ ComboChart: ({ data }: { data: unknown[] }) => <pre data-testid="combo-chart">{JSON.stringify(data)}</pre> }));
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
const months = [
    { month: '2026-09', label: '9-р сар', leads: 4, meetings: 2, activity: 1, spend: 35000, spendComplete: true, pending: {} },
    { month: '2026-10', label: '10-р сар', leads: 1, meetings: 0, activity: 0, spend: 7000, spendComplete: false, pending: { USD: 4 } },
];

function respond(url: string) {
    if (url.startsWith('/api/dashboard/leads')) return { leads: [{ source: 'facebook_ads', status: 'closed_won', created_at: '2026-09-02T00:00:00Z' }] };
    if (url.startsWith('/api/dashboard/marketing-roi?')) {
        const params = new URLSearchParams(url.split('?')[1]);
        return { roi: roi({ from: params.get('from')!, to: params.get('to')! }) };
    }
    if (url === '/api/dashboard/marketing-roi/timeline') return { months };
    if (url === '/api/dashboard/marketing/social-history') return { posts: [], insights: [] };
    if (url === '/api/marketing/facebook/ads/spend-sync') return { tokenSource: 'system' };
    throw new Error(`unexpected ${url}`);
}

const renderPage = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MarketingROIPage /></QueryClientProvider>);

beforeEach(() => {
    vi.clearAllMocks();
    mocks.json.mockImplementation(async (url: string) => respond(url));
});

describe('marketing ROI page', () => {
    it('reads dated ROI for the selected UB month and never the ad_campaigns snapshot', async () => {
        const month = ubMonth();
        renderPage();
        expect(await screen.findByText('Mandala дуудлага')).toBeInTheDocument();
        expect(mocks.json).toHaveBeenCalledWith(`/api/dashboard/marketing-roi?${new URLSearchParams(month)}`);
        expect(mocks.json.mock.calls.some(([url]) => String(url).includes('ad_campaigns'))).toBe(false);
        // Ханшгүй зардлыг төгрөгтэй нийлүүлэхгүй, эх валютаар тэмдэглэнэ.
        expect(screen.getByText('+ 20 USD ханшгүй — төгрөгт ороогүй')).toBeInTheDocument();
        expect(screen.getByText('Ханшгүй зардал 20 USD — төгрөгийн нийтэд ороогүй.')).toBeInTheDocument();
        expect(screen.getAllByText('Дуудлага (Meta)').length).toBeGreaterThan(0);
        expect(screen.getByText('CPL тооцоогүй')).toBeInTheDocument();
        expect(screen.getByText(/Ханшгүй Meta зардал төгрөгийн шугамд ороогүй: 10-р сар 4 USD/)).toBeInTheDocument();
        expect(JSON.parse(screen.getByTestId('combo-chart').textContent!)).toEqual([
            { label: '9-р сар', leads: 4, meetings: 2, activity: 1, spend: 35000 },
            { label: '10-р сар', leads: 1, meetings: 0, activity: 0, spend: 7000 },
        ]);
        expect(mocks.sync).toHaveBeenLastCalledWith(expect.objectContaining({ shopId: 'shop-a', canWrite: true, from: month.from, to: month.to }));
    });

    it('re-reads ROI for a new range and limits the Meta sync to its last 93 days', async () => {
        renderPage();
        await screen.findByText('Mandala дуудлага');
        fireEvent.change(screen.getByLabelText('Эхлэх өдөр'), { target: { value: '2026-01-01' } });
        fireEvent.change(screen.getByLabelText('Дуусах өдөр'), { target: { value: '2026-09-30' } });
        await waitFor(() => expect(mocks.json).toHaveBeenCalledWith('/api/dashboard/marketing-roi?from=2026-01-01&to=2026-09-30'));
        expect(mocks.sync).toHaveBeenLastCalledWith(expect.objectContaining({ from: '2026-06-30', to: '2026-09-30' }));
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
