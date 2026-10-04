import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, expect, it, vi } from 'vitest';
import type { DashboardFetchInit } from '@/lib/api/dashboardFetch';
import {
    aggregateByReviewWeeks, aggregateChannelReport, channelSplitWeeks, splitWeekSummary, suggestMapping,
    type ChannelExistingReport, type ChannelMapping, type ChannelPreviewResponse,
} from '@/lib/marketing/channel-reports';
import { META_ADS_EXPORT_HEADERS, metaAdsDailyTable } from '../../../e2e/fixtures/meta-ads-daily';

const mocks = vi.hoisted(() => ({ fetch: vi.fn(), success: vi.fn() }));
vi.mock('@/lib/api/dashboardFetch', () => ({ dashboardFetch: mocks.fetch }));
vi.mock('sonner', () => ({ toast: { success: mocks.success, error: vi.fn() } }));
import { ChannelReportImport } from './ChannelReportImport';
import { ChannelMappingTable } from './ChannelMappingTable';

const headers = ['Campaign name', 'Reach', 'Impressions', 'Amount spent (USD)'];
const rows = [
    { 'Campaign name': 'Mandala', Reach: 1000, Impressions: 3000, 'Amount spent (USD)': 50 },
    { 'Campaign name': 'Elysium', Reach: 800, Impressions: 1600, 'Amount spent (USD)': 20 },
];
function previewFor(mapping: ChannelMapping, origin: ChannelPreviewResponse['mappingOrigin'] = 'suggested'): ChannelPreviewResponse {
    return {
        mode: 'preview', storageReady: true, file: { name: 'meta.csv', size: 120 }, sheets: ['Sheet1'], sheet: 'Sheet1', headerRow: 1, headers,
        sample: { 'Campaign name': ['Mandala', 'Elysium'], Reach: ['1000', '800'], Impressions: ['3000', '1600'], 'Amount spent (USD)': ['50', '20'] },
        mapping, suggested: suggestMapping(headers, 'meta_ads'), mappingOrigin: origin,
        result: aggregateChannelReport(rows, mapping, 'meta_ads'), existing: null, duplicate: null, split: null,
    };
}

/** Хиймэл өдрийн Meta экспорт (3 хурлын долоо хоног) — серверийн урьдчилсан хариутай ижил бүтэцтэй. */
function dailyPreview(existing: Record<string, ChannelExistingReport> = {}): ChannelPreviewResponse {
    const headers = [...META_ADS_EXPORT_HEADERS];
    const daily = metaAdsDailyTable();
    const mapping = suggestMapping(headers, 'meta_ads');
    const period = { from: '2026-09-23', to: '2026-09-29' };
    const result = aggregateChannelReport(daily, mapping, 'meta_ads', { period });
    const weeks = aggregateByReviewWeeks(daily, mapping, 'meta_ads', channelSplitWeeks(result));
    return {
        mode: 'preview', storageReady: true, file: { name: 'meta-daily.csv', size: 9000 }, sheets: ['Sheet1'], sheet: 'Sheet1', headerRow: 1, headers,
        sample: {}, mapping, suggested: mapping, mappingOrigin: 'suggested', result, existing: null, duplicate: null,
        split: {
            period: result.detectedPeriod!, result: aggregateChannelReport(daily, mapping, 'meta_ads', { period: result.detectedPeriod }),
            weeks: weeks.map(({ week, result: weekResult }) => splitWeekSummary(week, weekResult, existing[week.from] ?? null)),
        },
    };
}
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
const sent: FormData[] = [];

beforeEach(() => {
    vi.clearAllMocks();
    sent.length = 0;
    mocks.fetch.mockImplementation(async (_url: string, init: DashboardFetchInit) => {
        const form = init.body as FormData;
        sent.push(form);
        if (form.get('mode') === 'save') return json({ mode: 'save', report: { id: 'r1' }, mappingSaved: true });
        const mapping = form.get('mapping') ? JSON.parse(String(form.get('mapping'))) : suggestMapping(headers, 'meta_ads');
        return json(previewFor(mapping, form.get('mapping') ? 'client' : 'suggested'));
    });
});

it('maps each header to a metric and flags a metric chosen twice', () => {
    const onChange = vi.fn();
    const mapping = { 'Campaign name': 'campaign', Reach: 'reach', Impressions: 'reach', 'Amount spent (USD)': '' };
    render(<ChannelMappingTable source="meta_ads" headers={headers} mapping={mapping} sample={{ Reach: ['1000', '800'] }} onChange={onChange} />);
    expect(screen.getByRole('combobox', { name: '«Reach» баганын үзүүлэлт' })).toHaveValue('reach');
    expect(screen.getByText('1000 · 800')).toBeInTheDocument();
    expect(screen.getAllByText('Энэ үзүүлэлтэд өөр багана ч сонгосон байна.')).toHaveLength(2);
    fireEvent.change(screen.getByRole('combobox', { name: '«Impressions» баганын үзүүлэлт' }), { target: { value: 'impressions' } });
    expect(onChange).toHaveBeenCalledWith({ ...mapping, Impressions: 'impressions' });
});

it('previews, requires recalculation after a mapping change and saves the confirmed mapping for the shop', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { container } = render(<QueryClientProvider client={client}><ChannelReportImport shopId="shop-a" /></QueryClientProvider>);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(['x'], 'meta.csv')] } });
    fireEvent.click(screen.getByRole('button', { name: 'Файл шалгах' }));

    const section = await screen.findByRole('region', { name: 'Импортын урьдчилсан дүн' });
    expect(sent[0].get('mode')).toBe('preview');
    expect(sent[0].get('mapping')).toBeNull();
    expect(mocks.fetch).toHaveBeenCalledWith('/api/marketing/channel-reports', expect.objectContaining({ method: 'POST', shopId: 'shop-a' }));
    // Reach-ийн нийтийг (давхцдаг) тооцохгүй — 0 биш «Тооцоогүй».
    const reachTile = within(section).getByText('Reach (хүрсэн хүн)', { selector: 'dt' }).closest('div')!;
    expect(within(reachTile).getByText('Тооцоогүй')).toBeInTheDocument();
    expect(within(section).getByText(/Reach \(хүрсэн хүн\)»-ийн нийтийг тооцоогүй/)).toBeInTheDocument();

    fireEvent.change(screen.getByRole('combobox', { name: '«Reach» баганын үзүүлэлт' }), { target: { value: '' } });
    expect(screen.getByText(/Дүнг дахин тооцоолсны дараа хадгална/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Хадгалах' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Дахин тооцоолох' }));
    await waitFor(() => expect(sent).toHaveLength(2));
    expect(JSON.parse(String(sent[1].get('mapping')))).toMatchObject({ Reach: '', Impressions: 'impressions' });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Хадгалах' })).toBeEnabled());

    fireEvent.change(screen.getByLabelText('Тэмдэглэл (заавал биш)'), { target: { value: 'Хоёр данс' } });
    fireEvent.click(screen.getByRole('button', { name: 'Хадгалах' }));
    await waitFor(() => expect(mocks.success).toHaveBeenCalled());
    const save = sent[2];
    expect(save.get('mode')).toBe('save');
    expect(save.get('source')).toBe('meta_ads');
    expect(save.get('note')).toBe('Хоёр данс');
    expect(JSON.parse(String(save.get('mapping')))).toMatchObject({ Reach: '', 'Amount spent (USD)': 'spend' });
    expect(save.get('period_from')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(screen.queryByRole('region', { name: 'Импортын урьдчилсан дүн' })).not.toBeInTheDocument();
});

it('shows the server error and keeps nothing saved', async () => {
    mocks.fetch.mockResolvedValueOnce(json({ error: '.xls (Excel 97-2003) формат дэмжигдэхгүй.' }, 400));
    const client = new QueryClient();
    const { container } = render(<QueryClientProvider client={client}><ChannelReportImport shopId="shop-a" /></QueryClientProvider>);
    fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [new File(['x'], 'old.csv')] } });
    fireEvent.click(screen.getByRole('button', { name: 'Файл шалгах' }));
    expect(await screen.findByText(/формат дэмжигдэхгүй/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Хадгалах' })).not.toBeInTheDocument();
});

it('splits a daily Meta export into meeting weeks by default and shows results per type', async () => {
    mocks.fetch.mockImplementation(async (_url: string, init: DashboardFetchInit) => {
        const form = init.body as FormData;
        sent.push(form);
        if (form.get('mode') === 'save') return json({ mode: 'save', reports: [{ id: 'w1' }, { id: 'w2' }, { id: 'w3' }], mappingSaved: true });
        return json(dailyPreview({ '2026-09-16': { id: 'old', file_name: 'old.csv', updated_at: '2026-10-01', origin: 'file', sameFile: false } }));
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { container } = render(<QueryClientProvider client={client}><ChannelReportImport shopId="shop-a" /></QueryClientProvider>);
    fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [new File(['x'], 'meta-daily.csv')] } });
    fireEvent.click(screen.getByRole('button', { name: 'Файл шалгах' }));

    const section = await screen.findByRole('region', { name: 'Импортын урьдчилсан дүн' });
    const toggle = within(section).getByRole('checkbox', { name: 'Хурлын долоо хоногоор хуваах' });
    expect(toggle).toBeChecked();
    const weeks = within(section).getByRole('region', { name: 'Хурлын долоо хоногууд' });
    const rows = within(weeks).getAllByRole('row').slice(1).map(row => row.textContent);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatch(/2026-09-09 – 2026-09-15.*34[.,]8 USD.*6.*5 USD.*4\/7 өдөр.*Шинэ/);
    expect(rows[1]).toMatch(/2026-09-16 – 2026-09-22.*120[.,]1 USD.*18.*4[.,]17 USD.*7\/7 өдөр.*Солигдоно/);
    expect(rows[2]).toMatch(/2026-09-23 – 2026-09-29.*29 USD.*4.*2\/7 өдөр/);
    // Файлын бүх хугацааны нийт дүн, 0 мөрийг тооцсон мөрөнд оруулахгүй.
    expect(within(section).getByText(/Нийт дүн · 2026-09-12 – 2026-09-24 \(файлын бүх хугацаа\)/)).toBeInTheDocument();
    expect(within(section).getByText(/36 мөр тооцсон · 81 хоосон мөр/)).toBeInTheDocument();
    const types = within(section).getByRole('region', { name: 'Үр дүн төрлөөр' });
    expect(within(types).getByRole('row', { name: /Дуудлага \(Meta\)/ })).toHaveTextContent(/28.*125 USD.*4[.,]46 USD/);
    expect(within(types).getByRole('row', { name: /Постын оролцоо/ })).toHaveTextContent(/0[.,]0027 USD/);
    expect(within(types).getByRole('row', { name: /Хүрсэн хүн/ })).toHaveTextContent(/—.*8[.,]4 USD/);
    const breakdown = within(section).getByRole('region', { name: 'Задаргаа: Кампанит ажил' });
    expect(within(breakdown).getByRole('columnheader', { name: 'Үр дүнгийн төрөл' })).toBeInTheDocument();
    expect(within(breakdown).getAllByRole('row')[1]).toHaveTextContent(/Дуудлагын кампанит ажил.*120 USD.*26.*4[.,]62 USD.*Дуудлага \(Meta\)/);
    expect(within(section).queryByText(/гадуурх огноо байна/)).not.toBeInTheDocument();

    fireEvent.click(within(section).getByRole('button', { name: 'Хадгалах' }));
    await waitFor(() => expect(mocks.success).toHaveBeenCalledWith(expect.stringContaining('3 хурлын долоо хоногийн (2026-09-09 – 2026-09-29) тайлан хадгалагдлаа')));
    expect(sent[1].get('mode')).toBe('save');
    expect(sent[1].get('split')).toBe('1');
    expect(sent[1].get('weeks')).toBe('2026-09-09,2026-09-16,2026-09-23');
});

it('leaves a fuller saved week out by default and lets the user replace it', async () => {
    mocks.fetch.mockImplementation(async (_url: string, init: DashboardFetchInit) => {
        const form = init.body as FormData;
        sent.push(form);
        if (form.get('mode') === 'save') return json({ mode: 'save', reports: [{ id: 'w1' }], skipped: [{ from: '2026-09-09', to: '2026-09-15', reason: 'unselected' }], mappingSaved: true });
        // 09-09 долоо хоногийг өмнө нь 7/7-оор хадгалсан; энэ файл түүний 4 өдрийг л хамарна.
        return json(dailyPreview({ '2026-09-09': { id: 'full', file_name: 'week.csv', updated_at: '2026-09-16', origin: 'file', sameFile: false, data_from: '2026-09-09', data_to: '2026-09-15' } }));
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { container } = render(<QueryClientProvider client={client}><ChannelReportImport shopId="shop-a" /></QueryClientProvider>);
    fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [new File(['x'], 'meta-daily.csv')] } });
    fireEvent.click(screen.getByRole('button', { name: 'Файл шалгах' }));
    const section = await screen.findByRole('region', { name: 'Импортын урьдчилсан дүн' });
    const first = within(section).getByRole('checkbox', { name: '2026-09-09 – 2026-09-15 долоо хоногийг хадгалах' });
    expect(first).not.toBeChecked();
    expect(within(section).getByText('Хадгалсан нь илүү бүрэн (7/7 өдөр)')).toBeInTheDocument();
    expect(within(section).getByText(/2\/3 долоо хоногийг хадгална/)).toBeInTheDocument();

    // Бусад долоо хоногийг болиулбал хадгалах долоо хоног алга.
    fireEvent.click(within(section).getByRole('checkbox', { name: '2026-09-16 – 2026-09-22 долоо хоногийг хадгалах' }));
    fireEvent.click(within(section).getByRole('checkbox', { name: '2026-09-23 – 2026-09-29 долоо хоногийг хадгалах' }));
    expect(within(section).getByRole('button', { name: 'Хадгалах' })).toBeDisabled();
    fireEvent.click(first);
    expect(within(section).getByText('Солигдоно (7/7 өдөр)')).toBeInTheDocument();
    fireEvent.click(within(section).getByRole('button', { name: 'Хадгалах' }));
    await waitFor(() => expect(mocks.success).toHaveBeenCalledWith(expect.stringMatching(/1 хурлын долоо хоногийн \(2026-09-09 – 2026-09-15\) тайлан хадгалагдлаа\. 1 долоо хоногийг алгасав\./)));
    expect(sent[1].get('weeks')).toBe('2026-09-09');
});

it('saves only the chosen period when splitting is turned off and never picks weeks synced from the Meta API', async () => {
    let locked = false;
    mocks.fetch.mockImplementation(async (_url: string, init: DashboardFetchInit) => {
        const form = init.body as FormData;
        sent.push(form);
        if (form.get('mode') === 'save') return json(form.get('split') ? { mode: 'save', reports: [{ id: 'w1' }, { id: 'w2' }], skipped: [{ from: '2026-09-23', to: '2026-09-29', reason: 'unselected' }], mappingSaved: true } : { mode: 'save', report: { id: 'r1' }, mappingSaved: true });
        return json(dailyPreview(locked ? { '2026-09-23': { id: 'api', file_name: null, updated_at: '2026-10-01', origin: 'api' } } : {}));
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { container } = render(<QueryClientProvider client={client}><ChannelReportImport shopId="shop-a" /></QueryClientProvider>);
    fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [new File(['x'], 'meta-daily.csv')] } });
    fireEvent.click(screen.getByRole('button', { name: 'Файл шалгах' }));
    const section = await screen.findByRole('region', { name: 'Импортын урьдчилсан дүн' });
    fireEvent.click(within(section).getByRole('checkbox', { name: 'Хурлын долоо хоногоор хуваах' }));
    expect(within(section).queryByRole('region', { name: 'Хурлын долоо хоногууд' })).not.toBeInTheDocument();
    expect(within(section).getByText(/Тайлангийн 7 өдрөөс 2-д л өгөгдөл байна/)).toBeInTheDocument();
    fireEvent.click(within(section).getByRole('button', { name: 'Хадгалах' }));
    await waitFor(() => expect(mocks.success).toHaveBeenCalled());
    expect(sent[1].get('split')).toBeNull();

    locked = true;
    fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [new File(['x'], 'meta-daily.csv')] } });
    fireEvent.click(screen.getByRole('button', { name: 'Файл шалгах' }));
    const again = await screen.findByRole('region', { name: 'Импортын урьдчилсан дүн' });
    expect(within(again).getByText('Meta API — солихгүй')).toBeInTheDocument();
    const apiWeek = within(again).getByRole('checkbox', { name: '2026-09-23 – 2026-09-29 долоо хоногийг хадгалах' });
    expect(apiWeek).not.toBeChecked();
    expect(apiWeek).toBeDisabled();
    // API-ийн долоо хоногийг алгасаад бусдыг нь хадгална.
    fireEvent.click(within(again).getByRole('button', { name: 'Хадгалах' }));
    await waitFor(() => expect(mocks.success).toHaveBeenCalledTimes(2));
    expect(sent[3].get('weeks')).toBe('2026-09-09,2026-09-16');
});
