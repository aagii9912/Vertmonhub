process.env.TZ = 'UTC';
import { describe, expect, it } from 'vitest';
import { connectionDiscussionItems, connectionRows, tokenDaysLeft, type MarketingConnections } from '../connections';
import { weeklyDiscussionItems } from '@/lib/dashboard/weekly-review';

const sync = (patch: Partial<NonNullable<MarketingConnections['page']['sync']>> = {}) => ({
    lastAttemptAt: '2026-10-24T20:30:00Z', lastSuccessAt: '2026-10-24T20:30:00Z', from: '2026-09-25', to: '2026-10-24', error: null, ...patch,
});
const NOW = new Date('2026-10-25T06:00:00Z');
const connected = (ads: Partial<MarketingConnections['ads']> = {}): MarketingConnections => ({
    page: { connected: true, name: 'Elysium Residence', sync: sync() },
    instagram: { connected: true, username: 'elysiumbymoncon', sync: sync() },
    ads: { accountId: 'act_1129994262383674', tokenSource: 'system', tokenDaysLeft: null, tokenExpired: false, insights: sync(), spend: sync(), currency: 'USD', mntPerUnit: 3450, ...ads },
});
const garden: MarketingConnections = {
    page: { connected: false, name: null, sync: null },
    instagram: { connected: false, username: null, sync: null },
    ads: { accountId: null, tokenSource: null, tokenDaysLeft: null, tokenExpired: false, insights: null, spend: null, currency: null, mntPerUnit: null },
};

describe('marketing connection status', () => {
    it('lists every connection in one order; a sync day uses the Ulaanbaatar date even on a UTC server', () => {
        const rows = connectionRows(connected(), NOW);
        expect(rows.map(row => [row.label, row.status, row.tone])).toEqual([
            ['Facebook хуудас', 'Холбогдсон · Elysium Residence', 'ok'],
            ['Instagram', 'Холбогдсон · @elysiumbymoncon', 'ok'],
            ['Meta зарын данс', 'Сонгосон · act_1129994262383674', 'ok'],
            ['Meta токен', 'System User', 'ok'],
            ['Meta зарын синк', 'Ажиллаж байна', 'ok'],
            ['Төгрөгийн ханш', 'Оруулсан', 'ok'],
        ]);
        // 2026-10-24T20:30Z = УБ-ын 10.25.
        expect(rows[0].detail).toBe('Сүүлд 2026.10.25 · өгөгдөл 2026.10.24 хүртэл');
        expect(rows[5].detail).toBe('1 USD = 3,450₮ (тооцооны ханш)');
        expect(connectionDiscussionItems(connected())).toEqual([]);
    });

    it('raises the four marketing discussion items: no account, sync error, token expiring within 14 days, no MNT rate', () => {
        expect(connectionDiscussionItems(garden).map(item => item.title)).toEqual(['Meta зарын данс холбогдоогүй']);
        expect(connectionRows(garden, NOW).map(row => row.status)).toEqual(['Холбогдоогүй', 'Холбогдоогүй', 'Сонгоогүй', 'Алга', '—', '—']);

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
        expect(connectionDiscussionItems(connected({ tokenSource: 'user', tokenDaysLeft: 0 })).map(item => item.title)).toEqual(['Meta токен 24 цагийн дотор дуусна']);
        // Мөр ба хэлэлцэх асуудал ижил бичлэгтэй («0 хоногийн дараа» биш).
        expect(connectionRows(connected({ tokenSource: 'user', tokenDaysLeft: 0 }), NOW)[3]).toMatchObject({ detail: '24 цагийн дотор дуусна', tone: 'warn' });
        expect(connectionDiscussionItems(connected({ currency: 'MNT', mntPerUnit: null }))).toEqual([]);
        // Токен дууссан данс = холбогдоогүй (синк зогсоно).
        const expired = connectionDiscussionItems(connected({ tokenSource: null, tokenExpired: true }));
        expect(expired[0]).toMatchObject({ title: 'Meta зарын данс холбогдоогүй', detail: expect.stringContaining('нэвтрэх эрх дууссан') });
        const stopped = connectionRows(connected({ tokenSource: null, tokenExpired: true }), NOW);
        expect(stopped[3]).toMatchObject({ status: 'Хугацаа дууссан', tone: 'warn' });
        // Токенгүй бол хуучин амжилттай синкээр «Ажиллаж байна» гэхгүй.
        expect(stopped[4]).toMatchObject({ status: 'Ажиллахгүй', tone: 'warn', detail: 'Хүчинтэй токен алга — синк зогссон · Сүүлд 2026.10.25' });
    });

    it('shows how far the stored Meta ad data goes, not the range of the last (backfill) run, and flags a stale sync', () => {
        // Prod 2026-10-25: сүүлийн синк 07.22–09.01-ийг дахин татсан, өгөгдөл 10.25 хүртэл.
        const backfilled = connected({ insights: sync({ lastSuccessAt: '2026-10-25T05:45:00Z', from: '2026-07-22', to: '2026-09-01' }), dataTo: '2026-10-25' });
        const row = connectionRows(backfilled, NOW)[4];
        expect(row).toMatchObject({ status: 'Ажиллаж байна', tone: 'ok', detail: 'Сүүлд 2026.10.25 · өгөгдөл 2026.10.25 хүртэл' });
        expect(row.detail).not.toContain('09.01');
        expect(connectionRows(connected({ dataTo: null }), NOW)[4].detail).toBe('Сүүлд 2026.10.25');
        // 24 цагаас дээш амжилтгүй (cron 6 цаг тутам) — хоцорсон.
        const stale = connectionRows(connected({ insights: sync({ lastSuccessAt: '2026-10-23T20:30:00Z' }), dataTo: '2026-10-23' }), NOW)[4];
        expect(stale).toMatchObject({ status: 'Хоцорсон', tone: 'warn', detail: '24 цагаас дээш синк амжилтгүй · Сүүлд 2026.10.24 · өгөгдөл 2026.10.23 хүртэл' });
    });

    it('does not guess USD or ask for a rate before the account currency is known', () => {
        const unknown = connected({ currency: null, mntPerUnit: null, spend: null });
        expect(connectionRows(unknown, NOW)[5]).toEqual({ key: 'rate', label: 'Төгрөгийн ханш', status: 'Тодорхойгүй', detail: 'Дансны валют тодорхойгүй — Meta зардлын синк хийгдээгүй', tone: 'warn' });
        expect(connectionDiscussionItems(unknown)).toEqual([]);
        expect(JSON.stringify([connectionRows(unknown, NOW), connectionDiscussionItems(unknown)])).not.toContain('USD');
    });

    it('warns about a connected Instagram or Page that is not synced or failing, like the Page row, and puts it on the agenda', () => {
        const fresh = { ...connected(), instagram: { connected: true, username: 'elysiumbymoncon', sync: null } };
        expect(connectionRows(fresh, NOW)[1]).toMatchObject({ status: 'Холбогдсон · @elysiumbymoncon', detail: 'Үзүүлэлтийн синк хийгдээгүй', tone: 'warn' });
        expect(connectionDiscussionItems(fresh).map(item => item.title)).toEqual(['Instagram-ийн үзүүлэлт синк хийгдээгүй']);
        const failing = { ...connected(), page: { connected: true, name: 'Elysium Residence', sync: sync({ error: 'Facebook-ийн эрх дутуу байна (read_insights).' }) } };
        expect(connectionDiscussionItems(failing)).toEqual([expect.objectContaining({ title: 'Facebook хуудасны синк алдаатай: Facebook-ийн эрх дутуу байна (read_insights).', href: '/marketing/social' })]);
        // Холбогдоогүй хуудас, Instagram-ыг (Garden-д байхгүй) хурлын асуудал болгохгүй — зөвхөн холболтын слайдад.
        expect(connectionDiscussionItems({ ...connected(), page: { connected: false, name: null, sync: null }, instagram: { connected: false, username: null, sync: null } })).toEqual([]);
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
