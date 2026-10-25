process.env.TZ = 'UTC';
import { describe, expect, it } from 'vitest';
import { connectionDiscussionItems, connectionRows, tokenDaysLeft, type MarketingConnections } from '../connections';
import { weeklyDiscussionItems } from '@/lib/dashboard/weekly-review';

const sync = (patch: Partial<NonNullable<MarketingConnections['page']['sync']>> = {}) => ({
    lastAttemptAt: '2026-10-24T20:30:00Z', lastSuccessAt: '2026-10-24T20:30:00Z', from: '2026-09-25', to: '2026-10-24', error: null, ...patch,
});
const connected = (ads: Partial<MarketingConnections['ads']> = {}): MarketingConnections => ({
    page: { connected: true, name: 'Elysium Residence', sync: sync() },
    instagram: { connected: true, username: 'elysiumbymoncon', sync: null },
    ads: { accountId: 'act_1129994262383674', tokenSource: 'system', tokenDaysLeft: null, tokenExpired: false, insights: sync(), spend: sync(), currency: 'USD', mntPerUnit: 3450, ...ads },
});
const garden: MarketingConnections = {
    page: { connected: false, name: null, sync: null },
    instagram: { connected: false, username: null, sync: null },
    ads: { accountId: null, tokenSource: null, tokenDaysLeft: null, tokenExpired: false, insights: null, spend: null, currency: null, mntPerUnit: null },
};

describe('marketing connection status', () => {
    it('lists every connection in one order; a sync day uses the Ulaanbaatar date even on a UTC server', () => {
        const rows = connectionRows(connected());
        expect(rows.map(row => [row.label, row.status, row.tone])).toEqual([
            ['Facebook хуудас', 'Холбогдсон · Elysium Residence', 'ok'],
            ['Instagram', 'Холбогдсон · @elysiumbymoncon', 'ok'],
            ['Meta зарын данс', 'Сонгосон · act_1129994262383674', 'ok'],
            ['Meta токен', 'System User', 'ok'],
            ['Meta зарын синк', 'Ажиллаж байна', 'ok'],
            ['Төгрөгийн ханш', 'Оруулсан', 'ok'],
        ]);
        // 2026-10-24T20:30Z = УБ-ын 10.25.
        expect(rows[0].detail).toBe('Сүүлд 2026.10.25 · 2026.10.24 хүртэл');
        expect(rows[5].detail).toBe('1 USD = 3,450₮ (тооцооны ханш)');
        expect(connectionDiscussionItems(connected())).toEqual([]);
    });

    it('raises the four marketing discussion items: no account, sync error, token expiring within 14 days, no MNT rate', () => {
        expect(connectionDiscussionItems(garden).map(item => item.title)).toEqual(['Meta зарын данс холбогдоогүй']);
        expect(connectionRows(garden).map(row => row.status)).toEqual(['Холбогдоогүй', 'Холбогдоогүй', 'Сонгоогүй', 'Алга', '—', '—']);

        const failing = connected({ tokenSource: 'user', tokenDaysLeft: 9, insights: sync({ error: 'Meta-гийн хандах эрх хүрэлцэхгүй (#200). Зарын данс System User-т оноогдоогүй байж магадгүй.' }), mntPerUnit: null });
        const titles = connectionDiscussionItems(failing).map(item => item.title);
        expect(titles).toEqual([
            expect.stringMatching(/^Meta синк алдаатай: Meta-гийн хандах эрх хүрэлцэхгүй \(#200\)\. Зарын данс System User-т оноогдоогүй…$/),
            'Meta токен 9 хоногт дуусна',
            'Төгрөгийн ханш оруулаагүй',
        ]);
        expect(titles[0].length).toBeLessThanOrEqual('Meta синк алдаатай: '.length + 80);
        // 14 хоногоос урт, System User эсвэл MNT данс бол асуудал биш.
        expect(connectionDiscussionItems(connected({ tokenSource: 'user', tokenDaysLeft: 15 }))).toEqual([]);
        expect(connectionDiscussionItems(connected({ tokenSource: 'user', tokenDaysLeft: 0 })).map(item => item.title)).toEqual(['Meta токен өнөөдөр дуусна']);
        expect(connectionDiscussionItems(connected({ currency: 'MNT', mntPerUnit: null }))).toEqual([]);
        // Токен дууссан данс = холбогдоогүй (синк зогсоно).
        const expired = connectionDiscussionItems(connected({ tokenSource: null, tokenExpired: true }));
        expect(expired[0]).toMatchObject({ title: 'Meta зарын данс холбогдоогүй', detail: expect.stringContaining('нэвтрэх эрх дууссан') });
        expect(connectionRows(connected({ tokenSource: null, tokenExpired: true }))[3]).toMatchObject({ status: 'Хугацаа дууссан', tone: 'warn' });
    });

    it('adds the connection items to the marketing part of the meeting only', () => {
        const items = weeklyDiscussionItems({ connections: connected({ tokenSource: 'user', tokenDaysLeft: 3, mntPerUnit: null }) });
        expect(items.map(item => [item.title, item.part])).toEqual([['Meta токен 3 хоногт дуусна', 'marketing'], ['Төгрөгийн ханш оруулаагүй', 'marketing']]);
        expect(weeklyDiscussionItems({ connections: null })).toEqual([]);
    });

    it('counts whole days left on a user token', () => {
        const now = new Date('2026-10-25T06:00:00Z');
        expect(tokenDaysLeft('2026-11-04T10:00:00Z', now)).toBe(10);
        expect(tokenDaysLeft('2026-10-25T20:00:00Z', now)).toBe(0);
        expect(tokenDaysLeft(null, now)).toBeNull();
        expect(tokenDaysLeft('not a date', now)).toBeNull();
    });
});
