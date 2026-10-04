/**
 * Meta Marketing API — ad set × өдрийн дэлгэрэнгүй insights, хугацааны давхардалгүй reach.
 *
 * Дүрэм (fetchMetaDailySpend-тэй адил): бүх хуудсыг cursor-оор татаж (paging.next-ийг хэзээ ч
 * дагахгүй), мөр бүрийг хатуу шалгана — данс/валют зөрсөн, ID тоо биш, олон өдрийн, хугацаанаас
 * гадуурх, тоо биш эсвэл давхардсан мөр байвал бүх таталтыг алдаа болгоно (хагас өгөгдөл
 * хадгалахгүй).
 *
 * Үр дүн (Results): API-ийн `results` талбар (баримтжуулаагүй хэлбэр — хамгаалалттай уншина)
 * ирвэл түүний indicator-оор төрлийг тодорхойлно; эс бөгөөс ad set-ийн `optimization_goal`-оор
 * төрөл, `actions`-аас тухайн төрлийн НЭГ action_type-аар тоог авна (давхар тоолохгүй).
 */
import { dateSchema } from '@/lib/marketing/performance';
import {
    META_RESULT_ACTION_TYPES, metaResultTypeForGoal, metaResultTypeOf, type MetaResultType,
} from '@/lib/marketing/meta-results';
import { MetaApiError, metaRead, metaStepSignal, type MetaAccount, type MetaDeadline } from './daily-spend';

export type MetaResultSource = 'results' | 'goal';
export interface MetaActionValue { action_type: string; value: number }
export interface MetaAdsetDay {
    day: string;
    campaign_id: string;
    campaign_name: string;
    adset_id: string;
    adset_name: string;
    objective: string | null;
    optimization_goal: string | null;
    currency: string;
    spend: number;
    impressions: number;
    /** Тухайн өдрийн reach — өдрүүдээр нэмэхгүй. */
    reach: number | null;
    clicks: number;
    inline_link_clicks: number;
    landing_page_views: number;
    calls_placed: number;
    result_type: MetaResultType | null;
    result_indicator: string | null;
    /** `result_type`-ийн нэгжээр; тооцох боломжгүй бол null. */
    results: number | null;
    result_source: MetaResultSource;
    actions: MetaActionValue[];
    cost_per_action_type: MetaActionValue[];
}

// `frequency`-г асуудаг ч хадгалахгүй, шалгахгүй: өдрийн харьцаа нэмэгддэггүй, долоо хоногийнхыг reach-ээс бодно.
const BASE_FIELDS = [
    'account_id', 'account_currency', 'campaign_id', 'campaign_name', 'adset_id', 'adset_name', 'objective', 'optimization_goal',
    'date_start', 'date_stop', 'spend', 'impressions', 'reach', 'frequency', 'clicks', 'inline_link_clicks', 'actions', 'cost_per_action_type',
];
/** Meta зарим дансанд/хувилбарт татгалзаж болох талбарууд (code 100) — тэгвэл тэдгээргүйгээр нэг удаа дахин татна. */
const RESULT_FIELDS = ['video_thruplay_watched_actions', 'results', 'cost_per_result'];
const PAGE_LIMIT = 100;
const MAX_ACTIONS = 300;

type Page = { data?: unknown; paging?: { next?: string; cursors?: { after?: string } } };
type Raw = Record<string, unknown>;

const invalid = () => new Error('Meta өгөгдөл зөрүүтэй байна. Өмнөх дэлгэрэнгүй өгөгдлийг өөрчлөөгүй.');

/** Сөрөг биш бүхэл тоо (Graph string эсвэл number). Байхгүй бол `fallback`. */
function count(value: unknown, fallback: number | null): number | null {
    if (value === undefined || value === null) return fallback;
    const text = typeof value === 'number' ? String(value) : value;
    if (typeof text !== 'string' || !/^\d{1,15}$/.test(text)) throw invalid();
    return Number(text);
}
/**
 * Сөрөг биш, төгсгөлөг аравтын тоо (Graph string эсвэл number). Бутархайн оронг хязгаарлахгүй —
 * Meta харьцаа/өртгийг (жишээ нь 3.3333333333333) бүрэн нарийвчлалаар буцааж болно. Буруу бол null.
 */
function decimalValue(value: unknown): number | null {
    if (typeof value === 'number') return Number.isFinite(value) && value >= 0 && value < 1e15 ? value : null;
    const text = typeof value === 'string' ? value.trim() : '';
    if (text.length > 64 || !/^\d{1,15}(\.\d+)?$/.test(text)) return null;
    const parsed = Number(text);
    return Number.isFinite(parsed) ? parsed : null;
}
function decimal(value: unknown): number {
    const parsed = decimalValue(value);
    if (parsed === null) throw invalid();
    return parsed;
}
function name(value: unknown, fallback: string): string {
    const text = typeof value === 'string' ? value.trim().slice(0, 500) : '';
    return text || fallback;
}
const enumText = (value: unknown) => typeof value === 'string' && /^[A-Z][A-Z0-9_]{0,63}$/.test(value) ? value : null;

/** `[{ action_type, value }]` — бусад түлхүүрийг (attribution цонх) хадгалахгүй. */
export function parseMetaActions(value: unknown): MetaActionValue[] {
    if (value === undefined || value === null) return [];
    if (!Array.isArray(value) || value.length > MAX_ACTIONS) throw invalid();
    return value.map(item => {
        const entry = item as Raw;
        const type = entry && typeof entry.action_type === 'string' ? entry.action_type.trim() : '';
        if (!type || type.length > 200) throw invalid();
        return { action_type: type, value: decimal(entry.value) };
    });
}
const actionValue = (actions: readonly MetaActionValue[], type: string) => actions.find(a => a.action_type === type)?.value;

/**
 * API-ийн `results` (албан ёсоор баримтжуулаагүй): `[{ indicator, values: [{ value, attribution_windows? }] }]`.
 * Эхний indicator-тай бичлэг; олон утга бол `default` цонхныхыг (эс бөгөөс эхнийх) авна — цонхнуудыг нэмэхгүй.
 */
export function parseMetaResults(value: unknown): { indicator: string; value: number | null } | null {
    if (!Array.isArray(value)) return null;
    for (const item of value) {
        if (!item || typeof item !== 'object') continue;
        const entry = item as Raw;
        const indicator = typeof entry.indicator === 'string' ? entry.indicator.trim().slice(0, 200) : '';
        if (!indicator) continue;
        const values = Array.isArray(entry.values) ? entry.values.filter((v): v is Raw => !!v && typeof v === 'object') : [];
        const pick = values.find(v => Array.isArray(v.attribution_windows) && v.attribution_windows.includes('default')) ?? values[0];
        return { indicator, value: decimalValue(pick?.value) };
    }
    return null;
}

/** Мөрийн үр дүнгийн төрөл, тоо. `thruplay` = null бол ThruPlay талбарыг асуугаагүй (тоо тодорхойгүй). */
export function metaRowResult(row: {
    results?: unknown; optimization_goal: string | null; actions: readonly MetaActionValue[];
    thruplay: readonly MetaActionValue[] | null; reach: number | null;
}): Pick<MetaAdsetDay, 'result_type' | 'result_indicator' | 'results' | 'result_source'> {
    const reported = parseMetaResults(row.results);
    const reportedType = reported ? metaResultTypeOf(reported.indicator) : null;
    if (reported && reportedType) {
        // Indicator байгаа ч утгагүй өдөр = тэр өдөр үр дүн гараагүй.
        return { result_type: reportedType, result_indicator: reported.indicator.toLowerCase().replace(/^actions:/, ''), results: reported.value ?? 0, result_source: 'results' };
    }
    const type = metaResultTypeForGoal(row.optimization_goal);
    if (!type) return { result_type: null, result_indicator: null, results: null, result_source: 'goal' };
    if (type === 'reach') return { result_type: type, result_indicator: 'reach', results: row.reach, result_source: 'goal' };
    if (type === 'thruplay') {
        if (!row.thruplay) return { result_type: type, result_indicator: null, results: null, result_source: 'goal' };
        const video = row.thruplay.find(a => a.action_type === 'video_view') ?? row.thruplay[0];
        return { result_type: type, result_indicator: 'video_thruplay_watched_actions', results: video?.value ?? 0, result_source: 'goal' };
    }
    const candidates = META_RESULT_ACTION_TYPES[type];
    if (!candidates?.length) return { result_type: type, result_indicator: null, results: null, result_source: 'goal' };
    // Тухайн төрлийн эхний байгаа action_type-ийг л авна (жишээ нь lead_grouped ба lead-ийг нэмэхгүй).
    const used = candidates.find(candidate => actionValue(row.actions, candidate) !== undefined) ?? candidates[0];
    return { result_type: type, result_indicator: used, results: actionValue(row.actions, used) ?? 0, result_source: 'goal' };
}

function parseAdsetRow(r: Raw, account: MetaAccount, from: string, to: string, withResultFields: boolean): MetaAdsetDay {
    const day = r.date_start;
    if (r.account_id !== account.id.slice(4) || r.account_currency !== account.currency
        || typeof r.campaign_id !== 'string' || !/^\d{1,40}$/.test(r.campaign_id) || typeof r.adset_id !== 'string' || !/^\d{1,40}$/.test(r.adset_id)
        || typeof day !== 'string' || !dateSchema.safeParse(day).success || day !== r.date_stop || day < from || day > to
        || typeof r.spend !== 'string' || !/^\d+(\.\d{1,6})?$/.test(r.spend) || Number(r.spend) >= 1e12) throw invalid();
    const actions = parseMetaActions(r.actions);
    const costs = parseMetaActions(r.cost_per_action_type);
    const thruplay = withResultFields ? parseMetaActions(r.video_thruplay_watched_actions) : null;
    const reach = count(r.reach, null);
    const optimizationGoal = enumText(r.optimization_goal);
    return {
        day, campaign_id: r.campaign_id, campaign_name: name(r.campaign_name, r.campaign_id),
        adset_id: r.adset_id, adset_name: name(r.adset_name, r.adset_id),
        objective: enumText(r.objective), optimization_goal: optimizationGoal, currency: account.currency,
        spend: Number(r.spend), impressions: count(r.impressions, 0)!, reach,
        clicks: count(r.clicks, 0)!, inline_link_clicks: count(r.inline_link_clicks, 0)!,
        landing_page_views: actionValue(actions, 'landing_page_view') ?? 0,
        calls_placed: actionValue(actions, 'click_to_call_native_call_placed') ?? 0,
        ...metaRowResult({ results: withResultFields ? r.results : undefined, optimization_goal: optimizationGoal, actions, thruplay, reach }),
        actions, cost_per_action_type: costs,
    };
}

async function readAdsetPages(account: MetaAccount, token: string, from: string, to: string, withResultFields: boolean, deadline?: MetaDeadline): Promise<MetaAdsetDay[]> {
    const rows: MetaAdsetDay[] = [], keys = new Set<string>(), cursors = new Set<string>();
    const signal = metaStepSignal(90000, deadline);
    const fields = [...BASE_FIELDS, ...(withResultFields ? RESULT_FIELDS : [])].join(',');
    let after: string | undefined;
    for (let page = 0; page < PAGE_LIMIT; page++) {
        const result = await metaRead<Page>(`${account.id}/insights`, token, {
            fields, level: 'adset', time_increment: '1', time_range: JSON.stringify({ since: from, until: to }), limit: '500',
            ...(after ? { after } : {}),
        }, { signal });
        if (!Array.isArray(result.data)) throw new Error('Meta дэлгэрэнгүй insights-ийн хариу дутуу байна.');
        for (const item of result.data) {
            if (!item || typeof item !== 'object') throw invalid();
            const row = parseAdsetRow(item as Raw, account, from, to, withResultFields);
            const key = `${row.adset_id}:${row.day}`;
            if (keys.has(key)) throw invalid();
            keys.add(key);
            rows.push(row);
        }
        if (!result.paging?.next) return rows;
        // Rebuild the trusted Graph URL with a cursor; never follow arbitrary paging.next URLs.
        after = result.paging.cursors?.after;
        if (!after || cursors.has(after)) throw new Error('Meta хуудаслалт бүрэн дуусаагүй байна.');
        cursors.add(after);
    }
    throw new Error('Meta өгөгдөл хэт их байна. Хугацааг багасгаж дахин оролдоно уу.');
}

/**
 * `{act}/insights` level=adset, time_increment=1 — [from, to] (дансны цагийн бүсийн өдрүүд).
 * Meta `results`/ThruPlay талбарыг (code 100) татгалзвал тэдгээргүйгээр нэг удаа дахин татна;
 * тэр үед бүх мөрийн үр дүн `optimization_goal`-оор (`result_source = 'goal'`).
 * `deadline` = синкийн нийт хугацаа: алхам бүрийн 90 сек-ээс эрт дуусвал хүсэлтийг таслана.
 */
export async function fetchMetaAdsetInsights(account: MetaAccount, token: string, from: string, to: string, deadline?: MetaDeadline): Promise<{ rows: MetaAdsetDay[]; resultFields: boolean }> {
    try {
        return { rows: await readAdsetPages(account, token, from, to, true, deadline), resultFields: true };
    } catch (error) {
        if (!(error instanceof MetaApiError) || error.code !== 100) throw error;
        return { rows: await readAdsetPages(account, token, from, to, false, deadline), resultFields: false };
    }
}

export interface MetaPeriodReach {
    /** Дансны хугацааны давхардалгүй reach. */
    account: number;
    /** Кампанит ажил бүрийн хугацааны давхардалгүй reach. */
    campaigns: Map<string, number>;
}

/**
 * Хугацааны (жишээ нь хурлын 7 хоног) давхардалгүй reach: level=account ба level=campaign,
 * time_increment-гүй. Өдрийн reach-ийг нэмж болохгүй тул Meta-гаас шууд авна.
 */
export async function fetchMetaPeriodReach(account: MetaAccount, token: string, from: string, to: string, deadline?: MetaDeadline): Promise<MetaPeriodReach> {
    const signal = metaStepSignal(60000, deadline);
    const timeRange = JSON.stringify({ since: from, until: to });
    const checkRow = (r: Raw) => {
        if (r.account_id !== undefined && r.account_id !== account.id.slice(4)) throw invalid();
        if ((r.date_start !== undefined && r.date_start !== from) || (r.date_stop !== undefined && r.date_stop !== to)) throw invalid();
    };
    const total = await metaRead<Page>(`${account.id}/insights`, token, {
        fields: 'account_id,reach,frequency,impressions,spend', level: 'account', time_range: timeRange,
    }, { signal });
    if (!Array.isArray(total.data) || total.data.length > 1) throw new Error('Meta reach-ийн хариу дутуу байна.');
    const accountRow = total.data[0] as Raw | undefined;
    if (accountRow) checkRow(accountRow);
    // Хүргэлтгүй хугацаа = мөргүй (0). Мөр байгаа ч reach ирээгүй бол 0 гэж таамаглахгүй.
    const accountReach = accountRow ? count(accountRow.reach, null) : 0;
    if (accountReach === null) throw new Error('Meta reach-ийн хариу дутуу байна.');

    const campaigns = new Map<string, number>(), seen = new Set<string>(), cursors = new Set<string>();
    let after: string | undefined;
    for (let page = 0; page < PAGE_LIMIT; page++) {
        const result = await metaRead<Page>(`${account.id}/insights`, token, {
            fields: 'account_id,campaign_id,reach', level: 'campaign', time_range: timeRange, limit: '500', ...(after ? { after } : {}),
        }, { signal });
        if (!Array.isArray(result.data)) throw new Error('Meta reach-ийн хариу дутуу байна.');
        for (const item of result.data) {
            const r = (item ?? {}) as Raw;
            checkRow(r);
            if (typeof r.campaign_id !== 'string' || !/^\d{1,40}$/.test(r.campaign_id) || seen.has(r.campaign_id)) throw invalid();
            seen.add(r.campaign_id);
            // reach ирээгүй кампанит ажлыг орхино (тайланд тодорхойгүй гэж үлдэнэ).
            const reach = count(r.reach, null);
            if (reach !== null) campaigns.set(r.campaign_id, reach);
        }
        if (!result.paging?.next) return { account: accountReach, campaigns };
        after = result.paging.cursors?.after;
        if (!after || cursors.has(after)) throw new Error('Meta хуудаслалт бүрэн дуусаагүй байна.');
        cursors.add(after);
    }
    throw new Error('Meta өгөгдөл хэт их байна. Хугацааг багасгаж дахин оролдоно уу.');
}
