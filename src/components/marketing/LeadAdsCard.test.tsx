import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import type { LeadAdsStatus } from './LeadAdsCard';

const mocks = vi.hoisted(() => ({
    query: { data: undefined as unknown, isError: false, error: null as Error | null, refetch: vi.fn() },
    mutate: vi.fn(),
    toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));
vi.mock('@/hooks/useDashboardQuery', () => ({ useDashboardQuery: () => mocks.query }));
vi.mock('@/lib/api/dashboardFetch', () => ({ dashboardMutate: mocks.mutate }));
vi.mock('sonner', () => ({ toast: mocks.toast }));
import { LeadAdsCard } from './LeadAdsCard';

const status = (over: Partial<LeadAdsStatus> = {}): LeadAdsStatus => ({
    connected: true, pageName: 'Mandala', subscribed: true, eventsAvailable: true,
    counts: { saved: 4, skipped: 1, failed: 0 }, lastSavedAt: '2026-10-04T02:00:00Z',
    problems: [{ leadgen_id: '9002', status: 'skipped', reason: 'permission_missing', origin: 'webhook', updated_at: '2026-10-04T01:00:00Z' }],
    ...over,
});

beforeEach(() => {
    vi.clearAllMocks();
    mocks.query.data = status();
    mocks.query.isError = false;
});

it('shows the 90-day outcome and explains skipped events in Mongolian', () => {
    render(<LeadAdsCard canWrite />);
    expect(screen.getByText('Webhook идэвхтэй')).toBeInTheDocument();
    expect(screen.getByText(/4 хадгалсан · 1 алгассан · 0 түр алдаатай/)).toBeInTheDocument();
    expect(screen.getByText('leads_retrieval / pages_manage_ads эрх дутуу — дахин холбоно уу')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Lead Ads идэвхжүүлэх' })).not.toBeInTheDocument();
});

it('backfills on demand and reports an incomplete run', async () => {
    mocks.mutate.mockResolvedValue({ forms: 2, received: 5, ingested: 3, duplicate: 1, skipped: 1, failed: 0, complete: false, error: 'time_budget' });
    render(<LeadAdsCard canWrite />);
    fireEvent.click(screen.getByRole('button', { name: 'Сүүлийн 90 хоногийн лид татах' }));
    await waitFor(() => expect(mocks.toast.warning).toHaveBeenCalled());
    expect(mocks.mutate).toHaveBeenCalledWith('/api/marketing/facebook/lead-ads', 'POST', { action: 'backfill' });
    expect(mocks.toast.warning.mock.calls[0][0]).toContain('3 шинэ');
    expect(mocks.toast.warning.mock.calls[0][0]).toContain('Хугацаа хүрэлцээгүй');
    expect(mocks.query.refetch).toHaveBeenCalled();
});

it('offers re-subscribing when the leadgen webhook is off and hides actions for read-only users', async () => {
    mocks.query.data = status({ subscribed: false });
    mocks.mutate.mockResolvedValue({ success: true, leadgen: false, leadgenError: 'leads_retrieval needed' });
    const { rerender } = render(<LeadAdsCard canWrite />);
    expect(screen.getByText('Webhook идэвхгүй')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Lead Ads идэвхжүүлэх' }));
    await waitFor(() => expect(mocks.toast.error).toHaveBeenCalledWith(expect.stringContaining('leads_retrieval needed')));

    rerender(<LeadAdsCard canWrite={false} />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
});

it('renders nothing for an unconnected page', () => {
    mocks.query.data = { connected: false };
    const { container } = render(<LeadAdsCard canWrite />);
    expect(container).toBeEmptyDOMElement();
});
