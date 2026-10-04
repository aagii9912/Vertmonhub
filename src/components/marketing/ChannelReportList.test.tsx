import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, expect, it, vi } from 'vitest';
import { compareWithPrevious } from '@/lib/marketing/channel-reports';
import type { ChannelReportMatches, ChannelReportSummary } from '@/lib/marketing/channel-reports-load';

const mocks = vi.hoisted(() => ({ fetch: vi.fn(), confirm: vi.fn() }));
vi.mock('@/lib/api/dashboardFetch', () => ({ dashboardFetch: mocks.fetch }));
vi.mock('@/components/ui/Toast', () => ({ confirmToast: mocks.confirm }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
import { ChannelReportList } from './ChannelReportList';

const summary = (id: string, from: string, to: string, totals: Record<string, number>): ChannelReportSummary => ({
    id, source: 'callpro', period_from: from, period_to: to, file_name: 'callpro.xlsx', totals, row_count: 12, note: null, imported_by: null,
    warnings: [{ code: 'non_additive', level: 'warning', message: 'Хариулах хүртэл алдсан хугацааг тооцоогүй.' }], created_at: '2026-10-01T02:00:00Z', updated_at: '2026-10-01T02:00:00Z',
});
const current = summary('r2', '2026-09-23', '2026-09-29', { answered: 120, missed: 10, abandoned: 4 });
const previous = summary('r1', '2026-09-16', '2026-09-22', { answered: 100, missed: 20, abandoned: 4 });
const empty = { report: null, exact: false, previous: null, comparison: null };
const latest: ChannelReportMatches = {
    meta_ads: empty, facebook_page: empty, sms: empty,
    callpro: {
        report: { ...current, mapping: {}, breakdown: Array.from({ length: 24 }, (_, h) => ({ kind: 'hour' as const, label: `${String(h).padStart(2, '0')}:00`, values: { missed: h === 13 ? 5 : 0, abandoned: 0 } })) },
        exact: false, previous, comparison: compareWithPrevious(current.totals, previous.totals, 'callpro'),
    },
};

beforeEach(() => { vi.clearAllMocks(); mocks.confirm.mockResolvedValue(true); mocks.fetch.mockResolvedValue(new Response('{"success":true}', { status: 200 })); });

it('shows the latest report against the previous week, keeps missing metrics unavailable and deletes after confirmation', async () => {
    const onFilter = vi.fn();
    render(<QueryClientProvider client={new QueryClient()}><ChannelReportList data={{ reports: [current, previous], latest }} filter="all" onFilter={onFilter} canDelete shopId="shop-a" /></QueryClientProvider>);
    const card = screen.getByRole('article', { name: 'CallPro дуудлага сүүлийн тайлан' });
    expect(within(card).getByText('+20% өмнөхөөс')).toBeInTheDocument();
    expect(within(card).getByText('-50% өмнөхөөс')).toBeInTheDocument();
    expect(within(card).getByText('Тооцоогүй')).toBeInTheDocument(); // answer_rate: сонгосон/нийт дуудлагагүй
    expect(within(card).getByRole('img', { name: /Оргил цаг: 13:00 \(5\)/ })).toBeInTheDocument();
    expect(screen.getAllByText('1 анхааруулга')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'CallPro дуудлага' }));
    expect(onFilter).toHaveBeenCalledWith('callpro');

    fireEvent.click(screen.getByRole('button', { name: 'CallPro дуудлага 2026-09-16 – 2026-09-22 тайланг устгах' }));
    await waitFor(() => expect(mocks.fetch).toHaveBeenCalledWith('/api/marketing/channel-reports?id=r1', { method: 'DELETE', shopId: 'shop-a' }));
    expect(mocks.confirm).toHaveBeenCalledWith(expect.objectContaining({ destructive: true }));
});

it('hides delete without permission and does not delete when cancelled', async () => {
    const { rerender } = render(<QueryClientProvider client={new QueryClient()}><ChannelReportList data={{ reports: [current], latest }} filter="all" onFilter={vi.fn()} canDelete={false} shopId="shop-a" /></QueryClientProvider>);
    expect(screen.queryByRole('button', { name: /тайланг устгах/ })).not.toBeInTheDocument();
    mocks.confirm.mockResolvedValue(false);
    rerender(<QueryClientProvider client={new QueryClient()}><ChannelReportList data={{ reports: [current], latest }} filter="all" onFilter={vi.fn()} canDelete shopId="shop-a" /></QueryClientProvider>);
    fireEvent.click(screen.getByRole('button', { name: /тайланг устгах/ }));
    await waitFor(() => expect(mocks.confirm).toHaveBeenCalled());
    expect(mocks.fetch).not.toHaveBeenCalled();
});
