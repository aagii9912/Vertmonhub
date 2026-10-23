/**
 * Лхагвын илтгэлийн «ЯРИГДАЖ БУЙ ГЭРЭЭНИЙ ДЭЛГЭРЭНГҮЙ» (багийн загварын 2-р слайд; эзний шийдвэр W13).
 * Client-safe, pure: сервер `negotiations-load.ts`.
 *  • Мөр = идэвхтэй (устгаагүй) лид, төлөв «Хэлэлцэж байна» эсвэл «Санал тавьсан», холбосон амьд гэрээгүй.
 *  • Блок, давхар, талбай, нөхцөл = лидийн сонирхол бүртгэсэн хамгийн сүүлийн БОЛСОН (`completed`, өнөөдрөөс
 *    хойш биш) уулзалтын ЭХНИЙ сонирхол — товлосон, цуцалсан, ирээгүй уулзалтын сонголт болсон уулзалтыг
 *    дарахгүй; өрөө = сонгосон байрных, эс бөгөөс байрны бүртгэлийн блок + загвар (нэг утгатай бол).
 *  • Мкв үнэ, нийт үнэ, урьдчилгаа = ӨНӨӨДРИЙН (УБ) идэвхтэй үнийн тохиргоогоор (`calculatePricing`);
 *    тохиргоогүй, хугацаа дууссан, дүрэм олдоогүй бол null («—»). Урьдчилгааг нөхцлийн нэрээс таахгүй.
 *  • «Урьдчилгаа нөхцөл» тодорхойлогдоогүй (W13) тул үргэлж null. Захиалагчийн нэр, утас гаргахгүй.
 */
import { calculatePricing, PricingSelectionSchema, type PricingConfig } from '@/lib/sales/pricing';
import { ubDateStr } from '@/lib/utils/date';
import { knownSum } from './weekly-sales';
import { modelRooms, roomsOf } from './meeting-details';

export const NEGOTIATION_STATUSES = ['negotiating', 'offered'] as const;
/** Сонирхол авах уулзалтын төлөв: болсон уулзалт л. */
export const HELD_MEETING_STATUS = 'completed';

export interface NegotiationRow {
    leadId: string;
    status: string;
    manager: string | null;
    block: string | null;
    rooms: number | null;
    floor: number | null;
    /** Сонирхсон талбай (м²). */
    area: number | null;
    /** Урьдчилгааны хувь («10-30%»). */
    condition: string | null;
    pricePerSqm: number | null;
    total: number | null;
    advance: number | null;
    /** «Урьдчилгаа нөхцөл» — тодорхойлогдоогүй (W13). */
    conditionNote: null;
    /** «Сэжим (хаанаас ирсэн)» нэр; сонгоогүй эсвэл талбар алга бол null. */
    referral: string | null;
    /** Сонирхол авсан (болсон) уулзалтын УБ өдөр; сонирхолтой болсон уулзалтгүй бол null. */
    viewedAt: string | null;
    /** Үнэ (эсвэл урьдчилгаа) тооцоогүй шалтгаан; бүрэн үнэтэй бол null. */
    priceReason: string | null;
}
/** Нийлбэр: `sum` — нэг ч утга тодорхойгүй бол null («—»); `known` — мэдэгдэх утгын нийлбэр; `partial` — зарим нь тодорхойгүй («N+»). */
export interface NegotiationSum { sum: number | null; known: number; partial: boolean }
export interface NegotiationsReport {
    /** Үнийн өдөр (УБ өнөөдөр). */
    asOf: string;
    rows: NegotiationRow[];
    totals: { count: number; area: NegotiationSum; total: NegotiationSum; advance: NegotiationSum };
    /** Мөрийн үнийг тооцсон тохиргоо; мөргүй эсвэл идэвхтэй тохиргоогүй бол null. */
    pricing: { version: number; source: string } | null;
    notes: string[];
}

export interface NegotiationsInput {
    today: string;
    leads: ReadonlyArray<{ id: string; status: string | null; sales_manager_name: string | null }>;
    /** Холбосон амьд (устгаагүй, цуцлаагүй) гэрээтэй лидүүд. */
    liveContractLeadIds: ReadonlySet<string>;
    viewings: ReadonlyArray<{ id: string; lead_id: string | null; scheduled_at: string; status: string | null; sales_manager_name: string | null; interests: unknown }>;
    units: ReadonlyArray<{ id: string; block: string | null; model: string | null; rooms: number | string | null }>;
    pricing: PricingConfig | null;
    referrals: { available: boolean; byViewing: ReadonlyMap<string, string | null> };
}

export type NegotiationInterest = { block: string; model: string; area_sqm: number | null; floor: number | null; unit_id: string | null; payment_condition: string | null };
function readInterest(interests: unknown): NegotiationInterest | null {
    const item = Array.isArray(interests) ? interests[0] as Record<string, unknown> | undefined : undefined;
    const block = typeof item?.block === 'string' ? item.block.trim() : '';
    const model = typeof item?.model === 'string' ? item.model.trim() : '';
    if (!block || !model) return null;
    const area = Number(item?.area_sqm);
    const floor = Number(item?.floor);
    return {
        block, model,
        area_sqm: Number.isFinite(area) && area > 0 ? area : null,
        floor: item?.floor !== null && item?.floor !== undefined && Number.isInteger(floor) ? floor : null,
        unit_id: typeof item?.unit_id === 'string' ? item.unit_id : null,
        payment_condition: typeof item?.payment_condition === 'string' && item.payment_condition.trim() ? item.payment_condition.trim() : null,
    };
}

type ViewingRow = NegotiationsInput['viewings'][number];
/** Лид бүрийн сонирхол бүртгэсэн хамгийн сүүлийн болсон уулзалт (`today`-гоос хойш биш; эхний сонирхолтой нь). */
export function latestInterestViewings(viewings: NegotiationsInput['viewings'], today: string): Map<string, { viewing: ViewingRow; interest: NegotiationInterest }> {
    const latest = new Map<string, { viewing: ViewingRow; interest: NegotiationInterest }>();
    const held = viewings.filter(viewing => viewing.status === HELD_MEETING_STATUS && ubDateStr(new Date(viewing.scheduled_at)) <= today);
    const sorted = held.sort((a, b) => b.scheduled_at.localeCompare(a.scheduled_at) || a.id.localeCompare(b.id));
    for (const viewing of sorted) {
        if (!viewing.lead_id || latest.has(viewing.lead_id)) continue;
        const interest = readInterest(viewing.interests);
        if (interest) latest.set(viewing.lead_id, { viewing, interest });
    }
    return latest;
}

/** Талбайн бутархайн үлдэгдлийг (57.87 + 85.19) мөнгөний нарийвчлалаар тайрна. */
const cents = (value: number) => Math.round(value * 100) / 100;
export function negotiationSum(values: Array<number | null>): NegotiationSum {
    const known = values.filter((value): value is number => value !== null);
    const sum = knownSum(values);
    return { sum: sum === null ? null : cents(sum), known: cents(known.reduce((total, value) => total + value, 0)), partial: known.length > 0 && known.length < values.length };
}

export function buildNegotiations(input: NegotiationsInput): NegotiationsReport {
    const notes: string[] = [];
    const rooms = modelRooms(input.units);
    const unitRooms = new Map(input.units.map(unit => [unit.id, unit.rooms === null ? null : Number(unit.rooms)]));
    const latestByLead = latestInterestViewings(input.viewings, input.today);

    const leads = input.leads.filter(lead => (NEGOTIATION_STATUSES as readonly string[]).includes(lead.status ?? ''));
    const contracted = leads.filter(lead => input.liveContractLeadIds.has(lead.id)).length;
    const reasons = new Map<string, number>();
    let withoutInterest = 0;
    const rows: NegotiationRow[] = leads.filter(lead => !input.liveContractLeadIds.has(lead.id)).map(lead => {
        const latest = latestByLead.get(lead.id);
        const manager = lead.sales_manager_name?.trim() || latest?.viewing.sales_manager_name?.trim() || null;
        const base: NegotiationRow = {
            leadId: lead.id, status: lead.status ?? '', manager, block: null, rooms: null, floor: null, area: null, condition: null,
            pricePerSqm: null, total: null, advance: null, conditionNote: null, referral: null, viewedAt: null, priceReason: null,
        };
        if (!latest) { withoutInterest++; return { ...base, priceReason: 'Болсон уулзалтад сонирхсон байр бүртгэгдээгүй' }; }
        const { viewing, interest } = latest;
        const unitRoom = interest.unit_id ? unitRooms.get(interest.unit_id) : undefined;
        const selection = PricingSelectionSchema.safeParse({
            block: interest.block, model: interest.model, area_sqm: interest.area_sqm, floor: interest.floor,
            unit_id: interest.unit_id, payment_condition: interest.payment_condition,
        });
        const priced = selection.success ? calculatePricing(input.pricing, selection.data, input.today) : null;
        const quote = priced?.available ? priced.quote : null;
        const unpriced = quote ? null : priced && !priced.available ? priced.reason : 'Сонирхлын мэдээлэл дутуу';
        if (unpriced) reasons.set(unpriced, (reasons.get(unpriced) ?? 0) + 1);
        // Үнэтэй ч эхний урьдчилгааны хувь батлагдаагүй бол урьдчилгаа «—», шалтгаан нь энд.
        const priceReason = unpriced ?? quote?.advance_reason ?? null;
        return {
            ...base,
            block: interest.block,
            rooms: unitRoom != null && Number.isInteger(unitRoom) && unitRoom > 0 ? unitRoom : roomsOf(rooms, interest.block, interest.model),
            floor: interest.floor,
            area: interest.area_sqm === null ? null : Math.round(interest.area_sqm * 100) / 100,
            condition: interest.payment_condition,
            pricePerSqm: quote?.price_per_sqm ?? null,
            total: quote?.total_amount ?? null,
            advance: quote?.advance_amount ?? null,
            referral: input.referrals.available ? input.referrals.byViewing.get(viewing.id)?.trim() || null : null,
            viewedAt: ubDateStr(new Date(viewing.scheduled_at)),
            priceReason,
        };
    }).sort((a, b) => (b.viewedAt ?? '').localeCompare(a.viewedAt ?? '') || a.leadId.localeCompare(b.leadId));

    // Үнийн тэмдэглэл мөртэй үед л: хоосон жагсаалтад үнийн тохиргоог уншдаггүй (loader) тул «алга» гэж хэлэхгүй.
    const pricing = rows.length ? input.pricing : null;
    if (rows.length && !input.pricing) notes.push('Баталсан (идэвхтэй) үнийн тохиргоо алга — мкв үнэ, нийт үнэ, урьдчилгаа «—».');
    if (pricing) {
        notes.push(`Үнийг өнөөдрийн (${input.today}) баталсан үнийн тохиргоогоор (v${pricing.version}) тооцов.`);
        for (const [reason, count] of reasons) notes.push(`Үнэ тооцоогүй (${count}): ${reason}.`);
    }
    if (withoutInterest) notes.push(`${withoutInterest} лидийн болсон уулзалтад сонирхсон байр бүртгэгдээгүй.`);
    if (contracted) notes.push(`${contracted} лид амьд гэрээтэй тул жагсаалтад ороогүй.`);
    if (!input.referrals.available && rows.length) notes.push('«Сэжим (хаанаас ирсэн)» талбар хараахан нэмэгдээгүй.');

    return {
        asOf: input.today,
        rows,
        totals: {
            count: rows.length,
            area: negotiationSum(rows.map(row => row.area)),
            total: negotiationSum(rows.map(row => row.total)),
            advance: negotiationSum(rows.map(row => row.advance)),
        },
        pricing: pricing ? { version: pricing.version, source: pricing.source } : null,
        notes,
    };
}
