/**
 * Meta Marketing API-ийн дэлгэрэнгүй синк: ad set × өдрийн insights-ийг `meta_ad_insights_daily`-д
 * хадгалж, хурлын долоо хоног (Лхагва–Мягмар) бүрээр `marketing_channel_reports`-д `meta_ads`
 * тайлан (origin = 'api') бичнэ. Тайлангийн түлхүүрүүд CSV импорттой ижил гэрээтэй
 * (docs/features/META-INSIGHTS-API-2026-10-05.md):
 *
 *  - Нийт: spend, currency, impressions, link_clicks (= inline_link_clicks), clicks_all (= clicks),
 *    landing_page_views, reach/frequency (зөвхөн Meta-гийн хугацааны давхардалгүй reach), cpm,
 *    cost_per_link_click, ctr_link, cost_per_landing_page_view.
 *  - Үр дүнгийн төрөл T бүрт results_T, spend_T (кампанит ажлын зорилгоор: тухайн кампанит
 *    ажлын бүх зардал, үр дүнгүй өдрүүд ч), cost_per_result_T. Ганц төрөлтэй бол results /
 *    cost_per_result (хуучин түлхүүр). Синкийн өөр долоо хоногт хүргэлттэй боловч энэ долоо
 *    хоногт хүргэлтгүй төрөлд spend_T = 0, results_T = 0 (өртөггүй) — CSV импорттой адил.
 *  - Хамралт (data_to) нь зөвхөн дууссан өдрүүд: дансны өнөөдрийг тайланд оруулахгүй.
 *  - Задаргаа: кампанит ажил (төрөл бүрээр тусдаа мөр), зардлаар буурахаар, 100 мөр.
 *
 * Өдрийн reach-ийг хэзээ ч нэмэхгүй; Meta-аас татаж чадаагүй бол reach-гүй (таамаглахгүй).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { metaAdsToken } from '@/lib/facebook/ads-auth';
import {
    MetaApiError, fetchMetaAccount, metaDeadline, metaDeadlinePassed, metaTimeLeft, type MetaDeadline,
} from '@/lib/facebook/daily-spend';
import { fetchMetaAdsetInsights, fetchMetaPeriodReach, type MetaPeriodReach } from '@/lib/facebook/ads-insights';
import { reviewWeekOf, reviewWeeksBetween, shiftReviewDate } from '@/lib/dashboard/weekly-review';
import { fetchAllRows } from '@/lib/utils/pagination';
import { logger } from '@/lib/utils/logger';
import { presentMetaResultTypes, type MetaResultType } from './meta-results';
import type { MetaInsightRow } from './meta-result-groups';
import { META_INSIGHTS_TABLE, META_INSIGHT_COLUMNS, buildMetaChannelReport } from './meta-channel-report';
import { dateSchema } from './performance';

export { META_INSIGHTS_TABLE, META_INSIGHT_COLUMNS, MEETING_TIMEZONE, buildMetaChannelReport, type MetaChannelReport } from './meta-channel-report';
export const META_INSIGHTS_STATUS_TABLE = 'meta_insights_sync';
export type { MetaInsightRow } from './meta-result-groups';

export const MetaInsightsInput = z.object({ from: dateSchema.optional(), to: dateSchema.optional() })
    .refine(v => !!v.from === !!v.to && (!v.from || (v.to! >= v.from && Date.parse(v.to!) - Date.parse(v.from) <= 92 * 86400000)), '93 хүртэл өдрийн хугацаа сонгоно уу');
export type MetaInsightsOptions = z.infer<typeof MetaInsightsInput>;
export interface MetaInsightsStatus {
    account_id: string; last_attempt_at: string; last_success_at: string | null; last_from: string | null; last_to: string | null;
    last_error: string | null; row_count: number | null; weeks: number | null; result_source: 'results' | 'goal' | null;
}
export interface MetaInsightsResult {
    rows: number; from: string; to: string; currency: string;
    /** Тайлан бичсэн хурлын долоо хоногууд, эрт → хожуу (`dataTo` < `to` бол тухайн долоо хоног дуусаагүй). */
    weeks: Array<{ from: string; to: string; dataTo: string }>;
    /** false = Meta `results` талбарыг татгалзсан; үр дүнг зорилгоор тооцсон. */
    resultFields: boolean;
    /** Хугацаа дутсан тул зарим долоо хоногийн тайланг энэ удаа шинэчлээгүй (тайлбар). */
    partial?: string;
}

/** Route нийт хугацааг дамжуулаагүй үеийн анхдагч хязгаар. */
export const META_INSIGHTS_DEFAULT_BUDGET_MS = 150_000;
/** Данс, ad set-ийн хуудаснууд, хадгалалтыг эхлүүлэхэд үлдсэн байх ёстой хугацаа. */
export const META_INSIGHTS_MIN_MS = 20_000;
/** Нэг долоо хоногийн давхардалгүй reach (2+ дуудлага) ба тайлан хадгалахад үлдсэн байх ёстой хугацаа. */
export const META_INSIGHTS_WEEK_MS = 10_000;
const OUT_OF_TIME = 'Синкийн хугацаа дууссан тул Meta дэлгэрэнгүй үр дүнг энэ удаа шинэчилсэнгүй. Дараагийн синк (6 цаг) нөхнө; гараар бол хугацааг багасгаж дахин оролдоно уу.';

/**
 * Татах эхлэл: cron/анхдагч — сүүлийн 35 өдөр. Гараар сонгосон хугацаа хурлын долоо хоногийн дундаас
 * эхэлбэл (жишээ нь самбарын «энэ сар» = сарын 1) тэр долоо хоногийг бүтнээр нь татаж бичнэ —
 * хадгалах RPC-ийн 93 өдрийн хязгаарт багтвал.
 */
function insightsStart(inputFrom: string | undefined, to: string): string {
    if (!inputFrom) return shiftReviewDate(to, -34);
    const weekStart = reviewWeekOf(inputFrom).from;
    return weekStart >= shiftReviewDate(to, -92) ? weekStart : inputFrom;
}

async function readStoredRows(db: SupabaseClient, shopId: string, accountId: string, from: string, to: string): Promise<MetaInsightRow[]> {
    try {
        return await fetchAllRows<MetaInsightRow>((start, end) => db.from(META_INSIGHTS_TABLE).select(META_INSIGHT_COLUMNS)
            .eq('shop_id', shopId).eq('account_id', accountId).gte('day', from).lte('day', to)
            .order('day').order('adset_id').range(start, end));
    } catch (failure) {
        // Өгөгдлийн сангийн түүхий алдааг хэрэглэгч, төлөвт харуулахгүй — зөвхөн серверийн логт.
        logger.error('[Meta insights] хадгалсан мөрийг уншиж чадсангүй', { message: failure instanceof Error ? failure.message : 'unknown' });
        throw new Error('Хадгалсан Meta үр дүнг уншиж чадсангүй. Дахин оролдоно уу.');
    }
}

/** Файлаас импортолсон (origin ≠ 'api') `meta_ads` тайлантай долоо хоногууд (`from:to`). */
async function fileReportWeeks(db: SupabaseClient, shopId: string, weeks: ReadonlyArray<{ from: string; to: string }>): Promise<Set<string>> {
    if (!weeks.length) return new Set();
    const { data, error } = await db.from('marketing_channel_reports').select('period_from,period_to,origin')
        .eq('shop_id', shopId).eq('source', 'meta_ads').in('period_from', weeks.map(week => week.from));
    if (error) throw new Error('Хурлын долоо хоногийн Meta тайлангуудыг уншиж чадсангүй. Сувгийн тайлангийн шинэчлэл суулгасан эсэхийг шалгана уу.');
    return new Set((data ?? []).filter(r => r.origin !== 'api').map(r => `${r.period_from}:${r.period_to}`));
}

async function recordInsightsStatus(db: SupabaseClient, status: Partial<MetaInsightsStatus> & { shop_id: string; account_id: string; last_attempt_at: string }) {
    const { error } = await db.from(META_INSIGHTS_STATUS_TABLE).upsert(status, { onConflict: 'shop_id,account_id' });
    if (error) logger.warn('[Meta insights] төлөв хадгалж чадсангүй', { shopId: status.shop_id });
}

/**
 * Сүүлийн 35 өдрийг (эсвэл 93 хүртэл өдрийн сонгосон хугацааг, эхний хурлын долоо хоногийг бүтнээр)
 * дансны цагийн бүсээр татаж хадгална, дараа нь [from, to] дотор эхэлсэн хурлын долоо хоног бүрийн
 * `meta_ads` тайланг дахин бодно.
 *
 *  - Хамралт зөвхөн дууссан өдрүүд: `to` нь дансны өнөөдөр бол тайланд өчигдөр хүртэлх мөр орно
 *    (data_to = min(долоо хоногийн төгсгөл, өчигдөр)); өнөөдрийн мөр `meta_ad_insights_daily`-д
 *    хадгалагдана. Дууссан өдөргүй долоо хоногийг (Лхагва) бичихгүй. Өнгөрсөн хугацааны дунд дуусах
 *    долоо хоногийг хагасаар бичихгүй.
 *  - Мөргүй долоо хоногийг зөвхөн цонхонд түүнээс өмнө дансны өгөгдөл байгаа бол 0-ээр бичнэ
 *    (шинээр холбосон/сольсон дансны өмнөх долоо хоногийг 0 болгохгүй), файлын тайланг хэзээ ч
 *    0-ээр дарахгүй.
 *  - Мэдэгдэх үр дүнгийн төрөл = бичих долоо хоногуудын тайлан болон эхний долоо хоногийн өмнөх
 *    хурлын долоо хоногийн (хадгалсан мөр) тайлангийн төрлүүд; тухайн долоо хоногт хүргэлтгүй бол 0.
 *  - `deadline` = route-ийн нийт хугацаа: Graph хүсэлтүүдийг таслаж, хугацаа дутвал шинэ долоо хоног
 *    эхлүүлэхгүй (хамгийн сүүлийн долоо хоногоос эхэлнэ). Ямар ч үр дүнд `meta_insights_sync`-д бичнэ.
 */
export async function syncMetaInsights(
    db: SupabaseClient, shopId: string, options: MetaInsightsOptions = {}, run: { deadline?: MetaDeadline } = {},
): Promise<MetaInsightsResult> {
    const input = MetaInsightsInput.parse(options);
    const deadline = run.deadline ?? metaDeadline(META_INSIGHTS_DEFAULT_BUDGET_MS);
    const started = new Date().toISOString();
    const { data: shop, error } = await db.from('shops').select('facebook_ad_account_id,meta_ads_user_access_token,meta_ads_user_token_expires_at').eq('id', shopId).single();
    if (error) throw new Error('Meta тохиргоог уншиж чадсангүй.');
    const accountId = `act_${String(shop?.facebook_ad_account_id || '').replace(/^act_/, '')}`;
    if (!/^act_\d+$/.test(accountId)) throw new Error('Эхлээд Meta зарын дансаа сонгоно уу.');
    try {
        const token = metaAdsToken(shop);
        if (metaTimeLeft(deadline) < META_INSIGHTS_MIN_MS) throw new Error(OUT_OF_TIME);
        const account = await fetchMetaAccount(accountId, token, deadline);
        const today = new Intl.DateTimeFormat('en-CA', { timeZone: account.timezone_name, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
        const to = input.to && input.to < today ? input.to : today;
        if (input.from && input.from > to) throw new Error('Ирээдүйн өдрийн өгөгдлийг татах боломжгүй.');
        const from = insightsStart(input.from, to);
        // Дансны өнөөдөр дуусаагүй: тайлангийн хамралт өчигдөр хүртэл (өнөөдрийн мөрийг хадгална).
        const lastFinished = to < today ? to : shiftReviewDate(today, -1);
        const { rows, resultFields } = await fetchMetaAdsetInsights(account, token, from, to, deadline);
        const { data: saved, error: saveError } = await db.rpc('save_meta_ad_insights', { p_shop: shopId, p_account: accountId, p_from: from, p_to: to, p_rows: rows });
        if (saveError) throw new Error('Meta дэлгэрэнгүй үр дүнг хадгалж чадсангүй. Шинэчлэл суулгасан эсэх, сонгосон дансаа шалгаад дахин оролдоно уу.');

        const candidates = reviewWeeksBetween(from, to)
            .filter(week => week.from >= from && (week.to <= to || to === today))
            .map(week => ({ ...week, dataTo: week.to < lastFinished ? week.to : lastFinished }))
            .filter(week => week.dataTo >= week.from);
        const weeks: MetaInsightsResult['weeks'] = [];
        let partial: string | undefined;
        if (candidates.length) {
            const firstWeek = candidates[0].from;
            const stored = await readStoredRows(db, shopId, accountId, shiftReviewDate(firstWeek, -7), to);
            const plans = candidates.map(week => ({ week, rows: stored.filter(r => r.day >= week.from && r.day <= week.dataTo) }));
            // Мөргүй долоо хоног: тэг үү, эсвэл энэ дансны өгөгдөл биш үү (өөр данс, файл) — ялгах боломжгүй.
            const firstDataDay = rows.reduce<string | null>((first, r) => first === null || r.day < first ? r.day : first, null);
            const emptyAfterData = plans.filter(p => !p.rows.length && firstDataDay !== null && firstDataDay < p.week.from).map(p => p.week);
            const fileWeeks = await fileReportWeeks(db, shopId, emptyAfterData);
            const zeroWeeks = new Set(emptyAfterData.filter(w => !fileWeeks.has(`${w.from}:${w.to}`)).map(w => w.from));
            const writes = plans.filter(p => p.rows.length || zeroWeeks.has(p.week.from));
            // Мэдэгдэх төрлүүд — мөрийн result_type-аас биш, бичих тайлангуудаас (үр дүнгүй өөр зорилготой ad set
            // кампанит ажлынхаа төрөлд ордог) болон өмнөх хурлын долоо хоногоос (хүргэлт цонхноос гарсны дараах 0).
            const knownTypes = new Set<MetaResultType>();
            for (const list of [stored.filter(r => r.day < firstWeek), ...writes.map(p => p.rows)]) {
                if (!list.length) continue;
                for (const type of presentMetaResultTypes(buildMetaChannelReport({ rows: list, currency: account.currency, reach: null }).totals)) knownTypes.add(type);
            }
            // Хамгийн сүүлийн (хуралд хэрэгтэй) долоо хоногоос эхэлнэ: хугацаа дутвал хуучин долоо хоногууд өмнөх тайлангаараа үлдэнэ.
            for (const { week, rows: weekRows } of [...writes].reverse()) {
                if (metaTimeLeft(deadline) < META_INSIGHTS_WEEK_MS) break;
                let reach: MetaPeriodReach | null = { account: 0, campaigns: new Map() };
                if (weekRows.length) {
                    try { reach = await fetchMetaPeriodReach(account, token, week.from, week.dataTo, deadline); }
                    catch {
                        // Нийт хугацаа дууссан бол reach-гүй тайлан бичихгүй — дараагийн синк.
                        if (metaDeadlinePassed(deadline)) break;
                        reach = null;
                        logger.warn('[Meta insights] долоо хоногийн reach татагдсангүй', { shopId, week: week.from });
                    }
                }
                const report = buildMetaChannelReport({ rows: weekRows, currency: account.currency, reach, knownTypes, timezone: account.timezone_name });
                // API тайлан тухайн долоо хоногийн файл импортыг орлоно; файлыг API долоо хоногт хориглоно (баримт бичигт).
                const { error: reportError } = await db.from('marketing_channel_reports').upsert({
                    shop_id: shopId, source: 'meta_ads', period_from: week.from, period_to: week.to,
                    origin: 'api', data_from: week.from, data_to: week.dataTo,
                    file_name: null, content_hash: null, mapping: {}, imported_by: null, note: null,
                    totals: report.totals, breakdown: report.breakdown, warnings: report.warnings, row_count: report.rowCount,
                }, { onConflict: 'shop_id,source,period_from,period_to' });
                if (reportError) throw new Error('Хурлын долоо хоногийн Meta тайланг хадгалж чадсангүй. Сувгийн тайлангийн шинэчлэл суулгасан эсэхийг шалгана уу.');
                weeks.push(week);
            }
            if (weeks.length < writes.length) {
                partial = `Синкийн хугацаа хүрэлцээгүй тул хурлын ${writes.length} долоо хоногийн ${weeks.length}-ийн Meta тайланг (хамгийн сүүлийнхээс) шинэчиллээ; өдрийн мөрүүд хадгалагдсан, үлдсэнийг дараагийн синк нөхнө.`;
                logger.warn('[Meta insights] хугацаа дутаж долоо хоногийн тайлан дутуу шинэчлэгдсэн', { shopId, written: weeks.length, planned: writes.length });
            }
            weeks.sort((a, b) => a.from.localeCompare(b.from));
        }
        const rowCount = Number(saved) || 0;
        await recordInsightsStatus(db, {
            shop_id: shopId, account_id: accountId, last_attempt_at: started, last_success_at: new Date().toISOString(),
            last_from: from, last_to: to, last_error: partial ?? null, row_count: rowCount, weeks: weeks.length, result_source: resultFields ? 'results' : 'goal',
        });
        return { rows: rowCount, from, to, currency: account.currency, weeks, resultFields, ...(partial ? { partial } : {}) };
    } catch (failure) {
        // Нийт хугацаа дуусч Graph хүсэлт таслагдсан бол холболтын алдаа биш, хугацааны мессеж.
        const outOfTime = failure instanceof MetaApiError && metaDeadlinePassed(deadline);
        const message = outOfTime ? OUT_OF_TIME : failure instanceof Error ? failure.message : 'Meta дэлгэрэнгүй синк амжилтгүй боллоо.';
        await recordInsightsStatus(db, { shop_id: shopId, account_id: accountId, last_attempt_at: started, last_error: message.slice(0, 500) });
        throw outOfTime ? new Error(OUT_OF_TIME) : failure;
    }
}
