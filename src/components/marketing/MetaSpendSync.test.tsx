import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, expect, it, vi } from 'vitest';
import { META_ADS_OAUTH_NOTICES } from '@/lib/marketing/meta-ads-oauth-result';

const mocks = vi.hoisted(() => ({
    json: vi.fn(),
    toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));
vi.mock('@/lib/api/dashboardFetch', () => ({ dashboardJson: mocks.json }));
vi.mock('sonner', () => ({ toast: mocks.toast }));
import { MetaSpendSync } from './MetaSpendSync';

const connected = { accountId: 'act_1403588647619417', status: null, connected: true, tokenSource: 'user', expiresAt: '2026-12-24T04:00:00.000Z', insights: null, insightsReady: true };
function renderSync(props: Partial<React.ComponentProps<typeof MetaSpendSync>> = {}) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(<QueryClientProvider client={client}><MetaSpendSync shopId="shop-1" canWrite from="2026-10-01" to="2026-10-25" {...props} /></QueryClientProvider>);
}
/** Төлөв уншигдаж товч идэвхжсэний дараа дарна. */
async function pull() {
    const button = await screen.findByRole('button', { name: 'Meta зардал татах' });
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);
    await waitFor(() => expect(mocks.toast.success).toHaveBeenCalled());
}
const posted = () => JSON.parse(mocks.json.mock.calls.find(([, init]) => init?.method === 'POST')![1].body);

beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState(null, '', '/marketing?tab=records');
    mocks.json.mockImplementation(async (_url: string, init?: { method?: string }) => init?.method === 'POST' ? { rows: 3, needsRate: false } : connected);
});

it('pulls a range of up to 93 days as selected, without a notice', async () => {
    renderSync();
    await pull();
    expect(posted()).toEqual({ from: '2026-10-01', to: '2026-10-25' });
    expect(screen.queryByText(/өдрөөс урт тул/)).not.toBeInTheDocument();
});

it('limits a longer range to its last 93 days and says so instead of failing with a 400', async () => {
    renderSync({ from: '2026-01-01', to: '2026-10-25' });
    expect(await screen.findByText('Сонгосон хугацаа 93 өдрөөс урт тул «Meta зардал татах» нь сүүлийн 93 өдрийг (2026-07-25 – 2026-10-25) татна. Өмнөх хэсгийг тусад нь сонгож татна уу.')).toBeInTheDocument();
    await pull();
    expect(posted()).toEqual({ from: '2026-07-25', to: '2026-10-25' });
});

it('starts the OAuth connection with a full page navigation (plain anchor, not next/link)', async () => {
    renderSync();
    const link = await screen.findByRole('link', { name: 'Meta Ads дахин холбох' });
    expect(link.tagName).toBe('A');
    expect(link).toHaveAttribute('href', '/api/marketing/facebook/ads/connect?shop_id=shop-1');
});

it.each(['state_error', 'token_error', 'ads_read_error', 'connection_error'] as const)('shows the specific message for %s and removes only the result from the URL', async result => {
    window.history.replaceState(null, '', `/marketing?tab=records&meta_ads=${result}`);
    renderSync();
    expect(await screen.findByText(META_ADS_OAUTH_NOTICES[result].message)).toBeInTheDocument();
    expect(window.location.search).toBe('?tab=records');
    expect(mocks.toast.success).not.toHaveBeenCalled();
});

it('tells the user to retry from the button after a state error and where the details of a token error are', () => {
    expect(META_ADS_OAUTH_NOTICES.state_error.message).toContain('«Meta Ads холбох» товчоос дахин');
    expect(META_ADS_OAUTH_NOTICES.token_error.message).toMatch(/дахин эхлүүлнэ үү.*серверийн логт/);
});

it('confirms a connection with a toast and falls back to a general message for an unknown code', async () => {
    window.history.replaceState(null, '', '/marketing?tab=records&meta_ads=connected');
    const { unmount } = renderSync();
    await waitFor(() => expect(mocks.toast.success).toHaveBeenCalledWith('Meta Ads холбогдлоо.'));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    unmount();

    window.history.replaceState(null, '', '/marketing?tab=records&meta_ads=something_new');
    renderSync();
    expect(await screen.findByText(/Meta Ads холболт амжилтгүй боллоо/)).toBeInTheDocument();
});
