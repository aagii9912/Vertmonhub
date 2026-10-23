import { describe, expect, it } from 'vitest';
import type { PricingConfig } from '@/lib/sales/pricing';
import { buildNegotiations, latestInterestViewings, negotiationSum, type NegotiationsInput } from '../negotiations';

const U171 = '11111111-1111-4111-8111-111111111171';
const pricing: PricingConfig = {
    id: 'cfg', shop_id: 's', version: 2, status: 'active', source: 'Үнийн жагсаалт 2026-10',
    valid_from: '2026-10-01', valid_until: '2026-12-31', inventory_area_confirmed: true,
    rules: [
        { block: 'Б2', model: 'A', floor_min: 1, floor_max: 23, payment_condition: '10-30%', price_per_sqm: 7_600_000, advance_percent: 10 },
        { block: 'Б1', model: 'E3', floor_min: 1, floor_max: 23, payment_condition: '50%', price_per_sqm: 6_300_000, advance_percent: null },
    ],
};
const interest = (block: string, model: string, area_sqm: number, floor: number | null, payment_condition: string | null, unit_id: string | null = null) =>
    [{ block, model, area_sqm, floor, unit_id, payment_condition, quote: null, quote_unavailable_reason: 'Баталсан үнийн тохиргоо байхгүй', unit_label: null }];
const input = (overrides: Partial<NegotiationsInput> = {}): NegotiationsInput => ({
    today: '2026-10-23',
    leads: [
        { id: 'L1', status: 'negotiating', sales_manager_name: 'Khongoroo' },
        { id: 'L2', status: 'offered', sales_manager_name: null },
        { id: 'L3', status: 'negotiating', sales_manager_name: 'Ариунбилэг' },
        { id: 'L4', status: 'negotiating', sales_manager_name: 'Чанцалдулам.Раднаа' },
        { id: 'L5', status: 'contacted', sales_manager_name: 'Khongoroo' },
    ],
    liveContractLeadIds: new Set(['L3']),
    viewings: [
        { id: 'v-old', lead_id: 'L1', scheduled_at: '2026-10-05T03:00:00Z', status: 'completed', sales_manager_name: 'Khongoroo', interests: interest('Б1', 'E5', 79.91, null, '30%') },
        { id: 'v-new', lead_id: 'L1', scheduled_at: '2026-10-15T03:00:00Z', status: 'completed', sales_manager_name: 'Khongoroo', interests: interest('Б2', 'A', 57.87, 12, '10-30%', U171) },
        // Хамгийн сүүлийн уулзалт сонирхолгүй — өмнөхөөс нь авна.
        { id: 'v-latest', lead_id: 'L1', scheduled_at: '2026-10-18T03:00:00Z', status: 'completed', sales_manager_name: 'Khongoroo', interests: [] },
        // Болоогүй уулзалтын сонголт болсон уулзалтыг дарахгүй: ирэх товлол, цуцалсан, ирээгүй.
        { id: 'v-booked', lead_id: 'L2', scheduled_at: '2026-11-10T03:00:00Z', status: 'scheduled', sales_manager_name: 'Ариунбилэг', interests: interest('Б2', 'A', 57.87, 12, '10-30%') },
        { id: 'v-cancel', lead_id: 'L2', scheduled_at: '2026-10-20T03:00:00Z', status: 'cancelled', sales_manager_name: 'Ариунбилэг', interests: interest('Б2', 'A', 57.87, 3, '10-30%') },
        { id: 'v-noshow', lead_id: 'L4', scheduled_at: '2026-10-19T03:00:00Z', status: 'no_show', sales_manager_name: 'Чанцалдулам.Раднаа', interests: interest('Б2', 'A', 57.87, 5, '10-30%') },
        { id: 'v-l2', lead_id: 'L2', scheduled_at: '2026-10-17T16:30:00Z', status: 'completed', sales_manager_name: 'Ариунбилэг', interests: interest('Б1', 'E3', 85.19, 21, '50%') },
        { id: 'v-l3', lead_id: 'L3', scheduled_at: '2026-10-16T03:00:00Z', status: 'completed', sales_manager_name: 'Ариунбилэг', interests: interest('Б2', 'A', 57.87, 3, '10-30%') },
    ],
    units: [
        { id: U171, block: 'Б2', model: 'A', rooms: 2 },
        { id: 'u-e3', block: 'Б1', model: 'E3', rooms: '3' },
    ],
    pricing,
    referrals: { available: true, byViewing: new Map([['v-new', 'Facebook'], ['v-l2', null]]) },
    ...overrides,
});

describe('latestInterestViewings', () => {
    it('picks each lead\'s most recent held meeting that has an interest', () => {
        const latest = latestInterestViewings(input().viewings, '2026-10-23');
        expect(latest.get('L1')?.viewing.id).toBe('v-new');
        expect(latest.get('L1')?.interest).toEqual({ block: 'Б2', model: 'A', area_sqm: 57.87, floor: 12, unit_id: U171, payment_condition: '10-30%' });
        expect(latest.get('L2')?.viewing.id).toBe('v-l2');
        expect(latest.has('L4')).toBe(false);
    });

    it('never takes the interest of a booked, cancelled or no-show meeting, nor a completed one dated after today', () => {
        const latest = latestInterestViewings(input().viewings, '2026-10-23');
        expect([...latest.values()].map(entry => entry.viewing.id).sort()).toEqual(['v-l2', 'v-l3', 'v-new']);
        // Ирээдүйн огноотой «болсон» уулзалт (алдаатай бүртгэл) ч өнөөдрөөс хойш тул тооцохгүй.
        const future = latestInterestViewings([{ id: 'f', lead_id: 'L9', scheduled_at: '2026-11-10T03:00:00Z', status: 'completed', sales_manager_name: null, interests: interest('Б2', 'A', 57.87, 12, '10-30%') }], '2026-10-23');
        expect(future.size).toBe(0);
    });
});

describe('buildNegotiations', () => {
    it('lists negotiating and offered leads without a live contract at today\'s approved prices', () => {
        const report = buildNegotiations(input());
        expect(report.rows).toEqual([
            {
                leadId: 'L2', status: 'offered', manager: 'Ариунбилэг', block: 'Б1', rooms: 3, floor: 21, area: 85.19, condition: '50%',
                pricePerSqm: 6_300_000, total: 536_697_000, advance: null, conditionNote: null, referral: null,
                // 2026-10-17T16:30Z = УБ 10-18.
                viewedAt: '2026-10-18', priceReason: 'Эхний урьдчилгааны хувь батлагдаагүй',
            },
            {
                leadId: 'L1', status: 'negotiating', manager: 'Khongoroo', block: 'Б2', rooms: 2, floor: 12, area: 57.87, condition: '10-30%',
                pricePerSqm: 7_600_000, total: 439_812_000, advance: 43_981_200, conditionNote: null, referral: 'Facebook',
                viewedAt: '2026-10-15', priceReason: null,
            },
            {
                leadId: 'L4', status: 'negotiating', manager: 'Чанцалдулам.Раднаа', block: null, rooms: null, floor: null, area: null, condition: null,
                pricePerSqm: null, total: null, advance: null, conditionNote: null, referral: null, viewedAt: null, priceReason: 'Болсон уулзалтад сонирхсон байр бүртгэгдээгүй',
            },
        ]);
        expect(report.totals).toEqual({
            count: 3,
            area: { sum: null, known: 143.06, partial: true },
            total: { sum: null, known: 976_509_000, partial: true },
            advance: { sum: null, known: 43_981_200, partial: true },
        });
        expect(report.pricing).toEqual({ version: 2, source: 'Үнийн жагсаалт 2026-10' });
        expect(report.notes).toEqual([
            'Үнийг өнөөдрийн (2026-10-23) баталсан үнийн тохиргоогоор (v2) тооцов.',
            '1 лидийн болсон уулзалтад сонирхсон байр бүртгэгдээгүй.',
            '1 лид амьд гэрээтэй тул жагсаалтад ороогүй.',
        ]);
    });

    it('leaves prices unknown without an active price list, or outside its validity, and says why', () => {
        const none = buildNegotiations(input({ pricing: null }));
        expect(none.rows.every(row => row.pricePerSqm === null && row.total === null && row.advance === null)).toBe(true);
        expect(none.rows[0].priceReason).toBe('Баталсан үнийн тохиргоо байхгүй');
        expect(none.pricing).toBeNull();
        expect(none.notes[0]).toContain('идэвхтэй) үнийн тохиргоо алга');

        const expired = buildNegotiations(input({ today: '2027-01-05' }));
        expect(expired.rows[0]).toMatchObject({ total: null, priceReason: 'Үнийн хүчинтэй хугацаанд багтахгүй байна' });
        expect(expired.notes).toContain('Үнэ тооцоогүй (2): Үнийн хүчинтэй хугацаанд багтахгүй байна.');
        expect(expired.totals.total).toEqual({ sum: null, known: 0, partial: false });
    });

    it('reports a malformed interest as unpriced instead of guessing', () => {
        const report = buildNegotiations(input({
            leads: [{ id: 'L1', status: 'negotiating', sales_manager_name: null }],
            viewings: [{ id: 'v', lead_id: 'L1', scheduled_at: '2026-10-15T03:00:00Z', status: 'completed', sales_manager_name: 'Khongoroo', interests: [{ block: 'Б2', model: 'A', area_sqm: 'abc', floor: 12 }] }],
        }));
        expect(report.rows[0]).toMatchObject({ manager: 'Khongoroo', block: 'Б2', area: null, total: null, priceReason: 'Сонирхлын мэдээлэл дутуу' });
    });

    it('takes «Сэжим» from the lead\'s latest held meeting that recorded one, not only from the interest meeting', () => {
        // L1: сонирхол v-new-ээс (Facebook), гэхдээ хожмын v-latest дээр «Ойрхон амьдардаг» сонгосон → түүнийг; ирээдүйн товлол тооцохгүй.
        const report = buildNegotiations(input({ referrals: { available: true, byViewing: new Map([['v-old', 'Ажилтан'], ['v-new', null], ['v-latest', 'Ойрхон амьдардаг'], ['v-booked', 'Монкон']]) } }));
        expect(report.rows.find(row => row.leadId === 'L1')?.referral).toBe('Ойрхон амьдардаг');
        // L2: зөвхөн ирэх товлол дээр сонгосон — болоогүй уулзалтаас авахгүй.
        expect(report.rows.find(row => row.leadId === 'L2')?.referral).toBeNull();
        // Эхний (шинэ) уулзалтын «Сэжим» давтан уулзалтад хоосон байсан ч хадгалагдана.
        const first = buildNegotiations(input({ referrals: { available: true, byViewing: new Map([['v-old', 'Ажилтан']]) } }));
        expect(first.rows.find(row => row.leadId === 'L1')?.referral).toBe('Ажилтан');
    });

    it('drops «Сэжим» when the referral column is missing', () => {
        const report = buildNegotiations(input({ referrals: { available: false, byViewing: new Map([['v-new', 'Facebook']]) } }));
        expect(report.rows.every(row => row.referral === null)).toBe(true);
        expect(report.notes).toContain('«Сэжим (хаанаас ирсэн)» талбар хараахан нэмэгдээгүй.');
    });

    it('sums fully known columns and keeps an empty pipeline at zero', () => {
        expect(negotiationSum([1, 2])).toEqual({ sum: 3, known: 3, partial: false });
        expect(negotiationSum([null, null])).toEqual({ sum: null, known: 0, partial: false });
        expect(negotiationSum([])).toEqual({ sum: 0, known: 0, partial: false });
        const empty = buildNegotiations(input({ leads: [] }));
        expect(empty.rows).toEqual([]);
        expect(empty.totals.count).toBe(0);
    });

    it('says nothing about the price list for an empty pipeline, where it is not read', () => {
        // Loader хоосон жагсаалтад үнийн тохиргоо уншдаггүй (pricing: null) — «алга» гэж худал хэлэхгүй.
        const empty = buildNegotiations(input({ leads: [], pricing: null }));
        expect(empty.pricing).toBeNull();
        expect(empty.notes).toEqual([]);
        // Бүх лид гэрээтэй ч мөргүй тул үнийн тэмдэглэлгүй.
        const contracted = buildNegotiations(input({ leads: [{ id: 'L3', status: 'negotiating', sales_manager_name: null }] }));
        expect(contracted.pricing).toBeNull();
        expect(contracted.notes).toEqual(['1 лид амьд гэрээтэй тул жагсаалтад ороогүй.']);
    });
});
