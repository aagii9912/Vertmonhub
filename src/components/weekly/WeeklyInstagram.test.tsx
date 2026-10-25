import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, expect, it, vi } from 'vitest';
import { summarizeInstagramWeek, type InstagramWeek, type SocialDailyRow, type SocialWeek } from '@/lib/marketing/social-week';

const mocks = vi.hoisted(() => ({ json: vi.fn() }));
vi.mock('@/lib/api/dashboardFetch', () => ({ dashboardJson: mocks.json }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ shop: { id: 'shop-1' }, user: { id: 'user-1' } }) }));
import { WeeklyInstagram } from './WeeklyInstagram';
import { WeeklySocialPage } from './WeeklySocialPage';

const range = { from: '2026-10-07', to: '2026-10-13' };
const previousRange = { from: '2026-09-30', to: '2026-10-06' };
const days = (from: string, n: number) => Array.from({ length: n }, (_, i) => new Date(Date.parse(`${from}T00:00:00Z`) + i * 86_400_000).toISOString().slice(0, 10));
const page: SocialWeek = { page: null, range, previousRange, syncedTo: null, rangeDays: 7, metrics: [], posts: [] };

function instagram(overrides: Partial<InstagramWeek> = {}): InstagramWeek {
    const rows: SocialDailyRow[] = [
        // Хурлын өглөө Meta-гийн Мягмар дуусаагүй: 6 өдөр.
        ...days(range.from, 6).flatMap(day => [{ day, metric: 'views', value: 1000 }, { day, metric: 'reach', value: 700 }]),
        ...days(previousRange.from, 7).map(day => ({ day, metric: 'views', value: 800 })),
        { day: '2026-10-12', metric: 'followers_count', value: 812 },
    ];
    return {
        account: { id: '17841475771440904', username: 'elysiumbymoncon' }, range, previousRange, syncedTo: '2026-10-12', rangeDays: 7,
        metrics: summarizeInstagramWeek(rows, range, previousRange),
        posts: [{ id: '1791', content: 'Reel  24 давхар', publishedAt: '2026-10-09T03:00:00Z', views: 15400, reach: 9800, likes: 310, comments: 12, shares: 41, saved: 66, asOf: '2026-10-13' }],
        ...overrides,
    };
}
const show = (node: React.ReactNode) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{node}</QueryClientProvider>);

beforeEach(() => vi.clearAllMocks());

it('shows the Instagram week with partial-week comparison, the follower snapshot and the top media with its own reach', async () => {
    mocks.json.mockResolvedValue({ week: page, instagram: instagram(), instagramError: null });
    show(<WeeklyInstagram meetingDate="2026-10-14" />);
    const card = await screen.findByRole('region', { name: 'Instagram' });
    expect(within(card).getByText('@elysiumbymoncon')).toBeInTheDocument();
    expect(within(card).getByText(/6\/7 өдрийн өгөгдөл · синк 2026-10-12 хүртэл/)).toBeInTheDocument();
    const views = within(card).getByText('Үзэлт').parentElement!;
    expect(views.textContent).toBe('Үзэлт6,0006/7 өдөр · өмнөх 7 хоногийн мөн өдрүүд 4,800+1,200 (+25%)');
    expect(within(card).getByText('Дагагч').parentElement!.textContent).toContain('812');
    expect(within(card).getByText('Хадгалсан').parentElement!.textContent).toBe('Хадгалсан—Meta өгөөгүй');
    // Өдрийн давхардалгүй хүрэлтийг долоо хоногт нэмэхгүй — картад байхгүй (4,200 = 6 × 700).
    expect(within(card).queryByText('Хүрсэн хүн')).not.toBeInTheDocument();
    expect(card.textContent).not.toContain('4,200');
    expect(within(card).getByText('Энэ долоо хоногт нийтэлсэн пост: 1')).toBeInTheDocument();
    expect(within(card).getByText('Reel 24 давхар')).toBeInTheDocument();
    expect(within(card).getByText('үзэлт 15,400 · хүрсэн 9,800 · like 310 · сэтгэгдэл 12')).toBeInTheDocument();
    // Facebook хуудасны карттай нэг хүсэлт.
    show(<WeeklySocialPage meetingDate="2026-10-14" />);
    expect(await screen.findByText(/Facebook хуудас холбогдоогүй/)).toBeInTheDocument();
    expect(mocks.json).toHaveBeenCalledWith('/api/dashboard/marketing/social-week?meetingDate=2026-10-14', expect.objectContaining({ shopId: 'shop-1' }));
});

it('says when Instagram is not connected, has no stored days, or could not be read', async () => {
    mocks.json.mockResolvedValue({ week: page, instagram: instagram({ account: null }), instagramError: null });
    const { unmount } = show(<WeeklyInstagram meetingDate="2026-10-14" />);
    expect(await screen.findByText(/Instagram холбогдоогүй/)).toBeInTheDocument();
    unmount();

    mocks.json.mockResolvedValue({ week: page, instagram: instagram({ metrics: summarizeInstagramWeek([], range, previousRange), posts: [], syncedTo: null }), instagramError: null });
    const second = show(<WeeklyInstagram meetingDate="2026-10-21" />);
    expect(await screen.findByText(/Энэ долоо хоногийн Instagram үзүүлэлт хадгалагдаагүй байна/)).toBeInTheDocument();
    expect(screen.getByText(/синк хийгдээгүй/)).toBeInTheDocument();
    expect(screen.queryByText('0')).not.toBeInTheDocument();
    second.unmount();

    mocks.json.mockResolvedValue({ week: page, instagram: null, instagramError: 'Instagram-ийн үзүүлэлтийг уншиж чадсангүй. Шинэчилж дахин оролдоно уу.' });
    show(<WeeklyInstagram meetingDate="2026-10-28" />);
    expect(await screen.findByText('Instagram: Instagram-ийн үзүүлэлтийг уншиж чадсангүй. Шинэчилж дахин оролдоно уу.')).toBeInTheDocument();
});
