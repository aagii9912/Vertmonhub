// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ActivityFeed, NameMismatchReport } from '@/lib/admin/activity-feed';

const api = vi.hoisted(() => ({ dashboardJson: vi.fn() }));
vi.mock('@/lib/api/dashboardFetch', () => api);
vi.mock('@/contexts/AuthContext', () => ({
    useAuth: () => ({ shop: { id: 'shop-1', name: 'Mandala Garden' }, user: { id: 'admin-user', role: 'super_admin' } }),
}));

import AdminHistoryPage from './page';

const feed = (patch: Partial<ActivityFeed> = {}): ActivityFeed => ({
    from: '2026-09-20', to: '2026-10-19', user: null, truncated: false, unavailable: [],
    users: [{ id: 'ariuna-user', name: 'Ариунаа Батболд', email: 'ariuna@vertmon.mn', role: 'sales_manager', managers: [{ name: 'Б.Ариунаа', active: true }], owner: false, member: true }],
    items: [
        {
            id: 'daily_report:1', at: '2026-10-18T09:00:00.000Z', source: 'daily_report', kind: 'count', by: 'Б. Ариунаа', byUserId: 'ariuna-user',
            summary: 'Төслийн утас · Р. Чанцалдулам: — → 5', detail: null, href: '/dashboard/daily-report?date=2026-10-18', reportDate: '2026-10-18',
        },
        {
            id: 'lead:x1', at: '2026-10-18T08:00:00.000Z', source: 'lead', kind: 'call', by: 'Б.Ариунаа', byUserId: 'ariuna-user',
            summary: 'Залгав · Болд', detail: 'Ярилцав', href: '/dashboard/leads?lead=lead-1',
        },
    ],
    ...patch,
});
const names: NameMismatchReport = {
    unavailable: [],
    unknown: [{ name: 'Ариунаа Батболд', counts: { leads: 3 }, total: 3, similar: ['Б.Ариунаа'] }],
    roster: [{
        name: 'Б.Ариунаа', isActive: true, linked: true, profileName: 'Ариунаа Батболд', email: 'ariuna@vertmon.mn', projects: 0, counts: { leads: 2 },
        flags: { profileDiffers: true, noProject: true, inactiveButLinked: false, sharedAccount: false },
    }],
};

const renderPage = () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(<QueryClientProvider client={client}><AdminHistoryPage /></QueryClientProvider>);
};

beforeEach(() => {
    api.dashboardJson.mockReset();
    api.dashboardJson.mockImplementation(async (url: string) => {
        if (url.startsWith('/api/admin/history/names')) return names;
        if (url.startsWith('/api/admin/history?')) return feed({ user: new URL(url, 'http://x').searchParams.get('user') });
        throw new Error(`Unexpected request: ${url}`);
    });
});
afterEach(cleanup);

describe('/admin/history', () => {
    it('сүүлийн 30 өдрийн түүх, холбоос, нэрийн зөрүүг харуулна', async () => {
        renderPage();
        expect(await screen.findByText('Төслийн утас · Р. Чанцалдулам: — → 5')).toBeTruthy();
        const firstUrl = api.dashboardJson.mock.calls.map(([url]) => url as string).find(url => url.startsWith('/api/admin/history?'))!;
        const params = new URL(firstUrl, 'http://x').searchParams;
        expect(params.get('user')).toBeNull();
        expect(params.get('from')! <= params.get('to')!).toBe(true);
        expect(screen.getByRole('link', { name: 'Өдрийн тайлан' }).getAttribute('href')).toBe('/dashboard/daily-report?date=2026-10-18');
        expect(screen.getByRole('link', { name: 'Лид нээх' }).getAttribute('href')).toBe('/dashboard/leads?lead=lead-1');
        expect(screen.getByText('Тайлангийн өдөр: 2026-10-18')).toBeTruthy();

        expect(await screen.findByText('Нэрийн зөрүү')).toBeTruthy();
        expect(screen.getByRole('link', { name: 'Төлөвлөгөө ба баг' }).getAttribute('href')).toBe('/admin/sales-targets');
        expect(screen.getAllByText('Ариунаа Батболд').length).toBeGreaterThan(0);
        expect(screen.getByText('Төсөлгүй')).toBeTruthy();
        expect(screen.getByText('Профайлын нэр өөр')).toBeTruthy();
    });

    it('хэрэглэгчийн нэр дээр дарахад зөвхөн түүний түүхийг асууна', async () => {
        renderPage();
        const [button] = await screen.findAllByTitle('Зөвхөн энэ хэрэглэгчийн түүх');
        fireEvent.click(button);
        await waitFor(() => expect(api.dashboardJson.mock.calls.some(([url]) => String(url).includes('user=ariuna-user'))).toBe(true));
        expect(await screen.findByRole('button', { name: 'Шүүлтүүр арилгах' })).toBeTruthy();
    });

    it('түүх хүснэгтгүй, таслагдсан үед анхааруулна', async () => {
        api.dashboardJson.mockImplementation(async (url: string) => (url.startsWith('/api/admin/history/names')
            ? names : feed({ unavailable: ['daily_report'], truncated: true, items: [] })));
        renderPage();
        expect(await screen.findByText(/Өдрийн тайлангийн өөрчлөлтийн түүх хараахан идэвхжээгүй/)).toBeTruthy();
        expect(screen.getByText(/Сүүлийн 500 өөрчлөлт харагдаж байна/)).toBeTruthy();
        expect(screen.getByText('Энэ хугацаанд өөрчлөлт алга.')).toBeTruthy();
    });
});
