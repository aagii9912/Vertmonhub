// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { buildMarketingHome, marketingDayLabel, marketingHomeWindow } from '../marketing-home';
import { ContentRangeSchema, type ContentItem } from '../content-plan';
import { ubDateStr } from '@/lib/utils/date';

process.env.TZ = 'UTC';

let seq = 0;
const item = (scheduled_date: string, status: ContentItem['status'] = 'planned', extra: Partial<ContentItem> = {}): ContentItem => ({
    id: `c${++seq}`, title: `Контент ${seq}`, type: 'post', platform: 'facebook', scheduled_date, scheduled_time: null, status,
    description: null, assigned_to: null, color: null, image_paths: [], created_by: null, updated_at: '2026-10-01T00:00:00Z', ...extra,
});

describe('marketingHomeWindow', () => {
    it('reads the month, a 30-day overdue lookback and the next 7 days in one allowed range', () => {
        const window = marketingHomeWindow('2026-10-14');
        expect(window.month).toEqual({ from: '2026-10-01', to: '2026-10-31' });
        expect(window.fetch).toEqual({ from: '2026-09-14', to: '2026-10-31' });
        // Сарын сүүлээр ирэх 7 хоног дараагийн сар руу орно; февраль ба өндөр жил.
        expect(marketingHomeWindow('2026-10-28').fetch).toEqual({ from: '2026-09-28', to: '2026-11-04' });
        expect(marketingHomeWindow('2028-02-10').month.to).toBe('2028-02-29');
        for (const day of ['2026-01-01', '2026-01-31', '2026-03-01', '2026-12-31', '2028-02-29']) {
            expect(ContentRangeSchema.safeParse(marketingHomeWindow(day).fetch).success).toBe(true);
        }
    });

    it('uses the Ulaanbaatar day even when the server runs in UTC', () => {
        // 2026-10-14 16:30 UTC = 2026-10-15 00:30 Улаанбаатар.
        const today = ubDateStr(new Date('2026-10-14T16:30:00Z'));
        expect(today).toBe('2026-10-15');
        expect(marketingHomeWindow(today).upcomingTo).toBe('2026-10-22');
    });
});

describe('buildMarketingHome', () => {
    const today = '2026-10-14';

    it('lists overdue unpublished content, today and the next 7 days without cancelled items', () => {
        const items = [
            item('2026-10-10', 'in_progress', { title: 'Хоцорсон reel', type: 'reel' }),
            item('2026-10-12', 'published'),
            item('2026-10-13', 'cancelled'),
            item('2026-09-10', 'planned', { title: 'Хэт хуучин' }),
            item(today, 'published', { title: 'Өглөөний пост', scheduled_time: '09:00' }),
            item(today, 'planned', { title: 'Оройн story', type: 'story', scheduled_time: '19:00' }),
            item(today, 'cancelled'),
            item('2026-10-16', 'ready'),
            item('2026-10-16', 'cancelled'),
            item('2026-10-21', 'planned'),
            item('2026-10-22', 'planned'),
        ];
        const home = buildMarketingHome(items, today);
        expect(home.overdue.map(row => row.title)).toEqual(['Хоцорсон reel']);
        expect(home.today.map(row => row.title)).toEqual(['Өглөөний пост', 'Оройн story']);
        expect(home.upcoming.map(day => day.day)).toEqual(['2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18', '2026-10-19', '2026-10-20', '2026-10-21']);
        expect(home.upcoming.map(day => day.items.length)).toEqual([0, 1, 0, 0, 0, 0, 1]);
        expect(home.emptyDays).toBe(5);
    });

    it('summarises the month plan by published vs planned, never by leads', () => {
        const items = [
            item('2026-10-01', 'published'), item('2026-10-05', 'published', { type: 'reel' }), item('2026-10-08', 'planned'),
            item('2026-10-20', 'planned', { type: 'reel' }), item('2026-10-21', 'cancelled'), item('2026-11-02', 'planned'),
        ];
        const month = buildMarketingHome(items, today).month;
        expect(month).toMatchObject({ planned: 4, published: 2, overdue: 1, cancelled: 1, pct: 50 });
        expect(month.byType).toEqual([
            { type: 'post', label: 'Пост', planned: 2, published: 1 },
            { type: 'reel', label: 'Reel', planned: 2, published: 1 },
        ]);
        expect(Object.keys(month)).not.toContain('leads');
    });

    it('returns empty sections for a project without a content plan', () => {
        const home = buildMarketingHome([], today);
        expect(home).toMatchObject({ overdue: [], today: [], emptyDays: 7 });
        expect(home.month).toMatchObject({ planned: 0, published: 0, pct: null });
    });
});

it('labels days with the Mongolian weekday', () => {
    expect(marketingDayLabel('2026-10-14')).toBe('Лхагва 10.14');
    expect(marketingDayLabel('2026-10-18')).toBe('Ням 10.18');
});
