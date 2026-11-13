/**
 * Лхагвын илтгэлийн «НИЙТ УУЛЗАЛТЫН ДЭЛГЭРЭНГҮЙ» (багийн загварын 10-р слайд). Client-safe, pure:
 * сервер `meeting-details-load.ts`.
 *  • Сонирхсон загвар 7 хоногоор: сүүлийн 4 Лхагва→Мягмар 7 хоног (range.to-оор дуусна), `completed`
 *    (ирээгүй, цуцалсан биш), устгаагүй бүх төрлийн уулзалт, уулзалтын ЭХНИЙ сонирхлын блок + загвараар
 *    (`pricingKey`-ээр: «Б1»/«B1», «E7»/«e7» нэг загвар; нэр нь байрны бүртгэлийнх, эс бөгөөс эхэлж бичигдсэн нь).
 *    Өрөө = байрны бүртгэлийн блок + загвар (нэг утгатай бол), талбай = 4 долоо хоногийн хамгийн олон
 *    давтагдсан `area_sqm` — загварын нэр (`label`) долоо хоног бүрт ижил. Сонирхолгүй уулзалт тусдаа
 *    (`withoutInterest`) — хасахгүй.
 *  • «Сэжим» (хаанаас ирсэн): тайлант 7 хоногийн ШИНЭ (`new_customer`) уулзалт сэжмийн нэрээр;
 *    сонгоогүй эсвэл талбар хараахан алга бол «Тодорхойгүй» (`unknown`), 0 гэж хасахгүй.
 *  • м²-ийн бүлэг (борлуулалтын багийн хүснэгт, 2026-11-12): ижил 4 долоо хоног, уулзалтын ЭХНИЙ сонирхол, БЛОК
 *    ХАМААРАХГҮЙ — орон сууц талбайгаараа (`MEETING_AREA_BANDS`), бусад төрөл (Үйлчилгээ, Зогсоол, Агуулах) байрны
 *    бүртгэлийн ангиллаараа. Уулзалт бүр нэг бүлэгт (эсвэл «Сонголтгүй») — мөрийн нийлбэр = уулзалтын тоо.
 *  • Төлбөрийн нөхцөл: тайлант 7 хоногийн БҮХ төрлийн болсон уулзалт урьдчилгаа / үлдэгдэл төлбөрийн нөхцөлөөр
 *    (`lib/viewings/payment-terms.ts`-ийн дарааллаар); сонгоогүй бол «Тодорхойгүй», 0 гэж хасахгүй.
 */
import { periodCoverage, type PeriodCoverage } from './data-since';
import { pricingKey } from '@/lib/sales/pricing';
import { activityRangeLabel } from './sales-activity';
import { shiftReviewDate, weeklyReviewRange } from './weekly-review';
import { UNIT_CATEGORY_LABEL, type InventoryCategory } from '@/lib/inventory/labels';
import { PAYMENT_TERM_OPTIONS, paymentTermLabel, type PaymentTermKind } from '@/lib/viewings/payment-terms';

export const MEETING_DETAIL_WEEKS = 4;

export interface MeetingModelCount { key: string; label: string; count: number }

/**
 * Орон сууцны м²-ийн бүлэг: `min ≤ талбай < max`. Борлуулалтын албаны илтгэлийн баганууд (Elysium: Б1 E1–E7, Б2 A–F —
 * блок бүрт загварын нэр, талбай бага зэрэг өөр боловч нэг төрлийн байр нэг бүлэгт). Хил: 2 өрөө 49–64, 3 өрөө 78.9–80.4
 * («80»), 80.5–85.2 («81/85»), 88.8–89.7 («89»), 4 өрөө 100–139. Бүлгийг өөрчлөх бол ЭНД (төсөл бүрийн тохиргоо хараахан алга).
 */
export const MEETING_AREA_BANDS: ReadonlyArray<{ key: string; label: string; min: number; max: number }> = [
    { key: 'a51', label: '51–64 м²', min: 0, max: 70 },
    { key: 'a80', label: '80 м²', min: 70, max: 80.45 },
    { key: 'a81', label: '81/85 м²', min: 80.45, max: 87 },
    { key: 'a89', label: '89 м²', min: 87, max: 95 },
    { key: 'a102', label: '102/138 м²', min: 95, max: Infinity },
];
/** Орон сууц биш төрлийн бүлэг (байрны бүртгэлийн ангиллаар); «Үйлчилгээ» үргэлж харагдана, бусад нь тоотой үед. */
const CATEGORY_BANDS: readonly InventoryCategory[] = ['commercial', 'parking', 'industry'];
export const MEETING_BAND_OTHER = 'other';
export interface MeetingBand { key: string; label: string }
export interface MeetingTermCount { rows: Array<{ label: string; count: number }>; unknown: number }
/**
 * `coverage`: уулзалтын бүртгэл эхлэхээс өмнө дууссан 7 хоног → none (тоо тодорхойгүй, «0» биш); дунд нь эхэлсэн → partial
 * (тоо доод хязгаар «N+»); full → бүрэн. Идэвхжлийн тайлантай (9-р слайд) нэг дүрэм (`data-since.ts`).
 */
export interface MeetingDetailWeek {
    label: string; from: string; to: string; total: number; withoutInterest: number; byModel: MeetingModelCount[]; coverage: PeriodCoverage;
    /** Бүлгийн түлхүүр → уулзалтын тоо (тоогүй бүлэг байхгүй). */
    byBand: Record<string, number>;
}
export interface MeetingDetailsReport {
    range: { from: string; to: string };
    weeks: MeetingDetailWeek[];
    referral: { rows: Array<{ label: string; count: number }>; unknown: number; total: number; /** Сэжмийн талбар DB-д бий эсэх. */ available: boolean };
    /** м²-ийн бүлгийн баганууд (дарааллаар): «Үйлчилгээ», орон сууцны бүлгүүд, тоотой бол Зогсоол / Агуулах / Бусад. */
    bands: MeetingBand[];
    /** Тайлант 7 хоногийн болсон уулзалт (бүх төрөл) төлбөрийн нөхцөлөөр; `available: false` = талбар DB-д алга. */
    paymentTerms: { advance: MeetingTermCount; remainder: MeetingTermCount; total: number; available: boolean };
    notes: string[];
}

export interface MeetingDetailRow {
    id: string;
    /** Уулзалтын УБ өдөр. */
    day: string;
    type: string | null;
    interests: unknown;
    /** Урьдчилгаа / үлдэгдэл төлбөрийн нөхцөлийн код; сонгоогүй бол null. */
    advanceTerm?: string | null;
    remainderTerm?: string | null;
}
export interface MeetingDetailsInput {
    meetingDate: string;
    meetings: readonly MeetingDetailRow[];
    /** Байрны бүртгэл (орон сууц): блок, загвар, өрөө. */
    units: ReadonlyArray<{ block: string | null; model: string | null; rooms: number | string | null; /** Байрны ангилал; өгөөгүй бол орон сууц гэж үзнэ. */ category?: string | null }>;
    /** Төлбөрийн нөхцөлийн баганууд DB-д бий эсэх (хуучин дуудагчид: байхгүй гэж үзнэ). */
    paymentTermsAvailable?: boolean;
    /** Сэжим: `available: false` = багана/хүснэгт алга; `byViewing` = уулзалт → сэжмийн нэр (сонгоогүй бол null). */
    referrals: { available: boolean; byViewing: ReadonlyMap<string, string | null> };
    /** Уулзалтын бүртгэл эхэлсэн УБ өдөр (устгаагүй, ямар ч төлөвтэй хамгийн эртний уулзалт); алга бол null. Хуучин дуудагчид заавал биш. */
    meetingsSince?: string | null;
}

/** Тайлант 7 хоногоор дуусах сүүлийн `count` Лхагва→Мягмар 7 хоног (эрт → хожуу). */
export function meetingDetailWeeks(meetingDate: string, count = MEETING_DETAIL_WEEKS): Array<{ label: string; from: string; to: string }> {
    const range = weeklyReviewRange(meetingDate);
    return Array.from({ length: count }, (_, index) => {
        const offset = (count - 1 - index) * -7;
        const from = shiftReviewDate(range.from, offset);
        const to = shiftReviewDate(range.to, offset);
        return { label: activityRangeLabel(from, to), from, to };
    });
}

/** Уулзалтын эхний сонирхол (блок, загвар, талбай); бүтэцгүй бол null. */
export function firstInterest(interests: unknown): { block: string; model: string; area: number | null } | null {
    const item = Array.isArray(interests) ? interests[0] as Record<string, unknown> | undefined : undefined;
    const block = typeof item?.block === 'string' ? item.block.trim() : '';
    const model = typeof item?.model === 'string' ? item.model.trim() : '';
    if (!block || !model) return null;
    const area = Number(item?.area_sqm);
    return { block, model, area: Number.isFinite(area) && area > 0 ? Math.round(area * 100) / 100 : null };
}

/** Блок + загвар → өрөө (байрны бүртгэлд нэг утгатай бол л). */
export function modelRooms(units: MeetingDetailsInput['units']): Map<string, number | null> {
    const values = new Map<string, Set<number>>();
    for (const unit of units) {
        const rooms = Number(unit.rooms);
        if (!unit.block || !unit.model || unit.rooms === null || !Number.isInteger(rooms) || rooms <= 0) continue;
        const key = `${pricingKey(unit.block)}|${pricingKey(unit.model)}`;
        values.set(key, (values.get(key) ?? new Set()).add(rooms));
    }
    return new Map([...values].map(([key, set]) => [key, set.size === 1 ? [...set][0] : null]));
}
/** Блок + загварын түлхүүр (кирилл/латин «Б»/«B», «Е»/«E», том/жижиг үсэг ялгахгүй). */
export const modelKey = (block: string, model: string) => `${pricingKey(block)}|${pricingKey(model)}`;
export const roomsOf = (rooms: Map<string, number | null>, block: string, model: string) => rooms.get(modelKey(block, model)) ?? null;
/** Түлхүүр → байрны бүртгэлд бичигдсэн блок, загварын нэр (эхний байрных). */
export function registerModelNames(units: MeetingDetailsInput['units']): Map<string, { block: string; model: string }> {
    const names = new Map<string, { block: string; model: string }>();
    for (const unit of units) {
        const block = unit.block?.trim();
        const model = unit.model?.trim();
        if (block && model && !names.has(modelKey(block, model))) names.set(modelKey(block, model), { block, model });
    }
    return names;
}

/** «Б1 E7 · 89.73 м² · 3 өрөө». */
export function modelLabel(block: string, model: string, area: number | null, rooms: number | null): string {
    return [`${block} ${model}`, area === null ? null : `${area} м²`, rooms === null ? null : `${rooms} өрөө`].filter(Boolean).join(' · ');
}

/** Блок + загвар → орон сууц биш ангилал (бүртгэлд нэг утгатай бол л); орон сууц эсвэл тодорхойгүй бол байхгүй. */
export function modelCategories(units: MeetingDetailsInput['units']): Map<string, InventoryCategory> {
    const values = new Map<string, Set<string>>();
    for (const unit of units) {
        if (!unit.block || !unit.model) continue;
        const key = modelKey(unit.block, unit.model);
        values.set(key, (values.get(key) ?? new Set()).add(unit.category ?? 'residential'));
    }
    const result = new Map<string, InventoryCategory>();
    for (const [key, set] of values) {
        const category = set.size === 1 ? [...set][0] : null;
        if (category && category !== 'residential' && (CATEGORY_BANDS as readonly string[]).includes(category)) result.set(key, category as InventoryCategory);
    }
    return result;
}

/** Сонирхлын бүлгийн түлхүүр: орон сууц биш бол ангилал, орон сууц бол талбайн бүлэг, талбайгүй бол «Бусад». */
export function meetingBandKey(interest: { block: string; model: string; area: number | null }, categories: ReadonlyMap<string, InventoryCategory>): string {
    const category = categories.get(modelKey(interest.block, interest.model));
    if (category) return `cat:${category}`;
    if (interest.area === null) return MEETING_BAND_OTHER;
    return MEETING_AREA_BANDS.find(band => interest.area! >= band.min && interest.area! < band.max)?.key ?? MEETING_BAND_OTHER;
}

function termCount(kind: PaymentTermKind, codes: Array<string | null | undefined>): MeetingTermCount {
    const counts = new Map<string, number>();
    let unknown = 0;
    for (const code of codes) {
        if (!code) { unknown++; continue; }
        counts.set(code, (counts.get(code) ?? 0) + 1);
    }
    // Жагсаалтын дарааллаар бүх сонголт (0-тэй нь ч — баг хүснэгтээ тогтмол мөрөөр уншдаг); жагсаалтад байхгүй хуучин код сүүлд.
    const listed = PAYMENT_TERM_OPTIONS[kind].filter(option => !option.retired || counts.has(option.code)).map(option => option.code);
    const extra = [...counts.keys()].filter(code => !listed.includes(code)).sort();
    return { rows: [...listed, ...extra].map(code => ({ label: paymentTermLabel(kind, code) ?? code, count: counts.get(code) ?? 0 })), unknown };
}

export function buildMeetingDetails(input: MeetingDetailsInput): MeetingDetailsReport {
    const range = weeklyReviewRange(input.meetingDate);
    const residential = input.units.filter(unit => !unit.category || unit.category === 'residential');
    const rooms = modelRooms(residential);
    const categories = modelCategories(input.units);
    const registerNames = registerModelNames(input.units);
    const notes: string[] = [];

    const windowWeeks = meetingDetailWeeks(input.meetingDate);
    const inWindow = input.meetings.filter(meeting => meeting.day >= windowWeeks[0].from && meeting.day <= windowWeeks[windowWeeks.length - 1].to);
    // Загварын нэр 4 долоо хоногт нэг (слайдын тайлбар, график бүрт ижил): долоо хоног бүр өөрийн талбайгаар нэрлэвэл
    // нэг загвар (нэг өнгө) хоёр нэртэй болно.
    const models = new Map<string, { block: string; model: string; areas: Map<number, number> }>();
    for (const meeting of inWindow) {
        const interest = firstInterest(meeting.interests);
        if (!interest) continue;
        const key = modelKey(interest.block, interest.model);
        const entry = models.get(key) ?? { ...(registerNames.get(key) ?? { block: interest.block, model: interest.model }), areas: new Map() };
        if (interest.area !== null) entry.areas.set(interest.area, (entry.areas.get(interest.area) ?? 0) + 1);
        models.set(key, entry);
    }
    const labels = new Map([...models].map(([key, entry]) => {
        // Хамгийн олон давтагдсан талбай (тэнцвэл бага нь).
        const area = [...entry.areas].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0] ?? null;
        return [key, modelLabel(entry.block, entry.model, area, roomsOf(rooms, entry.block, entry.model))];
    }));

    const weeks = windowWeeks.map(week => {
        const meetings = inWindow.filter(meeting => meeting.day >= week.from && meeting.day <= week.to);
        const counts = new Map<string, number>();
        const byBand: Record<string, number> = {};
        let withoutInterest = 0;
        for (const meeting of meetings) {
            const interest = firstInterest(meeting.interests);
            if (!interest) { withoutInterest++; continue; }
            const key = modelKey(interest.block, interest.model);
            counts.set(key, (counts.get(key) ?? 0) + 1);
            const band = meetingBandKey(interest, categories);
            byBand[band] = (byBand[band] ?? 0) + 1;
        }
        const byModel = [...counts].map(([key, count]) => ({ key, label: labels.get(key)!, count }))
            .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key, 'mn', { numeric: true }));
        const coverage: PeriodCoverage = input.meetingsSince === undefined ? 'full' : periodCoverage(input.meetingsSince, week.from, week.to);
        return { ...week, total: meetings.length, withoutInterest, byModel, coverage, byBand };
    });
    if (input.meetingsSince === null) notes.push('Уулзалт бүртгэгдээгүй тул 7 хоногийн тоо тодорхойгүй.');
    else if (input.meetingsSince && input.meetingsSince > weeks[0].from) {
        notes.push(`Уулзалтын бүртгэл ${input.meetingsSince}-нээс эхэлсэн — түүнээс өмнөх 7 хоног тодорхойгүй, тэр өдрийг агуулсан 7 хоногийн тоо доод хязгаар («N+»).`);
    }
    const missing = weeks.reduce((sum, week) => sum + week.withoutInterest, 0);
    if (missing) notes.push(`${missing} уулзалтад сонирхсон загвар бүртгэгдээгүй («Сонголтгүй»).`);

    // Сэжим: тайлант 7 хоногийн шинэ уулзалт.
    const fresh = input.meetings.filter(meeting => meeting.type === 'new_customer' && meeting.day >= range.from && meeting.day <= range.to);
    const counts = new Map<string, number>();
    let unknown = 0;
    for (const meeting of fresh) {
        const name = input.referrals.available ? input.referrals.byViewing.get(meeting.id)?.trim() || null : null;
        if (!name) { unknown++; continue; }
        counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    if (!input.referrals.available) notes.push('«Сэжим (хаанаас ирсэн)» талбар хараахан нэмэгдээгүй тул шинэ уулзалт бүгд «Тодорхойгүй».');
    else if (unknown) notes.push(`${unknown} шинэ уулзалтад «Сэжим» сонгоогүй.`);
    const rows = [...counts].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'mn'));

    // м²-ийн бүлгийн баганууд: «Үйлчилгээ» + орон сууцны бүлгүүд үргэлж; Зогсоол, Агуулах, Бусад зөвхөн тоотой үед.
    const used = new Set(weeks.flatMap(week => Object.keys(week.byBand)));
    const bands: MeetingBand[] = [
        { key: 'cat:commercial', label: UNIT_CATEGORY_LABEL.commercial },
        ...MEETING_AREA_BANDS.map(band => ({ key: band.key, label: band.label })),
        ...CATEGORY_BANDS.filter(category => category !== 'commercial' && used.has(`cat:${category}`)).map(category => ({ key: `cat:${category}`, label: UNIT_CATEGORY_LABEL[category] })),
        ...(used.has(MEETING_BAND_OTHER) ? [{ key: MEETING_BAND_OTHER, label: 'Бусад' }] : []),
    ];

    // Төлбөрийн нөхцөл: тайлант 7 хоногийн болсон уулзалт, бүх төрөл.
    const held = input.meetings.filter(meeting => meeting.day >= range.from && meeting.day <= range.to);
    const termsAvailable = input.paymentTermsAvailable ?? false;
    const advance = termCount('advance', held.map(meeting => termsAvailable ? meeting.advanceTerm : null));
    const remainder = termCount('remainder', held.map(meeting => termsAvailable ? meeting.remainderTerm : null));
    if (!termsAvailable) notes.push('Төлбөрийн нөхцөлийн талбар хараахан нэмэгдээгүй тул уулзалт бүгд «Тодорхойгүй».');
    else if (held.length && (advance.unknown || remainder.unknown)) {
        notes.push(`Тайлант 7 хоногийн ${held.length} уулзалтаас урьдчилгааны нөхцөл сонгоогүй ${advance.unknown}, үлдэгдлийн нөхцөл сонгоогүй ${remainder.unknown}.`);
    }

    return {
        range, weeks, referral: { rows, unknown, total: fresh.length, available: input.referrals.available },
        bands, paymentTerms: { advance, remainder, total: held.length, available: termsAvailable }, notes,
    };
}
