import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    json: vi.fn(),
    mutate: vi.fn(),
    fetch: vi.fn(),
    auth: { shop: { id: 'shop-a' }, user: { id: 'user-a', role: 'marketing' } },
}));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => mocks.auth }));
vi.mock('@/lib/api/dashboardFetch', () => ({ dashboardJson: mocks.json, dashboardMutate: mocks.mutate, dashboardFetch: mocks.fetch }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/components/charts/BarChart', () => ({ BarChart: () => <div data-testid="bar-chart" /> }));

import AdsPage from '@/app/marketing/ads/page';
import CalendarPage from '@/app/marketing/calendar/page';
import BrandPage from '@/app/marketing/brand/page';
import SourcesPage from '@/app/marketing/sources/page';
import CampaignsPage from '@/app/marketing/campaigns/page';
import MessagingPage from '@/app/marketing/messaging/page';
import AnalyticsPage from '@/app/marketing/analytics/page';

function deferred<T>() {
    let resolve!: (v: T) => void;
    let reject!: (e: unknown) => void;
    const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
}

const renderPage = (ui: React.ReactElement) => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return { client, ...render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>) };
};
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const calls = (url: string) => mocks.json.mock.calls.filter(([u]) => u === url).length;

beforeEach(() => {
    mocks.json.mockReset();
    mocks.mutate.mockReset();
    mocks.fetch.mockReset();
});

describe('ads', () => {
    const URL = '/api/marketing/data/ad_campaigns?order=created_at.desc';
    const ad = (id: string, name: string) => ({ id, name, platform: 'facebook', status: 'draft', budget: 0, spend: 10, impressions: 100, clicks: 5, conversions: 1, ctr: 5, cpc: 2 });

    it('loads with a spinner, then rows; create refetches the list', async () => {
        const first = deferred<unknown>();
        mocks.json.mockReturnValueOnce(first.promise);
        renderPage(<AdsPage />);
        expect(screen.getByRole('status')).toBeInTheDocument();
        await act(async () => first.resolve({ rows: [ad('a1', 'Зар нэг')] }));
        expect((await screen.findAllByText('Зар нэг')).length).toBeGreaterThan(0);
        expect(mocks.json).toHaveBeenCalledWith(URL);

        mocks.mutate.mockResolvedValueOnce({ row: ad('a2', 'Зар хоёр') });
        mocks.json.mockResolvedValueOnce({ rows: [ad('a2', 'Зар хоёр'), ad('a1', 'Зар нэг')] });
        fireEvent.click(screen.getByRole('button', { name: /Шинэ зар/ }));
        fireEvent.change(await screen.findByPlaceholderText('Зарын нэр'), { target: { value: 'Зар хоёр' } });
        fireEvent.click(screen.getByRole('button', { name: /Үүсгэх/ }));
        expect((await screen.findAllByText('Зар хоёр')).length).toBeGreaterThan(0);
        expect(mocks.mutate).toHaveBeenCalledWith('/api/marketing/data/ad_campaigns', 'POST', expect.objectContaining({ name: 'Зар хоёр', status: 'draft' }));
        expect(calls(URL)).toBe(2);
    });

    it('keeps loaded rows on screen when a later refresh fails', async () => {
        mocks.json.mockResolvedValueOnce({ rows: [ad('a1', 'Зар нэг')] });
        renderPage(<AdsPage />);
        expect((await screen.findAllByText('Зар нэг')).length).toBeGreaterThan(0);
        mocks.mutate.mockResolvedValueOnce({ row: ad('a2', 'Зар хоёр') });
        mocks.json.mockRejectedValueOnce(new Error('Сүлжээ тасарлаа'));
        fireEvent.click(screen.getByRole('button', { name: /Шинэ зар/ }));
        fireEvent.change(await screen.findByPlaceholderText('Зарын нэр'), { target: { value: 'Зар хоёр' } });
        fireEvent.click(screen.getByRole('button', { name: /Үүсгэх/ }));
        await waitFor(() => expect(calls(URL)).toBe(2));
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
        expect(screen.getAllByText('Зар нэг').length).toBeGreaterThan(0);
    });

    it('shows a failed read as an error with retry, not as the empty state', async () => {
        mocks.json.mockRejectedValueOnce(new Error('Маркетингийн өгөгдөл уншихад алдаа гарлаа'));
        renderPage(<AdsPage />);
        const alert = await screen.findByRole('alert');
        expect(within(alert).getByText('Зар сурталчилгааны мэдээлэл татахад алдаа гарлаа')).toBeInTheDocument();
        expect(within(alert).getByText('Маркетингийн өгөгдөл уншихад алдаа гарлаа')).toBeInTheDocument();
        expect(screen.queryByText('Мэдээлэл байхгүй')).not.toBeInTheDocument();
        expect(screen.queryByText('Нийт зарцуулалт')).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Шинэ зар/ })).toBeInTheDocument();
        mocks.json.mockResolvedValueOnce({ rows: [] });
        fireEvent.click(within(alert).getByRole('button', { name: 'Дахин оролдох' }));
        expect(await screen.findByText('Мэдээлэл байхгүй')).toBeInTheDocument();
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
});

describe('calendar', () => {
    const now = new Date();
    const monthUrl = (offset: number) => {
        const start = ymd(new Date(now.getFullYear(), now.getMonth() + offset, 1));
        const end = ymd(new Date(now.getFullYear(), now.getMonth() + offset + 1, 0));
        return `/api/marketing/data/content_calendar?gte.scheduled_date=${start}&lte.scheduled_date=${end}&order=scheduled_date.asc`;
    };
    const item = (id: string, title: string, date: Date) => ({ id, title, type: 'post', platform: 'facebook', scheduled_date: ymd(date), status: 'planned', color: '#3B82F6' });

    it('keeps the page while the next month loads, surfaces errors under the month nav, and refreshes after create', async () => {
        mocks.json.mockResolvedValueOnce({ rows: [item('c1', 'Пост нэг', new Date(now.getFullYear(), now.getMonth(), 15))] });
        renderPage(<CalendarPage />);
        expect(await screen.findByText('Пост нэг')).toBeInTheDocument();
        expect(mocks.json).toHaveBeenLastCalledWith(monthUrl(0));

        const next = deferred<unknown>();
        mocks.json.mockReturnValueOnce(next.promise);
        fireEvent.click(screen.getByRole('button', { name: 'Дараах сар' }));
        expect(mocks.json).toHaveBeenLastCalledWith(monthUrl(1));
        expect(screen.getByText('Контент календарь')).toBeInTheDocument();
        // Хуудас бүтнээрээ spinner болохгүй — зөвхөн сарын гарчгийн дэргэд жижиг заагч.
        expect(screen.getByRole('status', { name: 'Сарын контент ачаалж байна' })).toBeInTheDocument();
        expect(screen.queryByText('Пост нэг')).not.toBeInTheDocument();
        expect(screen.queryByText('Энэ сард контент төлөвлөгдөөгүй байна')).not.toBeInTheDocument();
        await act(async () => next.resolve({ rows: [] }));
        expect(await screen.findByText('Энэ сард контент төлөвлөгдөөгүй байна')).toBeInTheDocument();

        mocks.json.mockRejectedValueOnce(new Error('Уншихад алдаа гарлаа'));
        fireEvent.click(screen.getByRole('button', { name: 'Дараах сар' }));
        const alert = await screen.findByRole('alert');
        expect(within(alert).getByText('Контент календарь татахад алдаа гарлаа')).toBeInTheDocument();
        expect(screen.queryByText('Энэ сард контент төлөвлөгдөөгүй байна')).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Өмнөх сар' })).toBeInTheDocument();

        // Back to the cached month, then create: the active month is refetched.
        fireEvent.click(screen.getByRole('button', { name: 'Өмнөх сар' }));
        expect(await screen.findByText('Энэ сард контент төлөвлөгдөөгүй байна')).toBeInTheDocument();
        mocks.mutate.mockResolvedValueOnce({ row: {} });
        mocks.json.mockResolvedValue({ rows: [item('c2', 'Шинэ пост', new Date(now.getFullYear(), now.getMonth() + 1, 3))] });
        const before = calls(monthUrl(1));
        fireEvent.click(screen.getByRole('button', { name: /Шинэ контент/ }));
        fireEvent.change(await screen.findByPlaceholderText('Контентын гарчиг'), { target: { value: 'Шинэ пост' } });
        fireEvent.click(screen.getByRole('button', { name: /Үүсгэх/ }));
        expect(await screen.findByText('Шинэ пост')).toBeInTheDocument();
        expect(calls(monthUrl(1))).toBe(before + 1);
    });
});

describe('brand', () => {
    it('renders mentions and surfaces failures with retry', async () => {
        mocks.json.mockRejectedValueOnce(new Error('Хандах эрх алга'));
        renderPage(<BrandPage />);
        const alert = await screen.findByRole('alert');
        expect(within(alert).getByText('Брэндийн дурдагдал татахад алдаа гарлаа')).toBeInTheDocument();
        expect(within(alert).getByText('Хандах эрх алга')).toBeInTheDocument();
        expect(screen.queryByText('Мэдээлэл байхгүй')).not.toBeInTheDocument();
        mocks.json.mockResolvedValueOnce({ rows: [{ id: 'm1', source: 'facebook', platform: 'fb', content: 'Сайхан төсөл', sentiment: 'positive', reach: 1200, author: 'Бат', mentioned_at: '2026-10-01T00:00:00Z' }] });
        fireEvent.click(within(alert).getByRole('button', { name: 'Дахин оролдох' }));
        expect(await screen.findByText('Сайхан төсөл')).toBeInTheDocument();
        expect(mocks.json).toHaveBeenLastCalledWith('/api/marketing/data/brand_mentions?order=mentioned_at.desc&limit=50');
    });
});

describe('sources', () => {
    const CH = '/api/marketing/data/marketing_channels?order=created_at.desc';
    const CO = '/api/marketing/data/channel_contracts?order=end_date.asc';

    it('shows an error when either read fails, retries both, and refetches channels after create', async () => {
        mocks.json.mockImplementation(async (url: string) => {
            if (url === CH) return { rows: [{ id: 'ch1', name: 'Их тойруу билборд', type: 'traditional', status: 'active', description: '', created_at: '2026-10-01' }] };
            throw new Error('Уншихад алдаа гарлаа');
        });
        renderPage(<SourcesPage />);
        const alert = await screen.findByRole('alert');
        expect(within(alert).getByText('Маркетингийн сувгийн мэдээлэл татахад алдаа гарлаа')).toBeInTheDocument();
        expect(screen.queryByText('Нийт суваг')).not.toBeInTheDocument();

        mocks.json.mockImplementation(async (url: string) => url === CH
            ? { rows: [{ id: 'ch1', name: 'Их тойруу билборд', type: 'traditional', status: 'active', description: '', created_at: '2026-10-01' }] }
            : { rows: [] });
        fireEvent.click(within(alert).getByRole('button', { name: 'Дахин оролдох' }));
        expect((await screen.findAllByText('Их тойруу билборд')).length).toBeGreaterThan(0);
        expect(calls(CH)).toBe(2);
        expect(calls(CO)).toBe(2);

        mocks.mutate.mockResolvedValueOnce({ row: {} });
        fireEvent.click(screen.getByRole('button', { name: /Шинэ суваг/ }));
        fireEvent.change(await screen.findByPlaceholderText(/Замын билборд/), { target: { value: 'FM 104.5' } });
        fireEvent.click(screen.getByRole('button', { name: /Үүсгэх/ }));
        await waitFor(() => expect(calls(CH)).toBe(3));
        expect(calls(CO)).toBe(2);
    });
});

describe('campaigns', () => {
    const URL = '/api/marketing/data/marketing_campaigns?order=created_at.desc';
    it('surfaces failures and refetches after create', async () => {
        mocks.json.mockRejectedValueOnce(new Error('Хүсэлт амжилтгүй (500)'));
        renderPage(<CampaignsPage />);
        const alert = await screen.findByRole('alert');
        expect(within(alert).getByText('Кампанит ажлууд татахад алдаа гарлаа')).toBeInTheDocument();
        expect(screen.getByPlaceholderText('Хайх...')).toBeInTheDocument();
        mocks.json.mockResolvedValueOnce({ rows: [] });
        fireEvent.click(within(alert).getByRole('button', { name: 'Дахин оролдох' }));
        await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
        expect(screen.getByText('Нийт кампани')).toBeInTheDocument();

        mocks.mutate.mockResolvedValueOnce({ row: {} });
        mocks.json.mockResolvedValueOnce({ rows: [{ id: 'k1', name: 'Намрын урамшуулал', type: 'social', status: 'draft', budget: 0, spend: 0, start_date: '2026-10-01', end_date: null, metrics: {} }] });
        fireEvent.click(screen.getByRole('button', { name: /Шинэ кампани/ }));
        fireEvent.change(await screen.findByPlaceholderText('Кампанийн нэр'), { target: { value: 'Намрын урамшуулал' } });
        fireEvent.click(screen.getByRole('button', { name: /Үүсгэх/ }));
        expect((await screen.findAllByText('Намрын урамшуулал')).length).toBeGreaterThan(0);
        expect(calls(URL)).toBe(3);
    });
});

describe('messaging', () => {
    const url = (tab: string) => `/api/marketing/data/message_campaigns?eq.type=${tab}&order=created_at.desc`;
    const camp = (id: string, name: string, type: string, recipients: number) => ({ id, type, name, subject: '', status: 'sent', recipients, delivered: Math.max(0, recipients - 34), opened: 1, clicked: 0, sent_at: '2026-10-01' });

    it('keeps the previous tab totals with a table spinner while a new tab loads, then shows it; errors are surfaced', async () => {
        mocks.json.mockResolvedValueOnce({ rows: [camp('e1', 'Имэйл нэг', 'email', 1234)] });
        renderPage(<MessagingPage />);
        expect((await screen.findAllByText('Имэйл нэг')).length).toBeGreaterThan(0);
        expect(screen.getByText((1234).toLocaleString())).toBeInTheDocument();

        const sms = deferred<unknown>();
        mocks.json.mockReturnValueOnce(sms.promise);
        fireEvent.mouseDown(screen.getByRole('tab', { name: /SMS/ }));
        await waitFor(() => expect(mocks.json).toHaveBeenLastCalledWith(url('sms')));
        expect(screen.getByRole('status')).toBeInTheDocument();
        expect(screen.queryByText('Имэйл нэг')).not.toBeInTheDocument();
        expect(screen.getByText((1234).toLocaleString())).toBeInTheDocument();
        await act(async () => sms.resolve({ rows: [camp('s1', 'SMS нэг', 'sms', 50)] }));
        expect((await screen.findAllByText('SMS нэг')).length).toBeGreaterThan(0);
        expect(screen.queryByRole('status')).not.toBeInTheDocument();

        // Create in the SMS tab refetches that tab.
        mocks.mutate.mockResolvedValueOnce({ row: {} });
        mocks.json.mockResolvedValueOnce({ rows: [camp('s2', 'SMS хоёр', 'sms', 0), camp('s1', 'SMS нэг', 'sms', 50)] });
        fireEvent.click(screen.getByRole('button', { name: /Шинэ кампани/ }));
        fireEvent.change(await screen.findByPlaceholderText('Кампанийн нэр'), { target: { value: 'SMS хоёр' } });
        fireEvent.click(screen.getByRole('button', { name: /Үүсгэх/ }));
        expect((await screen.findAllByText('SMS хоёр')).length).toBeGreaterThan(0);
        expect(mocks.mutate).toHaveBeenCalledWith('/api/marketing/data/message_campaigns', 'POST', expect.objectContaining({ type: 'sms' }));

        // Back to cached email tab: immediate, no spinner. Then a failing refetch is surfaced.
        fireEvent.mouseDown(screen.getByRole('tab', { name: /Имэйл/ }));
        expect((await screen.findAllByText('Имэйл нэг')).length).toBeGreaterThan(0);
    });

    it('shows a failed tab read as an error with retry', async () => {
        mocks.json.mockRejectedValueOnce(new Error('Уншихад алдаа гарлаа'));
        renderPage(<MessagingPage />);
        const alert = await screen.findByRole('alert');
        expect(within(alert).getByText('Имэйл кампанит ажлууд татахад алдаа гарлаа')).toBeInTheDocument();
        expect(screen.queryByText('Илгээсэн')).not.toBeInTheDocument();
        expect(screen.getByRole('tab', { name: /SMS/ })).toBeInTheDocument();
        mocks.json.mockResolvedValueOnce({ rows: [] });
        fireEvent.click(within(alert).getByRole('button', { name: 'Дахин оролдох' }));
        expect(await screen.findByText('Имэйл кампанит ажлууд энд харагдана.')).toBeInTheDocument();
    });
});

describe('analytics', () => {
    it('renders aggregates and surfaces failures', async () => {
        mocks.json.mockRejectedValueOnce(new Error('Уншихад алдаа гарлаа'));
        renderPage(<AnalyticsPage />);
        const alert = await screen.findByRole('alert');
        expect(within(alert).getByText('Вэб аналитик татахад алдаа гарлаа')).toBeInTheDocument();
        expect(screen.queryByText('Мэдээлэл байхгүй')).not.toBeInTheDocument();
        mocks.json.mockResolvedValueOnce({ rows: [{ id: 'w1', page: '/elysium', visitors: 40, page_views: 90, bounce_rate: 30, avg_time_seconds: 75, source: 'google', device: 'mobile', location: 'УБ', date: '2026-10-01' }] });
        fireEvent.click(within(alert).getByRole('button', { name: 'Дахин оролдох' }));
        expect(await screen.findByText('/elysium')).toBeInTheDocument();
        expect(screen.getByText('1:15')).toBeInTheDocument();
        expect(mocks.json).toHaveBeenLastCalledWith('/api/marketing/data/web_analytics?order=date.desc&limit=100');
    });
});
