import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, expect, it, vi } from 'vitest';
import { compareWithPrevious } from '@/lib/marketing/channel-reports';
import type { ChannelReportMatch, ChannelReportMatches, ChannelReportRecord } from '@/lib/marketing/channel-reports-load';

const mocks = vi.hoisted(() => ({ json: vi.fn() }));
vi.mock('@/lib/api/dashboardFetch', () => ({ dashboardJson: mocks.json }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ shop: { id: 'shop-1' }, user: { id: 'user-1' } }) }));
import { WeeklyMarketingChannels } from './WeeklyMarketingChannels';

const week = { from: '2026-09-23', to: '2026-09-29' };
const empty: ChannelReportMatch = { report: null, exact: false, longer: false, previous: null, comparison: null };
const metaReport = (overrides: Partial<ChannelReportRecord> = {}): ChannelReportRecord => ({
    id: 'm1', source: 'meta_ads', period_from: week.from, period_to: week.to, file_name: 'meta-daily.csv', origin: 'file',
    data_from: '2026-09-23', data_to: '2026-09-28', row_count: 13, note: null, imported_by: null, created_at: '2026-10-01', updated_at: '2026-10-01',
    totals: {
        spend: 233.1, currency: 'USD', impressions: 153074, link_clicks: 734,
        results_calls: 76, spend_calls: 141.09, cost_per_result_calls: 1.86,
        results_post_engagement: 11604, spend_post_engagement: 43.21, cost_per_result_post_engagement: 0.0037,
        spend_reach: 6.95,
    },
    warnings: [{ code: 'mixed_results', level: 'info', message: 'төрлөөр' }, { code: 'partial_coverage', level: 'warning', message: '6/7' }],
    breakdown: [
        { kind: 'campaign', label: 'Пост', tag: 'post_interaction', values: { spend: 92.01, results: 364 } },
        { kind: 'campaign', label: 'Хүрэлт', tag: 'reach', values: { spend: 0.4, results: null } },
        { kind: 'campaign', label: 'Дуудлага', tag: 'calls', values: { spend: 141.09, results: 76 } },
        { kind: 'campaign', label: 'Зогссон', tag: 'calls', values: { spend: 0, results: 0 } },
    ],
    mapping: {},
    ...overrides,
});
const respond = (meta: ChannelReportMatch) => mocks.json.mockResolvedValue({ latest: { meta_ads: meta, facebook_page: empty, callpro: empty, sms: empty } satisfies ChannelReportMatches });
const show = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><WeeklyMarketingChannels {...week} /></QueryClientProvider>);

beforeEach(() => vi.clearAllMocks());

it('shows Meta key metrics, results per type with sub-cent costs, coverage, origin and top campaigns', async () => {
    const report = metaReport();
    const previous = { ...report, id: 'm0', period_from: '2026-09-16', period_to: '2026-09-22', data_from: '2026-09-16', data_to: '2026-09-22', totals: { ...report.totals, results_calls: 59 } };
    respond({ report, exact: true, longer: false, previous, comparison: compareWithPrevious(report.totals, previous.totals, 'meta_ads', { partialCoverage: true }) });
    show();
    const card = await screen.findByRole('region', { name: 'Meta Ads Manager' });
    expect(within(card).getByText('233.1 USD', { exact: true })).toBeInTheDocument();
    expect(within(card).getByText('meta-daily.csv')).toBeInTheDocument();
    expect(within(card).getByText(/2026-09-23 – 2026-09-29 · 6\/7 өдөр/)).toBeInTheDocument();
    expect(within(card).queryByText('Reach (хүрсэн хүн)')).not.toBeInTheDocument();
    // 6/7 өдрийн долоо хоногийг бүтэн долоо хоногтой харьцуулахгүй.
    expect(within(card).getByText('Өдөр дутуу тул өмнөх долоо хоногтой харьцуулаагүй.')).toBeInTheDocument();
    expect(within(card).queryByText(/өмнөх —|\(\+\d/)).not.toBeInTheDocument();
    const results = within(card).getByText('Үр дүн төрлөөр').parentElement!;
    const lines = within(results).getAllByRole('listitem').map(item => item.textContent);
    expect(lines).toEqual([
        'Дуудлага (Meta)76Нэг дуудлагын өртөг: 1.86 USD',
        'Постын оролцоо11,604Нэг постын оролцооны өртөг: 0.0037 USD',
        // Хүрсэн хүнийг өдрөөр нэмэхгүй тул тоо, өртөггүй — зардлыг нь харуулна.
        'Хүрсэн хүн (үр дүн)—Зардал: 6.95 USD',
    ]);
    const campaigns = within(card).getByRole('list', { name: 'Их зардалтай кампанит ажил' });
    expect(within(campaigns).getAllByRole('listitem').map(item => item.textContent)).toEqual([
        'Дуудлага76 Дуудлага (Meta) · 141.09 USD',
        'Пост364 Постын харилцаа · 92.01 USD',
        'ХүрэлтХүрсэн хүн (үр дүн) · 0.4 USD',
    ]);
    // Мэдээлэл төдий (info) анхааруулгыг тоолохгүй.
    expect(within(card).getByText('1 анхааруулгатай импорт — импортын хуудсанд шалгана уу.')).toBeInTheDocument();
});

it('labels a report longer than the meeting week and an API-synced report', async () => {
    respond({ report: metaReport({ period_from: '2026-08-30', period_to: '2026-09-28', data_from: '2026-08-30', data_to: '2026-09-28', origin: 'api', file_name: null }), exact: false, longer: true, previous: null, comparison: null });
    show();
    const card = await screen.findByRole('region', { name: 'Meta Ads Manager' });
    expect(within(card).getByText('Meta API')).toBeInTheDocument();
    expect(within(card).getByText(/өөр хугацааны тайлан \(хурлын долоо хоногоос урт\)/)).toBeInTheDocument();
    expect(within(card).queryByText(/өдөр$/)).not.toBeInTheDocument();
});

it('compares per-type results with the previous fully covered week', async () => {
    const report = metaReport({ data_to: '2026-09-29' });
    const previous = { ...report, id: 'm0', period_from: '2026-09-16', period_to: '2026-09-22', data_from: '2026-09-16', data_to: '2026-09-22', totals: { ...report.totals, results_calls: 59 } };
    respond({ report, exact: true, longer: false, previous, comparison: compareWithPrevious(report.totals, previous.totals, 'meta_ads') });
    show();
    const card = await screen.findByRole('region', { name: 'Meta Ads Manager' });
    const calls = within(within(card).getByText('Үр дүн төрлөөр').parentElement!).getAllByRole('listitem')[0];
    expect(calls).toHaveTextContent('Дуудлага (Meta)76Нэг дуудлагын өртөг: 1.86 USD+17 (+28.8%)');
    expect(within(card).queryByText(/Өдөр дутуу/)).not.toBeInTheDocument();
});
