import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, expect, it, vi } from 'vitest';
import { aggregateByReviewWeeks, aggregateChannelReport, channelSplitWeeks, compareWithPrevious, suggestMapping } from '@/lib/marketing/channel-reports';
import { compareReports, type ChannelReportMatch, type ChannelReportMatches, type ChannelReportRecord } from '@/lib/marketing/channel-reports-load';
import { META_ADS_EXPORT_HEADERS, metaAdsDailyTable } from '../../../e2e/fixtures/meta-ads-daily';

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
    warnings: [{ code: 'mixed_results', level: 'info', message: 'төрлөөр' }, { code: 'partial_coverage', level: 'info', message: '6/7' }, { code: 'invalid_number', level: 'warning', message: 'тоо биш нүд' }],
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
    // Мэдээлэл төдий (info) анхааруулгыг, тэр дундаа «6/7 өдөр»-ийн partial_coverage-ийг тоолохгүй.
    expect(within(card).getByText('1 анхааруулгатай импорт — импортын хуудсанд шалгана уу.')).toHaveAttribute('title', 'тоо биш нүд');
});

it('labels a report longer than the meeting week and an API-synced report', async () => {
    respond({ report: metaReport({ period_from: '2026-08-30', period_to: '2026-09-28', data_from: '2026-08-30', data_to: '2026-09-28', origin: 'api', file_name: null }), exact: false, longer: true, previous: null, comparison: null });
    show();
    const card = await screen.findByRole('region', { name: 'Meta Ads Manager' });
    expect(within(card).getByText('Meta API')).toBeInTheDocument();
    expect(within(card).getByText(/өөр хугацааны тайлан \(хурлын долоо хоногоос урт\)/)).toBeInTheDocument();
    expect(within(card).queryByText(/өдөр$/)).not.toBeInTheDocument();
    // Синкийн анхааруулга импорт биш — импортын хуудас руу заахгүй.
    expect(within(card).getByText('Meta API синкийн 1 анхааруулга.')).toBeInTheDocument();
    expect(within(card).queryByText(/импорт/)).not.toBeInTheDocument();
});

it('shows a split file week as saved: zero reach without a cost, coverage without a warning line, and a truncated long file name', async () => {
    const rows = metaAdsDailyTable();
    const mapping = suggestMapping([...META_ADS_EXPORT_HEADERS], 'meta_ads');
    const weeks = aggregateByReviewWeeks(rows, mapping, 'meta_ads', channelSplitWeeks(aggregateChannelReport(rows, mapping, 'meta_ads')));
    // Meta-гийн анхдагч экспортын нэр (зайгүй, ~120 тэмдэгт).
    const fileName = 'MN_ProfessionalServices_RealEstate_Ulaanbaatar_Mandala_ElysiumResidence-Campaigns-Aug-30-2026-Sep-28-2026_daily.csv';
    const saved = ({ week, result }: (typeof weeks)[number], id: string): ChannelReportRecord => ({
        ...metaReport(), id, period_from: week.from, period_to: week.to, data_from: result.dataPeriod!.from, data_to: result.dataPeriod!.to,
        file_name: fileName, totals: result.totals, breakdown: result.breakdown, warnings: result.warnings, row_count: result.rowCount,
    });
    const report = saved(weeks[2], 'w3');
    const previous = saved(weeks[1], 'w2');
    expect(report.warnings.find(warning => warning.code === 'partial_coverage')?.level).toBe('info');
    respond({ report, exact: true, longer: false, previous, comparison: compareReports(report, previous) });
    show();
    const card = await screen.findByRole('region', { name: 'Meta Ads Manager' });
    expect(within(card).getByText(/2026-09-23 – 2026-09-29 · 2\/7 өдөр/)).toBeInTheDocument();
    expect(within(card).getByText('Өдөр дутуу тул өмнөх долоо хоногтой харьцуулаагүй.')).toBeInTheDocument();
    // Хамралтыг дээр харуулсан тул «анхааруулгатай импорт» мөр нэмэхгүй.
    expect(within(card).queryByText(/анхааруулга/)).not.toBeInTheDocument();
    const reach = within(within(card).getByText('Үр дүн төрлөөр').parentElement!).getAllByRole('listitem').find(item => item.textContent?.startsWith('Хүрсэн хүн'));
    // Энэ долоо хоногт хүрсэн хүний кампанит ажил хүргэлтгүй: 0 хүн (яг тоо), «—» биш.
    expect(reach).toHaveTextContent(/^Хүрсэн хүн \(үр дүн\)0Зардал: 0 USD$/);
    expect(within(reach!).queryByTitle('Хүрсэн хүнийг өдөр, кампанит ажлаар нэмэхгүй')).not.toBeInTheDocument();
    const badge = within(card).getByText(fileName);
    expect(badge).toHaveClass('min-w-0', 'max-w-full', 'truncate');
    expect(badge).toHaveAttribute('title', `Экспорт файл: ${fileName}`);
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
