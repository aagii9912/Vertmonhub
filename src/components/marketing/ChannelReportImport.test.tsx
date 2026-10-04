import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, expect, it, vi } from 'vitest';
import type { DashboardFetchInit } from '@/lib/api/dashboardFetch';
import { aggregateChannelReport, suggestMapping, type ChannelMapping, type ChannelPreviewResponse } from '@/lib/marketing/channel-reports';

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
        result: aggregateChannelReport(rows, mapping, 'meta_ads'), existing: null, duplicate: null,
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
