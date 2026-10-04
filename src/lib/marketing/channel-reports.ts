/**
 * Маркетингийн сувгийн экспорт файл → нийт дүн + хязгаартай задаргаа.
 *
 * Эх үүсвэр: Meta Ads Manager-ийн campaign хүснэгт, Facebook хуудасны Content overview,
 * CallPro-ийн «Бүлгийн тайлан» / дуудлагын жагсаалт / цагийн тайлан, масс SMS-ийн тайлан.
 * Жишээ файлгүй тул толгойг alias-аар санал болгож, хэрэглэгч баталгаажуулна (засах боломжтой).
 *
 * Дүрэм — ТААМАГЛАХГҮЙ:
 *  - Холбоогүй (эсвэл тооцож болохгүй) үзүүлэлт `totals`-д орохгүй, `missing`-д нэрлэгдэнэ — 0 биш.
 *  - Тоо биш нүд анхааруулга болно, 0 гэж тооцохгүй; хоосон нүд утгагүй (`—`).
 *  - Давхцдаг үзүүлэлт (reach, viewers, …)-ийг мөрөөр нэмэхгүй: файлын «нийт» мөр эсвэл ганц мөр.
 *  - Meta-гийн зардлыг файлын валютаар (USD) хадгалж, валютыг `totals.currency`-д тэмдэглэнэ.
 *  - Meta-гийн өөр төрлийн үр дүнг (дуудлага, постын харилцаа, хүрсэн хүн…) нэг тоонд нэмэхгүй:
 *    төрөл бүр `results_<төрөл>`, зардал нь кампанит ажлын зорилгоор `spend_<төрөл>` (`meta-results.ts`).
 *  - Хугацаагүй огноо-цагийг Улаанбаатарын цаг гэж үзнэ; offset-той бол УБ руу хөрвүүлнэ.
 *
 * Цэвэр функцууд: файл уншихгүй (сервер: `channel-reports-file.ts`), браузерт ч ашиглагдана.
 */
import { z } from 'zod';
import { reviewWeeksBetween, shiftReviewDate } from '@/lib/dashboard/weekly-review';
import {
    META_RESULT_DEFS, META_RESULT_TYPES, metaResultCost, metaResultCostKey, metaResultKey, metaResultSpendKey, metaResultTypeOf,
    type MetaResultType,
} from './meta-results';

export const CHANNEL_SOURCES = ['meta_ads', 'facebook_page', 'callpro', 'sms'] as const;
export type ChannelSource = (typeof CHANNEL_SOURCES)[number];
export const ChannelSourceSchema = z.enum(CHANNEL_SOURCES);

export const CHANNEL_SOURCE_LABELS: Record<ChannelSource, string> = {
    meta_ads: 'Meta Ads Manager',
    facebook_page: 'Facebook хуудас',
    callpro: 'CallPro дуудлага',
    sms: 'Масс SMS',
};

export const CHANNEL_SOURCE_HELP: Record<ChannelSource, string> = {
    meta_ads: 'Ads Manager → Campaigns хүснэгтийг «Export table data»-аар (.csv эсвэл .xlsx) татна. Өдрөөр задалж болно (Breakdown → By time → Day): тэгвэл нэг файлыг Лхагва–Мягмар хурлын долоо хоног бүрээр хувааж хадгална. Amount spent, Impressions, Link clicks, Clicks (all), Landing page views-ийг нэмж тооцно. Results + Result indicator баганаар үр дүнг төрлөөр нь (дуудлага, постын харилцаа, ThruPlay, хүрсэн хүн…) тусад нь гаргаж, зардлыг кампанит ажлын зорилгоор хуваарилна. Campaign ID багана байвал ижил нэртэй кампанит ажлыг ялгана. Reach (давхардалгүй хүн)-ийг өдрийн мөрүүдээс нэмж болохгүй — долоо хоногийн Reach хэрэгтэй бол тухайн 7 хоногийг өдрөөр задлалгүй, нийт мөртэй (summary row) экспортлоно.',
    facebook_page: 'Meta Business Suite → Insights → Content overview-г өдрөөр экспортлоно (.csv). Views, Viewers, 3-second views, Content interactions, Watch time, Link clicks, Visits, Follows баганууд байна.',
    callpro: 'CallPro-гоос «Бүлгийн тайлан» эсвэл дуудлагын жагсаалтыг (огноо-цаг, төлөв, дугаартай) Excel-ээр татна. Дуудлагын жагсаалт алдсан дуудлагыг цагаар гаргана.',
    sms: 'Масс SMS-ийн илгээлтийн тайлан: нэр, төлөвлөсөн, илгээсэн, алдаа (хүргэгдсэн) баганууд.',
};

export type FieldRole = 'metric' | 'label' | 'id' | 'date' | 'start' | 'end' | 'datetime' | 'time' | 'hour' | 'status' | 'phone' | 'direction' | 'currency' | 'result_type';
export type MetricKind = 'count' | 'money' | 'duration' | 'decimal' | 'percent';
/** sum = мөрөөр нэмнэ; max = хамгийн их; nonAdditive = мөрөөр нэмэхгүй (нийт мөр / ганц мөр); derived = бусдаас бодно. */
export type MetricAgg = 'sum' | 'max' | 'nonAdditive' | 'derived';
export type CallproShape = 'groups' | 'calls' | 'hourly';
export type ChannelShape = 'rows' | CallproShape;
export type BreakdownKind = 'campaign' | 'day' | 'group' | 'hour';

export interface ChannelField {
    key: string;
    label: string;
    role: FieldRole;
    kind?: MetricKind;
    agg?: MetricAgg;
    aliases: readonly string[];
    /** Зөвхөн CallPro: аль хэлбэрийн файлд хамаарах. */
    shapes?: readonly CallproShape[];
}
export interface ChannelMetricDef { key: string; label: string; kind: MetricKind }
/** Файлын толгой → талбарын түлхүүр ('' = ашиглахгүй). */
export type ChannelMapping = Record<string, string>;
/** Үзүүлэлтийн түлхүүр → тоо; Meta-д `currency` текст. */
export type ChannelTotals = Record<string, number | string>;
export interface BreakdownRow {
    kind: BreakdownKind;
    label: string;
    values: Record<string, number | null>;
    /** Meta: тухайн мөрийн үр дүнгийн төрөл (`MetaResultType`), `values.results`-ийн нэгж. */
    tag?: string;
}
export type WarningCode =
    | 'invalid_number' | 'invalid_duration' | 'invalid_date' | 'invalid_hour' | 'invalid_phone' | 'out_of_period'
    | 'non_additive' | 'no_values' | 'total_mismatch' | 'total_ignored' | 'duplicate_total' | 'mixed_currency'
    | 'unknown_currency' | 'mixed_results' | 'unknown_status' | 'unknown_direction' | 'no_direction' | 'no_time'
    | 'field_ignored' | 'unknown_field' | 'truncated' | 'partial_coverage' | 'unattributed_spend' | 'unknown_result_type';
export interface ChannelWarning {
    code: WarningCode;
    level: 'warning' | 'info';
    message: string;
    field?: string;
    count?: number;
    /** Файлын мөрийн дугаар (эхний 5). */
    rows?: number[];
}
export interface ChannelAggregate {
    source: ChannelSource;
    shape: ChannelShape;
    totals: ChannelTotals;
    breakdown: BreakdownRow[];
    warnings: ChannelWarning[];
    /** Хүлээгдэж буй боловч тооцоогүй үзүүлэлтүүд (холбоогүй эсвэл тооцох боломжгүй). */
    missing: string[];
    /** Хадгалахыг хаах алдаа (давхар холболт, шаардлагатай багана, өгөгдөлгүй). */
    errors: string[];
    /** Тооцсон мөр: дор хаяж нэг үзүүлэлт > 0 (Meta-д хүргэлтгүй хоосон мөрийг `zeroRows`-д тоолно). */
    rowCount: number;
    /** Meta: зардал, харагдалт, үр дүн бүгд 0 / хоосон мөр (нийтэд 0 нэмнэ, задаргаанд орохгүй). */
    zeroRows: number;
    excludedRows: number;
    totalRow: boolean;
    /** Файлд огноо байвал хамгийн бага/их огноо (хугацааны шүүлтээс өмнө). */
    detectedPeriod: { from: string; to: string } | null;
    /** Meta: тайлангийн хугацаа ∩ файлын огноо — өгөгдөл хамарсан өдрүүд (`data_from`/`data_to`). Тодорхойгүй бол null. */
    dataPeriod: { from: string; to: string } | null;
    /** Meta: тайлангийн хугацааны өгөгдөлгүй өдрүүд (файлын мөр огт байхгүй). */
    missingDays: string[];
    /** Огноотой бүх мөр нэг өдрийнх (өдрөөр задалсан экспорт) эсэх. */
    dailyRows: boolean;
}
export interface MetricDelta {
    current: number | null;
    previous: number | null;
    delta: number | null;
    pct: number | null;
    comparable: boolean;
    /** Харьцуулаагүй шалтгаан: валют өөр эсвэл аль нэг тайлангийн өдрийн хамралт дутуу. */
    reason?: 'currency' | 'coverage';
}
export type MappingOrigin = 'remembered' | 'mixed' | 'suggested' | 'client';
export type ChannelReportOrigin = 'file' | 'api';
/** Урьдчилан харах үеийн хадгалсан тайлан (ижил shop, эх үүсвэр, хугацаа). */
export interface ChannelExistingReport {
    id: string;
    file_name: string | null;
    updated_at: string;
    /** 'api' бол файлаар дарж бичихгүй (409). */
    origin?: ChannelReportOrigin;
    /** Яг ижил агуулгатай файлаар хадгалсан эсэх. */
    sameFile?: boolean;
    /** Хадгалсан тайлангийн өгөгдөлтэй өдрүүд (null = тодорхойгүй хуучин мөр — бүтэн хугацаа гэж үзнэ). */
    data_from?: string | null;
    data_to?: string | null;
}
/**
 * Хуваах үед долоо хоногийг анхдагчаар хадгалахгүй шалтгаан: 'api' = Meta API-аас татсан тайлан
 * (файлаар солихгүй), 'fuller' = хадгалсан файлын тайлан шинэ файлаас олон өдөр хамарсан.
 */
export type ChannelSplitSkip = 'api' | 'fuller';
/** Хурлын долоо хоногоор хуваах үеийн нэг долоо хоног. */
export interface ChannelSplitWeek {
    from: string;
    to: string;
    dataPeriod: { from: string; to: string } | null;
    missingDays: string[];
    rowCount: number;
    zeroRows: number;
    totals: ChannelTotals;
    existing: ChannelExistingReport | null;
    /** null = анхдагчаар хадгална; үгүй бол алгасах шалтгаан (хэрэглэгч 'fuller'-ийг сонгож солиулж болно). */
    skip: ChannelSplitSkip | null;
}
export interface ChannelSplitPreview {
    /** Файлын огноо (бүх долоо хоногийг хамарсан). */
    period: { from: string; to: string };
    weeks: ChannelSplitWeek[];
    /** Файлын бүх хугацааны нэгтгэл (хуваах үед урьдчилан харуулах нийт дүн). */
    result: ChannelAggregate;
}
/** POST /api/marketing/channel-reports (mode=preview) хариу. */
export interface ChannelPreviewResponse {
    mode: 'preview';
    /** false = миграци ороогүй: урьдчилан харж болно, хадгалахгүй. */
    storageReady: boolean;
    file: { name: string; size: number };
    sheets: string[];
    sheet: string;
    headerRow: number;
    headers: string[];
    sample: Record<string, string[]>;
    mapping: ChannelMapping;
    suggested: ChannelMapping;
    mappingOrigin: MappingOrigin;
    result: ChannelAggregate;
    existing: ChannelExistingReport | null;
    /** Ижил агуулгатай файлыг өөр тайланд хадгалсан бол (`pickDuplicateReport`). */
    duplicate: { id: string; source: ChannelSource; period_from: string; period_to: string } | null;
    /** Өдрөөр задалсан Meta файл нэгээс олон хурлын долоо хоног хамарвал хуваах санал. */
    split: ChannelSplitPreview | null;
}

export const CHANNEL_LIMITS = { breakdown: 100, headerScan: 20 } as const;
export const CHANNEL_PERIOD_MAX_DAYS = 92;
/** Нэг файлыг хуваах хурлын долоо хоногийн дээд тоо (~93 өдөр). */
export const CHANNEL_SPLIT_MAX_WEEKS = 14;

// ---------------------------------------------------------------------------
// Үзүүлэлтийн толь
// ---------------------------------------------------------------------------

const metric = (key: string, label: string, kind: MetricKind, agg: MetricAgg, aliases: string[], shapes?: CallproShape[]): ChannelField =>
    ({ key, label, role: 'metric', kind, agg, aliases, shapes });
const dim = (key: string, label: string, role: Exclude<FieldRole, 'metric'>, aliases: string[], shapes?: CallproShape[]): ChannelField =>
    ({ key, label, role, aliases, shapes });
const SUMMARY_SHAPES: CallproShape[] = ['groups', 'hourly'];
const ALL_SHAPES: CallproShape[] = ['groups', 'calls', 'hourly'];

interface DerivedDef { key: string; num: string; den: readonly string[]; scale: number; digits: number }
interface SourceSpec {
    fields: ChannelField[];
    /** Нийт дүнгийн бүх түлхүүр (UI-ийн дараалал, шошго, төрөл). */
    metrics: ChannelMetricDef[];
    derived: DerivedDef[];
    expected: (shape: ChannelShape) => string[];
    /** Жагсаалтад харуулах гол үзүүлэлт. */
    keyMetrics: string[];
    labelField?: string;
    breakdownKind: BreakdownKind;
}

/** Meta-гийн үр дүнгийн төрөл бүрийн үзүүлэлт: `results_<төрөл>`, `spend_<төрөл>`, `cost_per_result_<төрөл>`. */
const META_RESULT_METRICS: ChannelMetricDef[] = META_RESULT_TYPES.flatMap(type => [
    { key: metaResultKey(type), label: META_RESULT_DEFS[type].label, kind: 'count' as const },
    { key: metaResultSpendKey(type), label: `Зардал — ${META_RESULT_DEFS[type].label}`, kind: 'money' as const },
    { key: metaResultCostKey(type), label: META_RESULT_DEFS[type].costLabel, kind: 'money' as const },
]);
const META_RESULT_METRIC_KEYS = new Set(['results', 'cost_per_result', ...META_RESULT_METRICS.map(m => m.key)]);
/** Meta-гийн үр дүнгийн түлхүүр (нийт `results` ба төрөл бүрийн) — нийт дүнгийн хавтангаас тусад нь харуулна. */
export function isMetaResultMetric(key: string): boolean { return META_RESULT_METRIC_KEYS.has(key); }

const SPECS: Record<ChannelSource, SourceSpec> = {
    meta_ads: {
        fields: [
            dim('campaign', 'Кампанит ажил', 'label', ['campaign name', 'campaign', 'кампанит ажлын нэр', 'кампанит ажил', 'кампанийн нэр']),
            dim('campaign_id', 'Кампанит ажлын ID', 'id', ['campaign id', 'кампанит ажлын id', 'кампанийн id']),
            dim('reporting_starts', 'Тайлангийн эхлэх өдөр', 'start', ['reporting starts', 'reporting start', 'date start', 'start date', 'тайлан эхлэх', 'тайлангийн эхлэл', 'эхлэх огноо']),
            dim('reporting_ends', 'Тайлангийн дуусах өдөр', 'end', ['reporting ends', 'reporting end', 'date stop', 'end date', 'тайлан дуусах', 'тайлангийн төгсгөл', 'дуусах огноо']),
            dim('day', 'Өдөр (өдрөөр задалсан)', 'date', ['day', 'date', 'өдөр', 'огноо']),
            dim('currency', 'Валют', 'currency', ['currency', 'account currency', 'валют']),
            dim('result_type', 'Үр дүнгийн төрөл', 'result_type', ['result indicator', 'result type', 'үр дүнгийн төрөл', 'үр дүнгийн үзүүлэлт']),
            metric('reach', 'Reach (хүрсэн хүн)', 'count', 'nonAdditive', ['reach', 'хүртээмж', 'хүрсэн хүн', 'хүрэлт']),
            metric('impressions', 'Impressions (харагдалт)', 'count', 'sum', ['impressions', 'харагдалт', 'харуулалт']),
            metric('frequency', 'Frequency (давтамж)', 'decimal', 'derived', ['frequency', 'давтамж']),
            metric('link_clicks', 'Link clicks', 'count', 'sum', ['link clicks', 'холбоосын товшилт', 'линкийн товшилт']),
            // «Clicks (all)» — хаалтан доторхыг normalize хасдаг тул «clicks» гэж таарна.
            metric('clicks_all', 'Clicks (all) — бүх товшилт', 'count', 'sum', ['clicks', 'all clicks', 'clicks all', 'бүх товшилт', 'нийт товшилт']),
            metric('landing_page_views', 'Landing page views', 'count', 'sum', ['landing page views', 'landing page view', 'буух хуудасны үзэлт']),
            metric('page_engagement', 'Page engagement', 'count', 'sum', ['page engagement', 'хуудасны оролцоо', 'хуудасны идэвх']),
            metric('post_engagements', 'Post engagements', 'count', 'sum', ['post engagements', 'post engagement', 'нийтлэлийн оролцоо', 'постын оролцоо']),
            metric('results', 'Results (үр дүн)', 'count', 'sum', ['results', 'result', 'үр дүн']),
            metric('spend', 'Зарцуулсан дүн', 'money', 'sum', ['amount spent', 'spend', 'amount spent usd', 'зарцуулсан дүн', 'зарцуулалт']),
        ],
        metrics: [
            { key: 'reach', label: 'Reach (хүрсэн хүн)', kind: 'count' },
            { key: 'impressions', label: 'Impressions (харагдалт)', kind: 'count' },
            { key: 'frequency', label: 'Frequency (давтамж)', kind: 'decimal' },
            { key: 'link_clicks', label: 'Link clicks', kind: 'count' },
            { key: 'clicks_all', label: 'Clicks (all) — бүх товшилт', kind: 'count' },
            { key: 'landing_page_views', label: 'Landing page views', kind: 'count' },
            { key: 'page_engagement', label: 'Page engagement', kind: 'count' },
            { key: 'post_engagements', label: 'Post engagements', kind: 'count' },
            { key: 'results', label: 'Results (үр дүн)', kind: 'count' },
            { key: 'spend', label: 'Зарцуулсан дүн', kind: 'money' },
            { key: 'cpm', label: 'CPM (1000 харагдалтын өртөг)', kind: 'money' },
            { key: 'cost_per_link_click', label: 'Нэг link click-ийн өртөг', kind: 'money' },
            { key: 'ctr_link', label: 'Link CTR', kind: 'percent' },
            { key: 'cost_per_landing_page_view', label: 'Нэг landing page view-ийн өртөг', kind: 'money' },
            { key: 'cost_per_result', label: 'Нэг үр дүнгийн өртөг', kind: 'money' },
            ...META_RESULT_METRICS,
        ],
        // Нэг үр дүнгийн өртгийг төрлөөр нь `applyMetaResults` тооцно (reach 1000 хүнд, 0.01-ээс бага бол 4 орон).
        derived: [
            { key: 'frequency', num: 'impressions', den: ['reach'], scale: 1, digits: 2 },
            { key: 'cpm', num: 'spend', den: ['impressions'], scale: 1000, digits: 2 },
            { key: 'cost_per_link_click', num: 'spend', den: ['link_clicks'], scale: 1, digits: 2 },
            { key: 'ctr_link', num: 'link_clicks', den: ['impressions'], scale: 100, digits: 2 },
            { key: 'cost_per_landing_page_view', num: 'spend', den: ['landing_page_views'], scale: 1, digits: 2 },
        ],
        // Engagement, Clicks (all), Landing page views баганууд заавал биш — байхгүй бол «дутуу» гэж харуулахгүй.
        expected: () => ['spend', 'impressions', 'link_clicks', 'reach'],
        keyMetrics: ['spend', 'impressions', 'link_clicks', 'reach'],
        labelField: 'campaign',
        breakdownKind: 'campaign',
    },
    facebook_page: {
        fields: [
            dim('date', 'Огноо', 'date', ['date', 'day', 'огноо', 'өдөр']),
            metric('views', 'Views (үзэлт)', 'count', 'sum', ['views', 'үзэлт', 'нийт үзэлт']),
            metric('viewers', 'Viewers (үзэгч)', 'count', 'nonAdditive', ['viewers', 'үзэгч', 'үзэгчид', 'reach', 'хүртээмж']),
            metric('three_sec_views', '3 секундын үзэлт', 'count', 'sum', ['3 second views', '3 second video views', '3 секундын үзэлт']),
            metric('one_min_views', '1 минутын үзэлт', 'count', 'sum', ['1 minute views', '1 minute video views', '1 минутын үзэлт']),
            metric('interactions', 'Content interactions', 'count', 'sum', ['content interactions', 'interactions', 'контентын харилцаа', 'контентын оролцоо']),
            metric('watch_seconds', 'Watch time (үзсэн хугацаа)', 'duration', 'sum', ['watch time', 'үзсэн хугацаа', 'үзэлтийн хугацаа']),
            metric('views_organic', 'Органик үзэлт', 'count', 'sum', ['views from organic', 'organic views', 'органик үзэлт']),
            metric('views_ads', 'Зарын үзэлт', 'count', 'sum', ['views from ads', 'ad views', 'paid views', 'зарын үзэлт', 'сурталчилгааны үзэлт']),
            metric('link_clicks', 'Link clicks', 'count', 'sum', ['link clicks', 'холбоосын товшилт']),
            metric('visits', 'Хуудасны зочлолт', 'count', 'sum', ['visits', 'page visits', 'facebook visits', 'зочлолт', 'хуудасны зочлолт']),
            metric('follows', 'Шинэ дагагч', 'count', 'sum', ['follows', 'new follows', 'page follows', 'шинэ дагагч', 'дагасан']),
        ],
        metrics: [
            { key: 'views', label: 'Views (үзэлт)', kind: 'count' },
            { key: 'viewers', label: 'Viewers (үзэгч)', kind: 'count' },
            { key: 'three_sec_views', label: '3 секундын үзэлт', kind: 'count' },
            { key: 'one_min_views', label: '1 минутын үзэлт', kind: 'count' },
            { key: 'interactions', label: 'Content interactions', kind: 'count' },
            { key: 'watch_seconds', label: 'Watch time (үзсэн хугацаа)', kind: 'duration' },
            { key: 'views_organic', label: 'Органик үзэлт', kind: 'count' },
            { key: 'views_ads', label: 'Зарын үзэлт', kind: 'count' },
            { key: 'link_clicks', label: 'Link clicks', kind: 'count' },
            { key: 'visits', label: 'Хуудасны зочлолт', kind: 'count' },
            { key: 'follows', label: 'Шинэ дагагч', kind: 'count' },
        ],
        derived: [],
        expected: () => ['views', 'viewers', 'three_sec_views', 'interactions', 'watch_seconds', 'views_organic', 'views_ads', 'link_clicks', 'visits', 'follows'],
        keyMetrics: ['views', 'interactions', 'visits', 'follows'],
        labelField: 'date',
        breakdownKind: 'day',
    },
    callpro: {
        fields: [
            dim('group', 'Бүлэг', 'label', ['бүлэг', 'бүлгийн нэр', 'group', 'queue', 'дараалал'], ['groups', 'calls']),
            metric('selected', 'Бүлгийг сонгосон', 'count', 'sum', ['бүлгийг сонгосон', 'сонгосон', 'нийт дуудлага', 'total calls'], SUMMARY_SHAPES),
            metric('answered', 'Хариулсан', 'count', 'sum', ['хариулсан', 'хариулсан дуудлага', 'answered'], SUMMARY_SHAPES),
            metric('talk_seconds', 'Нийт ярианы хугацаа', 'duration', 'sum', ['нийт ярианы хугацаа', 'ярианы нийт хугацаа', 'ярианы хугацаа', 'total talk time', 'talk time', 'talk duration', 'call duration', 'duration', 'billsec'], ALL_SHAPES),
            metric('avg_talk_seconds', 'Ярианы дундаж хугацаа', 'duration', 'derived', ['ярианы дундаж хугацаа', 'дундаж ярианы хугацаа', 'average talk time', 'avg talk time'], SUMMARY_SHAPES),
            metric('max_wait_seconds', 'Хариулах хүртэл хамгийн удаан хүлээгдсэн', 'duration', 'max', ['дуудлагад хариулах хүртэл хамгийн удаан хүлээгдсэн хугацаа', 'хамгийн удаан хүлээгдсэн хугацаа', 'max wait time', 'longest wait time'], SUMMARY_SHAPES),
            metric('exit_with_key', 'Exit With Key', 'count', 'sum', ['exit with key', 'товчоор гарсан'], SUMMARY_SHAPES),
            metric('transferred', 'Шилжүүлсэн', 'count', 'sum', ['шилжүүлсэн', 'transferred'], SUMMARY_SHAPES),
            metric('abandoned', 'Тасалсан', 'count', 'sum', ['тасалсан', 'таслагдсан', 'abandoned'], SUMMARY_SHAPES),
            metric('missed', 'Алдсан', 'count', 'sum', ['алдсан', 'алдсан дуудлага', 'missed'], SUMMARY_SHAPES),
            metric('lost_wait_seconds', 'Хариулах хүртэл алдсан хугацаа', 'duration', 'nonAdditive', ['дуудлагад хариулах хүртэл алдсан хугацаа', 'хариулах хүртэл алдсан хугацаа'], SUMMARY_SHAPES),
            metric('timeout', 'Хугацаа хэтэрсэн', 'count', 'sum', ['хугацаа хэтэрсэн', 'timeout', 'timed out'], SUMMARY_SHAPES),
            dim('hour', 'Цаг (0–23)', 'hour', ['цаг', 'hour', 'цагийн интервал', 'interval', 'цагаар'], ['hourly']),
            dim('call_at', 'Дуудлагын огноо, цаг', 'datetime', ['огноо', 'date', 'дуудлагын огноо', 'огноо цаг', 'date time', 'datetime', 'call date', 'start time', 'эхэлсэн цаг'], ['calls']),
            dim('call_time', 'Дуудлагын цаг (тусдаа багана)', 'time', ['цаг', 'time', 'дуудлагын цаг', 'call time'], ['calls']),
            dim('status', 'Дуудлагын төлөв', 'status', ['төлөв', 'status', 'дуудлагын төлөв', 'call status', 'disposition'], ['calls']),
            dim('caller', 'Залгасан дугаар', 'phone', ['дугаар', 'залгасан дугаар', 'утасны дугаар', 'утас', 'caller', 'caller id', 'caller number', 'phone', 'number', 'src'], ['calls']),
            dim('direction', 'Чиглэл (ирсэн / гарсан)', 'direction', ['чиглэл', 'direction', 'call direction', 'дуудлагын төрөл', 'call type'], ['calls']),
        ],
        metrics: [
            { key: 'calls_total', label: 'Ирсэн дуудлага', kind: 'count' },
            { key: 'selected', label: 'Бүлгийг сонгосон', kind: 'count' },
            { key: 'answered', label: 'Хариулсан', kind: 'count' },
            { key: 'missed', label: 'Алдсан', kind: 'count' },
            { key: 'abandoned', label: 'Тасалсан', kind: 'count' },
            { key: 'answer_rate', label: 'Хариулсан хувь', kind: 'percent' },
            { key: 'other_status', label: 'Бусад төлөв', kind: 'count' },
            { key: 'unique_callers', label: 'Давхардаагүй залгагч', kind: 'count' },
            { key: 'unique_missed_callers', label: 'Алдсан/тасалсан дуудлагатай залгагч', kind: 'count' },
            { key: 'outbound_calls', label: 'Гарсан дуудлага (тооцоонд ороогүй)', kind: 'count' },
            { key: 'talk_seconds', label: 'Нийт ярианы хугацаа', kind: 'duration' },
            { key: 'avg_talk_seconds', label: 'Ярианы дундаж хугацаа', kind: 'duration' },
            { key: 'max_wait_seconds', label: 'Хариулах хүртэл хамгийн удаан хүлээгдсэн', kind: 'duration' },
            { key: 'lost_wait_seconds', label: 'Хариулах хүртэл алдсан хугацаа', kind: 'duration' },
            { key: 'exit_with_key', label: 'Exit With Key', kind: 'count' },
            { key: 'transferred', label: 'Шилжүүлсэн', kind: 'count' },
            { key: 'timeout', label: 'Хугацаа хэтэрсэн', kind: 'count' },
        ],
        derived: [
            { key: 'avg_talk_seconds', num: 'talk_seconds', den: ['answered'], scale: 1, digits: 0 },
            { key: 'answer_rate', num: 'answered', den: ['selected', 'calls_total'], scale: 100, digits: 1 },
        ],
        expected: shape => shape === 'calls'
            ? ['calls_total', 'answered', 'missed', 'abandoned', 'answer_rate', 'unique_callers', 'talk_seconds']
            : ['selected', 'answered', 'talk_seconds', 'avg_talk_seconds', 'max_wait_seconds', 'exit_with_key', 'transferred', 'abandoned', 'missed', 'lost_wait_seconds', 'timeout'],
        keyMetrics: ['answered', 'missed', 'abandoned', 'answer_rate'],
        labelField: 'group',
        breakdownKind: 'group',
    },
    sms: {
        fields: [
            dim('name', 'Нэр / кампанит ажил', 'label', ['нэр', 'name', 'кампанит ажил', 'кампанит ажлын нэр', 'campaign', 'campaign name', 'гарчиг', 'title']),
            dim('date', 'Илгээсэн огноо', 'date', ['огноо', 'date', 'илгээсэн огноо', 'send date', 'sent at']),
            metric('planned', 'Төлөвлөсөн', 'count', 'sum', ['төлөвлөсөн', 'planned', 'хүлээн авагч', 'recipients']),
            metric('sent', 'Илгээсэн', 'count', 'sum', ['илгээсэн', 'илгээгдсэн', 'sent']),
            metric('failed', 'Алдаа', 'count', 'sum', ['алдаа', 'алдаатай', 'амжилтгүй', 'failed', 'error', 'errors']),
            metric('delivered', 'Хүргэгдсэн', 'count', 'sum', ['хүргэгдсэн', 'delivered']),
        ],
        metrics: [
            { key: 'planned', label: 'Төлөвлөсөн', kind: 'count' },
            { key: 'sent', label: 'Илгээсэн', kind: 'count' },
            { key: 'failed', label: 'Алдаа', kind: 'count' },
            { key: 'delivered', label: 'Хүргэгдсэн', kind: 'count' },
            { key: 'send_rate', label: 'Илгээсэн хувь (төлөвлөснөөс)', kind: 'percent' },
            { key: 'delivery_rate', label: 'Хүргэгдсэн хувь (илгээснээс)', kind: 'percent' },
        ],
        derived: [
            { key: 'send_rate', num: 'sent', den: ['planned'], scale: 100, digits: 1 },
            { key: 'delivery_rate', num: 'delivered', den: ['sent'], scale: 100, digits: 1 },
        ],
        expected: () => ['planned', 'sent', 'failed'],
        keyMetrics: ['planned', 'sent', 'failed', 'delivered'],
        labelField: 'name',
        breakdownKind: 'campaign',
    },
};

/** Хэлбэрт хамаарах файлын талбарууд (CallPro бол хэлбэрээр шүүнэ). */
export function channelFields(source: ChannelSource, shape?: ChannelShape): ChannelField[] {
    const fields = SPECS[source].fields;
    if (source !== 'callpro' || !shape || shape === 'rows') return fields;
    return fields.filter(f => !f.shapes || f.shapes.includes(shape as CallproShape));
}
export function channelMetrics(source: ChannelSource): ChannelMetricDef[] { return SPECS[source].metrics; }
export function channelMetric(source: ChannelSource, key: string): ChannelMetricDef | undefined {
    return SPECS[source].metrics.find(m => m.key === key);
}
export function channelKeyMetrics(source: ChannelSource): string[] { return SPECS[source].keyMetrics; }
export function channelExpectedMetrics(source: ChannelSource, shape: ChannelShape): string[] { return SPECS[source].expected(shape); }

// ---------------------------------------------------------------------------
// Толгой, холболт
// ---------------------------------------------------------------------------

/** Том/жижиг үсэг, зай, тэмдэгт, диакритик, хаалтан доторх нэгжийг (USD, hh:mm:ss) үл тооно. */
export function normalizeHeader(value: unknown): string {
    return String(value ?? '')
        .normalize('NFKD').toLowerCase()
        // Латин үсгийн диакритикийг л авна (é → e); кирилл й, ё NFC-ээр буцаж нийлнэ.
        .replace(/([a-z])[\u0300-\u036f]+/g, '$1').normalize('NFC')
        .replace(/\([^)]*\)/g, ' ')
        .replace(/[_\-–—./:;,'"`*#№!?]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

const aliasIndex = new Map<ChannelSource, Map<string, ChannelField[]>>();
function aliases(source: ChannelSource): Map<string, ChannelField[]> {
    let index = aliasIndex.get(source);
    if (!index) {
        index = new Map();
        for (const field of SPECS[source].fields) {
            for (const alias of [field.key, ...field.aliases]) {
                const key = normalizeHeader(alias);
                const list = index.get(key) ?? [];
                if (!list.includes(field)) list.push(field);
                index.set(key, list);
            }
        }
        aliasIndex.set(source, index);
    }
    return index;
}

function guessCallproShape(normalized: string[]): CallproShape {
    const has = (key: string) => normalized.some(h => (aliases('callpro').get(h) ?? []).some(f => f.key === key));
    if (has('status') || (has('call_at') && has('caller'))) return 'calls';
    if (has('hour') && !has('group')) return 'hourly';
    return 'groups';
}

/** Толгой бүрийг alias-аар (тэгш тохирол) үзүүлэлттэй холбож санал болгоно. Нэг үзүүлэлтэд нэг багана. */
export function suggestMapping(headers: readonly string[], source: ChannelSource): ChannelMapping {
    const normalized = headers.map(normalizeHeader);
    const shape: ChannelShape = source === 'callpro' ? guessCallproShape(normalized) : 'rows';
    const allowed = new Set(channelFields(source, shape).map(f => f.key));
    const used = new Set<string>();
    return Object.fromEntries(headers.map((header, i) => {
        const field = (aliases(source).get(normalized[i]) ?? []).find(f => allowed.has(f.key) && !used.has(f.key));
        if (field) used.add(field.key);
        return [header, field?.key ?? ''];
    }));
}

/** Толгойн холболт (прототипийн нэр — `constructor`, `toString` — толгойд ч аюулгүй). */
export function mappedField(mapping: ChannelMapping | null | undefined, header: string): string {
    const key = mapping && Object.hasOwn(mapping, header) ? mapping[header] : '';
    return typeof key === 'string' ? key : '';
}

/**
 * Хадгалсан холболтыг шинэ файлд хэрэгжүүлж, үлдсэнийг санал болгоно. Эхлээд толгойн яг нэрээр,
 * дараа нь normalize хийсэн нэрээр таарна. Normalize нь хаалтан доторхыг хасдаг тул
 * «Results» ба «Results (initial)» нэг түлхүүрт буудаг — тэгвэл хоосон ('') холболт
 * үзүүлэлттэй холболтыг хэзээ ч дарахгүй (jsonb түлхүүрийн дарааллаас үл хамаарна).
 */
export function applyRememberedMapping(headers: readonly string[], source: ChannelSource, remembered: ChannelMapping | null | undefined) {
    const suggested = suggestMapping(headers, source);
    const valid = new Set(SPECS[source].fields.map(f => f.key));
    const exact = new Map<string, string>();
    const memory = new Map<string, string>();
    for (const [header, key] of Object.entries(remembered ?? {})) {
        if (typeof key !== 'string' || (key !== '' && !valid.has(key))) continue;
        exact.set(header, key);
        const normalized = normalizeHeader(header);
        if (!memory.has(normalized) || (key && !memory.get(normalized))) memory.set(normalized, key);
    }
    const chosen = new Map<string, string>();
    const used = new Set<string>();
    const assign = (header: string, key: string) => {
        chosen.set(header, key && !used.has(key) ? key : '');
        if (key) used.add(key);
    };
    for (const header of headers) {
        const key = exact.has(header) ? exact.get(header) : memory.get(normalizeHeader(header));
        if (key !== undefined) assign(header, key);
    }
    const hits = chosen.size;
    for (const header of headers) if (!chosen.has(header)) assign(header, mappedField(suggested, header));
    const origin: Exclude<MappingOrigin, 'client'> = !hits ? 'suggested' : hits === headers.length ? 'remembered' : 'mixed';
    return { mapping: Object.fromEntries(headers.map(header => [header, chosen.get(header) ?? ''])), origin };
}

/** Толгойн багцын тогтвортой тэмдэг (дараалал, том жижиг үсэг үл хамаарна). */
export function headerSignature(headers: readonly string[]): string {
    const text = headers.map(normalizeHeader).filter(Boolean).sort().join('\u0001');
    let hash = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) {
        hash ^= text.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return `${headers.length}:${hash.toString(16).padStart(8, '0')}`;
}

export const ChannelMappingSchema = z.record(z.string().max(300), z.string().max(64))
    .refine(value => Object.keys(value).length <= 300, 'Хэт олон багана байна.');

/** Эхний мөрүүдээс хамгийн олон alias таарсан мөрийг толгой гэж үзнэ (тайлангийн гарчиг алгасна). */
export function detectHeaderRow(matrix: readonly (readonly unknown[])[], source: ChannelSource): number {
    const index = aliases(source);
    let best = 0, bestScore = 0;
    matrix.slice(0, CHANNEL_LIMITS.headerScan).forEach((row, r) => {
        const matched = new Set(row.filter(cell => typeof cell === 'string' && index.has(normalizeHeader(cell))).map(cell => normalizeHeader(cell)));
        if (matched.size > bestScore) { best = r; bestScore = matched.size; }
    });
    return best;
}

/** Толгойн мөрөөс давхардалгүй толгой ба мөрийн объектууд үүсгэнэ. */
export function buildTable(matrix: readonly (readonly unknown[])[], headerIndex: number) {
    const width = matrix.reduce((w, row) => Math.max(w, row.length), 0);
    const headers: string[] = [];
    for (let c = 0; c < width; c++) {
        const raw = matrix[headerIndex]?.[c];
        const base = raw instanceof Date ? cellText(raw) : String(raw ?? '').trim() || `Багана ${c + 1}`;
        let name = base, n = 1;
        while (headers.includes(name)) name = `${base} (${++n})`;
        headers.push(name);
    }
    const rows = matrix.slice(headerIndex + 1).map(values => Object.fromEntries(headers.map((header, c) => [header, values[c] ?? ''])));
    // Excel-ийн мөрийн дугаар: толгой (1-ээс) + 1.
    return { headers, rows, firstLine: headerIndex + 2 };
}

/** UI-д үзүүлэх нүдний текст. */
export function cellText(value: unknown): string {
    if (value === undefined || value === null) return '';
    if (value instanceof Date) {
        if (Number.isNaN(value.getTime())) return '';
        const p = (n: number) => String(n).padStart(2, '0');
        const date = `${value.getFullYear()}-${p(value.getMonth() + 1)}-${p(value.getDate())}`;
        const time = value.getHours() || value.getMinutes() || value.getSeconds() ? ` ${p(value.getHours())}:${p(value.getMinutes())}:${p(value.getSeconds())}` : '';
        return date + time;
    }
    return String(value).trim();
}

// ---------------------------------------------------------------------------
// Нүд задлах — буруу бол 'invalid', хоосон бол null
// ---------------------------------------------------------------------------

type Parsed<T> = T | null | 'invalid';
const isBlank = (value: unknown) => value === undefined || value === null || (typeof value === 'string' && /^\s*(?:[-–—]|n\/?a)?\s*$/i.test(value));

export function parseCount(value: unknown): Parsed<number> {
    if (isBlank(value)) return null;
    if (typeof value === 'number') return Number.isFinite(value) && value >= 0 ? value : 'invalid';
    if (typeof value !== 'string') return 'invalid';
    const s = value.trim().replace(/^(?:[$€₮]|usd|mnt|eur)\s*/i, '').replace(/\s*(?:[$€₮%]|usd|mnt|eur)$/i, '');
    if (/^\d+(?:\.\d+)?$/.test(s)) return Number(s);
    if (/^\d{1,3}(?:,\d{3})+(?:\.\d+)?$/.test(s)) return Number(s.replace(/,/g, ''));
    if (/^\d{1,3}(?:[   ]\d{3})+(?:\.\d+)?$/.test(s)) return Number(s.replace(/[   ]/g, ''));
    return 'invalid';
}

const EXCEL_EPOCH = Date.UTC(1899, 11, 30);
const MAX_DURATION_SECONDS = 366 * 86400;
/** Толгойноос хугацааны нэгж: hh:mm:ss, mm:ss, секунд, минут, цаг. */
export function durationHint(header: string): { format?: 'hms' | 'ms' | 'hm'; unit?: number } {
    const h = header.toLowerCase();
    if (/hh?\s*:\s*mm\s*:\s*ss|чч\s*:\s*мм\s*:\s*сс/.test(h)) return { format: 'hms' };
    if (/mm\s*:\s*ss/.test(h)) return { format: 'ms' };
    if (/hh?\s*:\s*mm/.test(h)) return { format: 'hm' };
    // JS-ийн \b кирилл үсгийг үгийн тэмдэгт гэж үздэггүй тул монгол нэгжийг дэд мөрөөр шалгана.
    if (/сек|\bsec(?:onds?)?\b|\(s\)/.test(h)) return { unit: 1 };
    if (/мин|\bmin(?:utes?)?\b|\(m\)/.test(h)) return { unit: 60 };
    if (/\bhours?\b|\(h\)|\(цаг\)/.test(h)) return { unit: 3600 };
    return {};
}

export function parseDuration(value: unknown, hint: { format?: 'hms' | 'ms' | 'hm'; unit?: number } = {}): Parsed<number> {
    if (isBlank(value)) return null;
    let seconds: number | null = null;
    if (value instanceof Date) {
        if (Number.isNaN(value.getTime())) return 'invalid';
        seconds = (Date.UTC(value.getFullYear(), value.getMonth(), value.getDate(), value.getHours(), value.getMinutes(), value.getSeconds()) - EXCEL_EPOCH) / 1000;
    } else if (typeof value === 'number') {
        if (!Number.isFinite(value) || value < 0) return 'invalid';
        if (value === 0) return 0;
        if (!hint.unit) return 'invalid';
        seconds = value * hint.unit;
    } else if (typeof value === 'string') {
        const s = value.trim().toLowerCase();
        let m: RegExpMatchArray | null;
        if ((m = s.match(/^(\d+):([0-5]?\d):([0-5]?\d)(?:\.\d+)?$/))) seconds = Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
        else if ((m = s.match(/^(\d+):([0-5]\d)$/))) {
            if (hint.format === 'ms') seconds = Number(m[1]) * 60 + Number(m[2]);
            else if (hint.format === 'hm') seconds = Number(m[1]) * 3600 + Number(m[2]) * 60;
            else return 'invalid';
        } else if ((m = s.match(/^(?:(\d+)\s*(?:h|hr|hrs|ц|цаг)\s*)?(?:(\d+)\s*(?:m|min|мин|м)\s*)?(?:(\d+)\s*(?:s|sec|сек|с)\s*)?$/)) && (m[1] || m[2] || m[3])) {
            seconds = Number(m[1] || 0) * 3600 + Number(m[2] || 0) * 60 + Number(m[3] || 0);
        } else {
            const n = parseCount(s);
            if (n === 'invalid' || n === null) return 'invalid';
            return parseDuration(n, hint);
        }
    } else return 'invalid';
    if (seconds === null || !Number.isFinite(seconds) || seconds < 0 || seconds > MAX_DURATION_SECONDS) return 'invalid';
    return Math.round(seconds);
}

const ymd = (y: number, m: number, d: number) => {
    const date = new Date(Date.UTC(y, m - 1, d));
    if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d || y < 2000 || y > 2100) return null;
    return date.toISOString().slice(0, 10);
};

/** YYYY-MM-DD (жил-сар-өдөр дараалалтай л; 01/02/2026 шиг хоёрдмол хэлбэрийг хүлээж авахгүй). */
export function parseDay(value: unknown): Parsed<string> {
    if (isBlank(value)) return null;
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? 'invalid' : ymd(value.getFullYear(), value.getMonth() + 1, value.getDate()) ?? 'invalid';
    if (typeof value !== 'string') return 'invalid';
    const m = value.trim().match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})(?:[ T].*)?$/);
    return m ? ymd(Number(m[1]), Number(m[2]), Number(m[3])) ?? 'invalid' : 'invalid';
}

const UB_OFFSET_MS = 8 * 3600 * 1000;
/** Огноо-цаг → Улаанбаатарын өдөр, цаг. Offset-гүй текст = УБ цаг. */
export function parseDateTime(value: unknown): Parsed<{ date: string; hour: number | null }> {
    if (isBlank(value)) return null;
    if (value instanceof Date) {
        const date = parseDay(value);
        if (date === null || date === 'invalid') return 'invalid';
        const hasTime = value.getHours() || value.getMinutes() || value.getSeconds();
        return { date, hour: hasTime ? value.getHours() : null };
    }
    if (typeof value !== 'string') return 'invalid';
    const m = value.trim().match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?\s*(am|pm)?\s*(z|[+-]\d{2}:?\d{2})?)?$/i);
    if (!m) return 'invalid';
    const day = ymd(Number(m[1]), Number(m[2]), Number(m[3]));
    if (!day) return 'invalid';
    if (m[4] === undefined) return { date: day, hour: null };
    let hour = Number(m[4]);
    const minute = Number(m[5]), second = Number(m[6] ?? 0);
    if (m[7]) {
        if (hour < 1 || hour > 12) return 'invalid';
        hour = hour % 12 + (m[7].toLowerCase() === 'pm' ? 12 : 0);
    }
    if (hour > 23 || minute > 59 || second > 59) return 'invalid';
    if (!m[8]) return { date: day, hour };
    const offset = m[8].toLowerCase() === 'z' ? 0 : (m[8][0] === '-' ? -1 : 1) * (Number(m[8].slice(1, 3)) * 60 + Number(m[8].slice(-2))) * 60000;
    const ub = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), hour, minute, second) - offset + UB_OFFSET_MS);
    return { date: ub.toISOString().slice(0, 10), hour: ub.getUTCHours() };
}

/** Тусдаа «цаг» багана (09:15, 9:15 PM, Excel цаг) → 0–23. */
export function parseTimeOfDay(value: unknown): Parsed<number> {
    if (isBlank(value)) return null;
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? 'invalid' : value.getHours();
    if (typeof value !== 'string') return 'invalid';
    const m = value.trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?$/i);
    if (!m || Number(m[2]) > 59) return 'invalid';
    let hour = Number(m[1]);
    if (m[4]) { if (hour < 1 || hour > 12) return 'invalid'; hour = hour % 12 + (m[4].toLowerCase() === 'pm' ? 12 : 0); }
    return hour <= 23 ? hour : 'invalid';
}

/** Цагийн тайлангийн мөр: 9, 09, 09:00, 09:00-10:00, 9-10, 9 цаг → 9. */
export function parseHourBucket(value: unknown): Parsed<number> {
    if (isBlank(value)) return null;
    if (typeof value === 'number') return Number.isInteger(value) && value >= 0 && value <= 23 ? value : 'invalid';
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? 'invalid' : value.getHours();
    if (typeof value !== 'string') return 'invalid';
    const m = value.trim().toLowerCase().match(/^(\d{1,2})(?::00(?::00)?)?(?:\s*(?:-|–|—|to)\s*\d{1,2}(?::\d{2}(?::\d{2})?)?)?\s*(?:ц|цаг|h)?$/);
    if (!m) return 'invalid';
    const hour = Number(m[1]);
    return hour <= 23 ? hour : 'invalid';
}

type CallStatus = 'answered' | 'missed' | 'abandoned';
const STATUS_WORDS: Record<CallStatus, string[]> = {
    answered: ['хариулсан', 'холбогдсон', 'ярьсан', 'амжилттай', 'answered', 'answer', 'connected', 'completed', 'success'],
    missed: ['алдсан', 'хариулаагүй', 'завгүй', 'амжилтгүй', 'хугацаа хэтэрсэн', 'missed', 'no answer', 'noanswer', 'unanswered', 'busy', 'failed', 'timeout'],
    abandoned: ['тасалсан', 'таслагдсан', 'abandoned', 'hangup', 'hang up', 'hung up', 'cancel', 'canceled', 'cancelled'],
};
const STATUS_INDEX = new Map(Object.entries(STATUS_WORDS).flatMap(([status, words]) => words.map(w => [normalizeHeader(w), status as CallStatus] as const)));
export function classifyCallStatus(value: unknown): CallStatus | null {
    return STATUS_INDEX.get(normalizeHeader(value)) ?? null;
}
const DIRECTION_INDEX = new Map([
    ...['ирсэн', 'орж ирсэн', 'орсон', 'дотогш', 'inbound', 'incoming', 'in'].map(w => [normalizeHeader(w), 'inbound'] as const),
    ...['гарсан', 'гадагш', 'залгасан', 'outbound', 'outgoing', 'out'].map(w => [normalizeHeader(w), 'outbound'] as const),
]);

function normalizePhone(value: unknown): string | null | 'invalid' {
    if (isBlank(value)) return null;
    const digits = String(value).replace(/\D/g, '');
    const local = digits.length === 11 && digits.startsWith('976') ? digits.slice(3) : digits;
    return local.length >= 6 && local.length <= 15 ? local : 'invalid';
}

// ---------------------------------------------------------------------------
// Нэгтгэл
// ---------------------------------------------------------------------------

const TOTAL_ROW = /^(?:нийт(?: дүн)?|бүгд|дүн|total|totals|grand total|summary|results? from \d+ .+)$/;
const round = (value: number, digits = 6) => { const f = 10 ** digits; return Math.round(value * f) / f; };

interface IssueTally { count: number; rows: number[] }
class Issues {
    private map = new Map<string, IssueTally & { code: WarningCode; field?: string }>();
    add(code: WarningCode, line: number, field?: string) {
        const key = `${code}:${field ?? ''}`;
        const entry = this.map.get(key) ?? { code, field, count: 0, rows: [] };
        entry.count++;
        if (entry.rows.length < 5) entry.rows.push(line);
        this.map.set(key, entry);
    }
    entries() { return [...this.map.values()]; }
}

/** `active` = дор хаяж нэг үзүүлэлт > 0 (Meta-гийн хүргэлтгүй өдрийн мөр false). */
interface ParsedRow { line: number; label: string | null; values: Record<string, number | null>; raw: Record<string, unknown>; active: boolean }
interface CallRow extends ParsedRow { hour: number | null; status: CallStatus | null; phone: string | null; outbound: boolean }

export const SHAPE_LABELS: Record<ChannelShape, string> = { rows: 'тайлан', groups: 'бүлгийн тайлан', calls: 'дуудлагын жагсаалт', hourly: 'цагийн тайлан' };
const UNNAMED = '(нэргүй)';
const hourLabel = (hour: number) => `${String(hour).padStart(2, '0')}:00`;
const tally = (map: Map<string, number>, key: string) => map.set(key, (map.get(key) ?? 0) + 1);
const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);
const validNumbers = (rows: readonly ParsedRow[], key: string) => rows.map(r => r.values[key]).filter((v): v is number => typeof v === 'number');

function detectShape(source: ChannelSource, mapped: Map<string, string>): ChannelShape {
    if (source !== 'callpro') return 'rows';
    if (['call_at', 'call_time', 'status', 'caller', 'direction'].some(key => mapped.has(key))) return 'calls';
    if (mapped.has('hour')) return 'hourly';
    return 'groups';
}

/** Нэг тайлангийн нэгтгэлийн нийтлэг төлөв (холболт, задлагч, анхааруулга). */
class AggregateContext {
    readonly spec: SourceSpec;
    readonly fieldByKey: Map<string, ChannelField>;
    readonly mapped = new Map<string, string>();
    readonly warnings: ChannelWarning[] = [];
    readonly errors: string[] = [];
    readonly issues = new Issues();
    readonly shape: ChannelShape;
    readonly metricKeys: string[];
    readonly labelHeader?: string;
    readonly dateKeys: { start: string; end: string } | null;
    /** Meta: кампанит ажил (ID эсвэл нэр) → үр дүнгийн төрлүүд, файлын бүх мөрөөс. */
    metaTypes: Map<string, MetaResultType[]> | null = null;
    /** Meta: файлын аль нэг өдөр хүргэлттэй байсан үр дүнгийн төрлүүд (хугацааны шүүлтээс өмнө). */
    deliveredTypes: Set<MetaResultType> | null = null;
    private readonly hints: Map<string, ReturnType<typeof durationHint>>;

    constructor(readonly source: ChannelSource, mapping: ChannelMapping) {
        this.spec = SPECS[source];
        this.fieldByKey = new Map(this.spec.fields.map(f => [f.key, f]));
        const duplicates = new Map<string, string[]>();
        for (const [header, key] of Object.entries(mapping)) {
            if (!key || typeof key !== 'string') continue;
            if (!this.fieldByKey.has(key)) {
                this.warn('unknown_field', `«${header}» баганын холболт (${key}) энэ эх үүсвэрт байхгүй тул алгаслаа.`, undefined, 'info');
            } else if (this.mapped.has(key)) duplicates.set(key, [...(duplicates.get(key) ?? [this.mapped.get(key)!]), header]);
            else this.mapped.set(key, header);
        }
        for (const [key, headers] of duplicates) this.errors.push(`«${this.field(key).label}» үзүүлэлтэд ${headers.length} багана сонгосон: ${headers.join(', ')}. Нэгийг нь л үлдээнэ үү.`);

        this.shape = detectShape(source, this.mapped);
        const allowed = new Set(channelFields(source, this.shape).map(f => f.key));
        for (const key of [...this.mapped.keys()]) {
            if (allowed.has(key)) continue;
            this.warn('field_ignored', `«${this.field(key).label}» нь ${SHAPE_LABELS[this.shape]}-д хамаарахгүй тул тооцоонд ороогүй.`, key, 'info');
            this.mapped.delete(key);
        }
        this.metricKeys = [...this.mapped.keys()].filter(key => this.field(key).role === 'metric');
        if (this.shape === 'calls') {
            if (!this.mapped.has('call_at')) this.errors.push('Дуудлагын жагсаалтад «Дуудлагын огноо, цаг» баганыг сонгоно уу.');
            if (!this.mapped.has('status')) this.errors.push('Дуудлагын жагсаалтад «Дуудлагын төлөв» баганыг сонгоно уу.');
        } else if (!this.metricKeys.length) this.errors.push('Дор хаяж нэг үзүүлэлтийн баганыг сонгоно уу.');

        this.hints = new Map(this.metricKeys.filter(k => this.field(k).kind === 'duration').map(k => [k, durationHint(this.mapped.get(k)!)]));
        this.labelHeader = this.spec.labelField && source !== 'facebook_page' ? this.mapped.get(this.spec.labelField) : undefined;
        const has = (key: string) => this.mapped.has(key);
        if (source === 'meta_ads' && (has('reporting_starts') || has('reporting_ends'))) {
            this.dateKeys = { start: has('reporting_starts') ? 'reporting_starts' : 'reporting_ends', end: has('reporting_ends') ? 'reporting_ends' : 'reporting_starts' };
        } else if (source === 'meta_ads' && has('day')) this.dateKeys = { start: 'day', end: 'day' };
        else if ((source === 'facebook_page' || source === 'sms') && has('date')) this.dateKeys = { start: 'date', end: 'date' };
        else this.dateKeys = null;
    }

    field(key: string): ChannelField { return this.fieldByKey.get(key)!; }
    cell(raw: Record<string, unknown>, key: string): unknown { return raw[this.mapped.get(key)!]; }
    parseMetric(key: string, value: unknown) {
        return this.field(key).kind === 'duration' ? parseDuration(value, this.hints.get(key)) : parseCount(value);
    }
    warn(code: WarningCode, message: string, field?: string, level: ChannelWarning['level'] = 'warning') {
        this.warnings.push({ code, level, message, ...(field ? { field } : {}) });
    }
    /** Мөрийн шошго (нэр); нэргүй бол «(нэргүй)». */
    labelOf(raw: Record<string, unknown>): string | null {
        return this.labelHeader ? cellText(raw[this.labelHeader]).slice(0, 120) || UNNAMED : null;
    }
    isTotalRow(raw: Record<string, unknown>): boolean {
        const firstKey = Object.keys(raw)[0];
        return [this.labelHeader ? raw[this.labelHeader] : undefined, firstKey !== undefined ? raw[firstKey] : undefined]
            .some(v => typeof v === 'string' && TOTAL_ROW.test(normalizeHeader(v)));
    }
    /** Meta: кампанит ажлын түлхүүр — Campaign ID байвал ID, үгүй бол нэр. */
    campaignKey(raw: Record<string, unknown>): string {
        const id = this.mapped.has('campaign_id') ? cellText(this.cell(raw, 'campaign_id')) : '';
        return id ? `id:${id}` : `name:${this.labelOf(raw) ?? ''}`;
    }
    /** Мөрийн өөрийн «Result indicator»-ын төрөл (хоосон бол null). */
    indicatorType(raw: Record<string, unknown>): MetaResultType | null {
        return this.mapped.has('result_type') ? metaResultTypeOf(cellText(this.cell(raw, 'result_type'))) : null;
    }
    /**
     * Мөрийн үр дүнгийн төрөл кампанит ажлын зорилгоор: кампанит ажил нэг төрөлтэй бол тэр
     * (үр дүнгүй өдрийн зардал ч тэр төрөлд), олон төрөлтэй (давхар нэр) бол мөрийн өөрийн төрөл.
     */
    rowType(raw: Record<string, unknown>): MetaResultType | null {
        const types = this.metaTypes?.get(this.campaignKey(raw));
        if (!types?.length) return null;
        if (types.length === 1) return types[0];
        const own = this.indicatorType(raw);
        return own && types.includes(own) ? own : null;
    }
}

interface ReadResult {
    used: ParsedRow[];
    calls: CallRow[];
    totalRaw: Record<string, unknown> | null;
    excluded: number;
    period: { from: string; to: string } | null;
    /** Мөртэй өдрүүд (хугацааны шүүлтээс өмнө) — өгөгдөлгүй өдрийг илрүүлэхэд. */
    days: Set<string>;
    /** Огноотой мөр бүр нэг өдрийнх эсэх. */
    daily: boolean;
}

const MAX_SPAN_DAYS = 400;
/** [from, to] хоорондох өдрүүд (хоёр захыг оруулна). */
export function daysBetween(from: string, to: string): string[] {
    const days: string[] = [];
    for (let day = from; day <= to && days.length <= MAX_SPAN_DAYS; day = shiftReviewDate(day, 1)) days.push(day);
    return days;
}

/** Мөрүүдийг уншина: хоосон ба «нийт» мөрийг ялгаж, хугацаагаар шүүж, утгыг задална. */
function readRows(ctx: AggregateContext, rows: readonly Record<string, unknown>[], firstLine: number, period?: { from: string; to: string } | null, split = false): ReadResult {
    const result: ReadResult = { used: [], calls: [], totalRaw: null, excluded: 0, period: null, days: new Set(), daily: false };
    let dated = 0, singleDay = 0;
    const mappedHeaders = [...ctx.mapped.values()];
    const unknownStatuses = new Map<string, number>(), unknownDirections = new Map<string, number>();
    rows.forEach((raw, index) => {
        const line = firstLine + index;
        if (mappedHeaders.every(h => isBlank(raw[h]))) return;
        if (ctx.isTotalRow(raw)) {
            if (result.totalRaw) ctx.issues.add('duplicate_total', line);
            else result.totalRaw = raw;
            return;
        }
        let start: string | null = null, end: string | null = null, hour: number | null = null;
        if (ctx.dateKeys) {
            const a = parseDay(ctx.cell(raw, ctx.dateKeys.start)), b = parseDay(ctx.cell(raw, ctx.dateKeys.end));
            if (a === 'invalid' || b === 'invalid' || a === null || b === null || b < a) { ctx.issues.add('invalid_date', line, ctx.dateKeys.start); result.excluded++; return; }
            start = a; end = b;
        }
        if (ctx.shape === 'calls') {
            const at = parseDateTime(ctx.cell(raw, 'call_at'));
            if (at === null || at === 'invalid') { ctx.issues.add('invalid_date', line, 'call_at'); result.excluded++; return; }
            start = end = at.date;
            hour = at.hour;
            if (ctx.mapped.has('call_time')) {
                const time = parseTimeOfDay(ctx.cell(raw, 'call_time'));
                if (time === 'invalid') ctx.issues.add('invalid_hour', line, 'call_time');
                else if (time !== null) hour = time;
            }
        }
        if (start && end) {
            result.period = { from: !result.period || start < result.period.from ? start : result.period.from, to: !result.period || end > result.period.to ? end : result.period.to };
            dated++;
            if (start === end) { singleDay++; result.days.add(start); } else for (const day of daysBetween(start, end)) result.days.add(day);
            if (period && (start < period.from || end > period.to)) {
                // Долоо хоногоор хуваах үед бусад долоо хоногийн мөр хасагдах нь хэвийн — анхааруулахгүй.
                if (!split) ctx.issues.add('out_of_period', line);
                result.excluded++;
                return;
            }
        }
        const values: Record<string, number | null> = {};
        for (const key of ctx.metricKeys) {
            const parsed = ctx.parseMetric(key, ctx.cell(raw, key));
            if (parsed === 'invalid') ctx.issues.add(ctx.field(key).kind === 'duration' ? 'invalid_duration' : 'invalid_number', line, key);
            values[key] = parsed === 'invalid' ? null : parsed;
        }
        const label = ctx.source === 'facebook_page' ? start : ctx.labelOf(raw);
        // Meta-гийн экспорт идэвхгүй кампанит ажлыг өдөр бүр 0-ээр давтдаг: ийм мөрийг тооцсон мөрөнд оруулахгүй.
        const active = ctx.source !== 'meta_ads' || Object.values(values).some(v => typeof v === 'number' && v > 0);
        const row: ParsedRow = { line, label, values, raw, active };
        if (ctx.shape !== 'calls') { result.used.push(row); return; }

        let outbound = false;
        if (ctx.mapped.has('direction')) {
            const direction = DIRECTION_INDEX.get(normalizeHeader(ctx.cell(raw, 'direction')));
            if (!direction) { tally(unknownDirections, cellText(ctx.cell(raw, 'direction')) || '(хоосон)'); result.excluded++; return; }
            outbound = direction === 'outbound';
        }
        const statusText = cellText(ctx.cell(raw, 'status'));
        const status = classifyCallStatus(statusText);
        let phone: string | null = null;
        if (!outbound) {
            if (!status) tally(unknownStatuses, statusText || '(хоосон)');
            if (hour === null) ctx.issues.add('no_time', line);
            if (ctx.mapped.has('caller')) {
                const parsed = normalizePhone(ctx.cell(raw, 'caller'));
                if (parsed === 'invalid') ctx.issues.add('invalid_phone', line, 'caller');
                else phone = parsed;
            }
        }
        result.calls.push({ ...row, hour, status, phone, outbound });
    });
    result.daily = dated > 0 && singleDay === dated;
    for (const [text, n] of [...unknownStatuses].slice(0, 10)) ctx.warnings.push({ code: 'unknown_status', level: 'warning', count: n, message: `Тодорхойгүй төлөв «${text}» (${n} дуудлага) хариулсан/алдсан/тасалсанд ороогүй, «Бусад төлөв»-д тоологдсон.` });
    for (const [text, n] of [...unknownDirections].slice(0, 10)) ctx.warnings.push({ code: 'unknown_direction', level: 'warning', count: n, message: `Тодорхойгүй чиглэл «${text}» (${n} мөр) тооцоонд ороогүй.` });

    // Нэргүй мөр бусад мөрийн нийлбэртэй тэнцүү бол (Meta-гийн summary мөр) «нийт» мөр гэж танина.
    if (!result.totalRaw && ctx.labelHeader && ctx.shape !== 'calls' && result.used.length >= 3) {
        const sumKeys = ctx.metricKeys.filter(key => ctx.field(key).agg === 'sum');
        const candidate = result.used.find(row => row.label === UNNAMED && matchesSum(row, result.used.filter(other => other !== row), sumKeys));
        if (candidate) {
            result.totalRaw = candidate.raw;
            result.used.splice(result.used.indexOf(candidate), 1);
            ctx.warn('duplicate_total', `${candidate.line}-р нэргүй мөр бусад мөрийн нийлбэртэй тэнцүү тул «нийт» мөр гэж үзэж давхар нэмээгүй.`, undefined, 'info');
        }
    }
    return result;
}

function matchesSum(candidate: ParsedRow, others: ParsedRow[], sumKeys: string[]): boolean {
    let compared = 0, comparable = 0;
    for (const key of sumKeys) {
        const value = candidate.values[key];
        const valid = validNumbers(others, key);
        if (typeof value !== 'number' || !valid.length) continue;
        comparable++;
        if (Math.abs(value - sum(valid)) > Math.max(0.5, Math.abs(value) * 0.005)) return false;
        compared++;
    }
    return compared > 0 && compared >= Math.min(2, comparable);
}

/** Дуудлагын жагсаалт: төлөв, залгагч, цаг, бүлгээр тоолно (дугаарыг хадгалахгүй). */
function aggregateCalls(ctx: AggregateContext, calls: CallRow[], totals: ChannelTotals, breakdown: BreakdownRow[]) {
    const inbound = calls.filter(c => !c.outbound);
    const count = (status: CallStatus) => inbound.filter(c => c.status === status).length;
    Object.assign(totals, { calls_total: inbound.length, answered: count('answered'), missed: count('missed'), abandoned: count('abandoned'), other_status: inbound.filter(c => !c.status).length });
    if (ctx.mapped.has('direction')) totals.outbound_calls = calls.length - inbound.length;
    else ctx.warn('no_direction', 'Чиглэлийн (ирсэн/гарсан) багана сонгоогүй тул бүх мөрийг ирсэн дуудлага гэж тооцлоо.', undefined, 'info');
    if (ctx.mapped.has('caller')) {
        const unique = (list: CallRow[]) => new Set(list.map(c => c.phone).filter(Boolean)).size;
        totals.unique_callers = unique(inbound);
        totals.unique_missed_callers = unique(inbound.filter(c => c.status === 'missed' || c.status === 'abandoned'));
    }
    if (ctx.mapped.has('talk_seconds')) {
        const valid = validNumbers(inbound, 'talk_seconds');
        if (valid.length) totals.talk_seconds = sum(valid);
        else if (inbound.length) ctx.warn('no_values', '«Нийт ярианы хугацаа»-д хүчинтэй утга алга тул тооцоогүй.', 'talk_seconds');
    }
    const counter = (list: CallRow[]) => {
        const values: Record<string, number | null> = { calls_total: list.length, answered: 0, missed: 0, abandoned: 0 };
        for (const c of list) if (c.status) values[c.status] = (values[c.status] ?? 0) + 1;
        return values;
    };
    if (inbound.some(c => c.hour !== null)) {
        breakdown.push(...Array.from({ length: 24 }, (_, hour) => ({ kind: 'hour' as const, label: hourLabel(hour), values: counter(inbound.filter(c => c.hour === hour)) })));
    }
    if (ctx.mapped.has('group')) {
        const groups = new Map<string, CallRow[]>();
        for (const c of inbound) groups.set(c.label ?? UNNAMED, [...(groups.get(c.label ?? UNNAMED) ?? []), c]);
        breakdown.push(...[...groups].map(([label, list]) => {
            const values = counter(list);
            const talk = validNumbers(list, 'talk_seconds');
            if (talk.length) values.talk_seconds = sum(talk);
            return { kind: 'group' as const, label, values };
        }));
    }
}

/** Мөр бүр нэг campaign / өдөр / бүлэг / цаг байх тайлан. */
function aggregateSummaryRows(ctx: AggregateContext, used: ParsedRow[], totalValue: (key: string) => number | null, totals: ChannelTotals, breakdown: BreakdownRow[], daily = false) {
    for (const key of ctx.metricKeys) {
        const def = ctx.field(key);
        if (def.agg === 'derived') continue;
        const valid = validNumbers(used, key);
        const fromTotal = totalValue(key);
        if (def.agg === 'nonAdditive') {
            // Хүргэлтгүй (бүх үзүүлэлт 0) мөр хүнд хүрээгүй тул ганц идэвхтэй мөрийн утга нь давхардалгүй нийт.
            const live = used.filter(row => row.active);
            const single = live.length === 1 ? live[0].values[key] : null;
            if (fromTotal !== null) totals[key] = fromTotal;
            else if (typeof single === 'number') totals[key] = single;
            else if (valid.length) ctx.warn('non_additive', daily
                ? `«${def.label}»-ийн нийтийг тооцоогүй: өдрөөр задалсан файлын өдөр бүрийн хүмүүс давхцдаг тул нэмэхгүй. Долоо хоногийн давхардалгүй тоо хэрэгтэй бол тухайн хугацааг өдрөөр задлалгүй, нийт (summary) мөртэй экспортлоно уу.`
                : `«${def.label}»-ийн нийтийг тооцоогүй: мөр бүрийн хүмүүс давхцаж болох тул нэмэхгүй. Файлд «нийт» (summary) мөр оруулж экспортлоно уу.`,
            // Өдрөөр задалсан файлд энэ нь хэвийн (Reach-ийг «Тооцоогүй» гэж харуулна) — мэдээлэл төдий.
            key, daily ? 'info' : 'warning');
            continue;
        }
        if (!valid.length) {
            if (fromTotal !== null) totals[key] = fromTotal;
            // Заавал биш багана (Meta-гийн Landing page views г.м. 0 үед хоосон) хоосон бол мэдээлэл төдий.
            else if (used.length) ctx.warn('no_values', `«${def.label}»-д хүчинтэй утга алга тул тооцоогүй.`, key, ctx.spec.expected(ctx.shape).includes(key) ? 'warning' : 'info');
            continue;
        }
        const value = round(def.agg === 'max' ? Math.max(...valid) : sum(valid));
        totals[key] = value;
        if (fromTotal !== null && Math.abs(fromTotal - value) > Math.max(0.5, Math.abs(fromTotal) * 0.005)) {
            ctx.warn('total_mismatch', `«${def.label}»: мөрүүдийн нийлбэр ${round(value, 2)}, файлын «нийт» мөр ${round(fromTotal, 2)}. Мөрүүдийн нийлбэрийг хадгална — шүүлттэй экспорт эсэхийг шалгана уу.`, key);
        }
    }
    const group = <K>(keyOf: (row: ParsedRow) => K | null) => {
        const groups = new Map<K, ParsedRow[]>();
        for (const row of used) {
            const key = keyOf(row);
            if (key !== null) groups.set(key, [...(groups.get(key) ?? []), row]);
        }
        return [...groups];
    };
    if (ctx.shape === 'hourly') {
        const hours = group(row => {
            const hour = parseHourBucket(ctx.cell(row.raw, 'hour'));
            if (hour === null || hour === 'invalid') { ctx.issues.add('invalid_hour', row.line, 'hour'); return null; }
            return hour;
        });
        breakdown.push(...hours.sort(([a], [b]) => a - b).map(([hour, list]) => ({ kind: 'hour' as const, label: hourLabel(hour), values: groupValues(ctx, list) })));
    } else if (ctx.source === 'meta_ads') {
        if (used.some(row => row.label !== null)) breakdown.push(...metaCampaignBreakdown(ctx, used));
    } else if (used.some(row => row.label !== null)) {
        const labels = group(row => row.label);
        if (ctx.source === 'facebook_page') labels.sort(([a], [b]) => a.localeCompare(b));
        breakdown.push(...labels.map(([label, list]) => ({ kind: ctx.spec.breakdownKind, label, values: groupValues(ctx, list) })));
    }
}

/** Бодож гаргасан утгыг тоймлоно: 2 оронтой үзүүлэлт 0.01-ээс бага бол 4 орон (0 болж харагдахгүй). */
function roundDerived(value: number, digits: number): number {
    return round(value, digits >= 2 && value !== 0 && Math.abs(value) < 0.01 ? 4 : digits);
}

function groupValues(ctx: AggregateContext, list: ParsedRow[]): Record<string, number | null> {
    const values: Record<string, number | null> = {};
    for (const key of ctx.metricKeys) {
        const agg = ctx.field(key).agg;
        const valid = validNumbers(list, key);
        if (agg === 'nonAdditive' || agg === 'derived') values[key] = list.length === 1 && valid.length === 1 ? valid[0] : null;
        else values[key] = valid.length ? round(agg === 'max' ? Math.max(...valid) : sum(valid)) : null;
    }
    for (const d of ctx.spec.derived) {
        if (typeof values[d.key] === 'number') continue;
        const num = values[d.num];
        const den = d.den.map(k => values[k]).find(v => typeof v === 'number');
        if (typeof num === 'number' && typeof den === 'number' && den > 0) values[d.key] = roundDerived(num / den * d.scale, d.digits);
        else if (d.key in values) values[d.key] = null;
    }
    return values;
}

const orderTypes = (types: Iterable<MetaResultType>) => { const set = new Set(types); return META_RESULT_TYPES.filter(type => set.has(type)); };

/**
 * Meta: кампанит ажил бүрийн үр дүнгийн төрлийг файлын БҮХ мөрөөс (хугацааны шүүлтээс өмнө)
 * тогтооно — эхлээд Results > 0 мөрийн «Result indicator», тийм мөргүй бол хоосон биш ямар ч indicator.
 * Тиймээс үр дүнгүй өдрийн зардал ч, өөр долоо хоногт үр дүн гарсан кампанит ажлын зардал ч зорилгоороо хуваарилагдана.
 */
function metaCampaignTypes(ctx: AggregateContext, rows: readonly Record<string, unknown>[]): Map<string, MetaResultType[]> {
    const withResults = new Map<string, Set<MetaResultType>>(), any = new Map<string, Set<MetaResultType>>();
    const add = (map: Map<string, Set<MetaResultType>>, key: string, type: MetaResultType) => map.set(key, (map.get(key) ?? new Set()).add(type));
    for (const raw of rows) {
        const type = ctx.indicatorType(raw);
        if (!type || ctx.isTotalRow(raw)) continue;
        const key = ctx.campaignKey(raw);
        add(any, key, type);
        const results = ctx.mapped.has('results') ? parseCount(ctx.cell(raw, 'results')) : null;
        if (typeof results === 'number' && results > 0) add(withResults, key, type);
    }
    return new Map([...any].map(([key, types]) => [key, orderTypes(withResults.get(key) ?? types)]));
}

/** Meta: файлын бүх мөрөөс (хугацааны шүүлтээс өмнө) хүргэлттэй (аль нэг үзүүлэлт > 0) мөрийн үр дүнгийн төрлүүд. */
function metaDeliveredTypes(ctx: AggregateContext, rows: readonly Record<string, unknown>[]): Set<MetaResultType> {
    const types = new Set<MetaResultType>();
    const mappedHeaders = [...ctx.mapped.values()];
    for (const raw of rows) {
        if (mappedHeaders.every(h => isBlank(raw[h])) || ctx.isTotalRow(raw)) continue;
        const type = ctx.rowType(raw);
        if (!type || types.has(type)) continue;
        if (ctx.metricKeys.some(key => { const value = ctx.parseMetric(key, ctx.cell(raw, key)); return typeof value === 'number' && value > 0; })) types.add(type);
    }
    return types;
}

/**
 * Meta-гийн кампанит ажлын задаргаа: кампанит ажил (ID эсвэл нэр) × үр дүнгийн төрөл. Хүргэлтгүй
 * кампанит ажлыг хасаж, зардлаар (их → бага) эрэмбэлнэ. Үр дүн нь `tag` төрлийн нэгжээр; хүрсэн хүн
 * (reach) олон мөртэй бол давхцдаг тул null.
 */
function metaCampaignBreakdown(ctx: AggregateContext, used: ParsedRow[]): BreakdownRow[] {
    const typed = ctx.mapped.has('result_type');
    const groups = new Map<string, { label: string; type: MetaResultType | null; rows: ParsedRow[] }>();
    for (const row of used) {
        if (!row.active) continue;
        const type = typed ? ctx.rowType(row.raw) : null;
        const key = `${ctx.campaignKey(row.raw)}\u0001${type ?? ''}`;
        const group = groups.get(key) ?? { label: row.label ?? UNNAMED, type, rows: [] };
        group.rows.push(row);
        groups.set(key, group);
    }
    const delivery = ['spend', 'impressions', 'results'].filter(key => ctx.mapped.has(key));
    const rows: BreakdownRow[] = [];
    for (const { label, type, rows: list } of groups.values()) {
        const values: Record<string, number | null> = {};
        for (const key of ctx.metricKeys) {
            if (key === 'results') continue;
            const agg = ctx.field(key).agg;
            const valid = validNumbers(list, key);
            values[key] = agg === 'nonAdditive' || agg === 'derived' ? (list.length === 1 && valid.length === 1 ? valid[0] : null) : valid.length ? round(sum(valid)) : null;
        }
        if (ctx.mapped.has('results')) {
            const valid = validNumbers(list, 'results');
            if (type && META_RESULT_DEFS[type].nonAdditive) values.results = list.length === 1 ? valid[0] ?? null : null;
            else if (type) values.results = round(sum(valid));
            // Төрөлгүй бол олон мөрийг нэмэхгүй (хүрсэн хүн байж болно) — ганц мөрийнх л.
            else values.results = !typed && list.length === 1 ? valid[0] ?? null : null;
            values.cost_per_result = type ? metaResultCost(type, values.spend, values.results) : !typed ? metaResultCost('other', values.spend, values.results) : null;
        }
        if (delivery.length && !delivery.some(key => (values[key] ?? 0) > 0)) continue;
        rows.push({ kind: 'campaign', label, values, ...(type ? { tag: type } : {}) });
    }
    return rows.sort((a, b) => (b.values.spend ?? -1) - (a.values.spend ?? -1) || a.label.localeCompare(b.label));
}

/**
 * Meta: үр дүнг төрлөөр нь — `results_<төрөл>`, кампанит ажлын зорилгоор хуваарилсан `spend_<төрөл>`,
 * `cost_per_result_<төрөл>`. Нийт `results`/`cost_per_result` зөвхөн нэг л төрөл байхад (хуучин түлхүүр).
 * Хүрсэн хүн (reach)-ийг өдөр, кампаниар нэмэхгүй: файлын «нийт» мөр эсвэл ганц мөрөөс л.
 */
function applyMetaResults(ctx: AggregateContext, used: ParsedRow[], totalValue: (key: string) => number | null, totals: ChannelTotals) {
    if (ctx.source !== 'meta_ads' || (!ctx.mapped.has('results') && !ctx.mapped.has('result_type'))) return;
    const hasSpend = ctx.mapped.has('spend'), hasResults = ctx.mapped.has('results');
    delete totals.cost_per_result;
    if (!ctx.mapped.has('result_type')) {
        // Төрөлгүй бол олон мөрийн Results-ийг нэмэхгүй (дуудлага, постын оролцоо, хүрсэн хүн… нийлж болно):
        // файлын «нийт» мөр (Meta зөвхөн нэг төрөлтэй үед бөглөдөг) эсвэл ганц идэвхтэй мөрийнх л.
        delete totals.results;
        if (!hasResults) return;
        const live = used.filter(row => row.active);
        const results = totalValue('results') ?? (live.length === 1 ? live[0].values.results ?? null : null);
        if (typeof results === 'number') {
            totals.results = results;
            const cost = metaResultCost('other', typeof totals.spend === 'number' ? totals.spend : null, results);
            if (cost !== null) totals.cost_per_result = cost;
            ctx.warn('unknown_result_type', '«Result indicator» багана сонгоогүй тул Results-ийн төрөл тодорхойгүй.', 'results', 'info');
        } else if (validNumbers(live, 'results').length) {
            ctx.warn('unknown_result_type', '«Result indicator» багана сонгоогүй тул Results-ийн нийтийг тооцоогүй: өөр төрлийн үр дүн (дуудлага, постын оролцоо, хүрсэн хүн…) нэг тоонд нийлэх тул нэмэхгүй. «Result indicator» баганыг «Үр дүнгийн төрөл»-д холбоно уу.', 'results');
        }
        return;
    }
    delete totals.results;
    const live = used.filter(row => row.active).map(row => ({ row, type: ctx.rowType(row.raw) }));
    const present = META_RESULT_TYPES.filter(type => live.some(item => item.type === type));
    for (const type of present) {
        const def = META_RESULT_DEFS[type];
        const list = live.filter(item => item.type === type).map(item => item.row);
        const spend = hasSpend ? round(sum(validNumbers(list, 'spend'))) : null;
        if (spend !== null) totals[metaResultSpendKey(type)] = spend;
        let results: number | null = null;
        if (hasResults && !def.nonAdditive) results = round(sum(validNumbers(list, 'results')));
        else if (hasResults) {
            results = list.length === 1 ? list[0].values.results ?? null : present.length === 1 ? totalValue('results') : null;
            if (results === null) ctx.warn('non_additive', `«${def.label}»-ийг тооцоогүй: өдөр, кампанит ажлын хүрсэн хүн давхцдаг тул нэмэхгүй (зардлыг нь харуулав). Давхардалгүй тоог өдрөөр задлаагүй, нийт мөртэй экспорт эсвэл Meta API өгнө.`, metaResultKey(type), 'info');
        }
        if (results !== null) totals[metaResultKey(type)] = results;
        const cost = metaResultCost(type, spend, results);
        if (cost !== null) totals[metaResultCostKey(type)] = cost;
    }
    // Файлд хүргэлттэй боловч энэ хугацаанд идэвхгүй төрөл = 0 (өртөггүй): долоо хоногийн тайлан
    // «0 дуудлага» гэж харуулж, дараагийн долоо хоногийг 0-ээс харьцуулна. Хүрсэн хүний тоог (давхцдаг) бичихгүй.
    for (const type of META_RESULT_TYPES) {
        if (present.includes(type) || !ctx.deliveredTypes?.has(type)) continue;
        if (hasSpend) totals[metaResultSpendKey(type)] = 0;
        if (hasResults && !META_RESULT_DEFS[type].nonAdditive) totals[metaResultKey(type)] = 0;
    }
    if (present.length === 1) {
        const [type] = present;
        const results = totals[metaResultKey(type)], cost = totals[metaResultCostKey(type)];
        if (typeof results === 'number') totals.results = results;
        if (typeof cost === 'number') totals.cost_per_result = cost;
    } else if (present.length > 1) {
        ctx.warn('mixed_results', `Results нь ${present.length} төрлийн үр дүнтэй (${present.map(type => META_RESULT_DEFS[type].label).join(', ')}) тул нэг тоонд нэмээгүй — төрөл бүрийг тусад нь, зардлыг кампанит ажлын зорилгоор хуваарилж харуулав.`, 'results', 'info');
    }
    const unattributed = live.filter(item => !item.type && (item.row.values.spend ?? 0) > 0).map(item => item.row);
    if (hasSpend && unattributed.length && present.length) {
        const campaigns = new Set(unattributed.map(row => ctx.campaignKey(row.raw))).size;
        ctx.warn('unattributed_spend', `Үр дүнгийн төрөлгүй (Result indicator хоосон) ${campaigns} кампанит ажлын ${round(sum(validNumbers(unattributed, 'spend')), 2)} зардал төрлийн зардалд ороогүй — нийт зардалд орсон.`, 'spend', 'info');
    }
}

/** Meta: валютыг тэмдэглэнэ, өөр валютын мөнгөн дүнг хөрвүүлж нэмэхгүй. */
function applyMetaCurrency(ctx: AggregateContext, used: ParsedRow[], totals: ChannelTotals) {
    if (ctx.source !== 'meta_ads' || !ctx.mapped.has('spend')) return;
    const fromHeader = /\(([A-Za-z]{3})\)/.exec(ctx.mapped.get('spend')!)?.[1]?.toUpperCase();
    const fromRows = ctx.mapped.has('currency') ? used.map(r => cellText(ctx.cell(r.raw, 'currency')).toUpperCase()).filter(v => /^[A-Z]{3}$/.test(v)) : [];
    const currencies = new Set([...(fromHeader ? [fromHeader] : []), ...fromRows]);
    if (currencies.size > 1) {
        for (const m of ctx.spec.metrics) if (m.kind === 'money') delete totals[m.key];
        ctx.warn('mixed_currency', `Файлд өөр өөр валют байна (${[...currencies].join(', ')}). Зардлыг хөрвүүлж нэмэхгүй — нэг дансны, нэг валютын тайлан экспортлоно уу.`);
    } else if (currencies.size === 1) totals.currency = [...currencies][0];
    else if ('spend' in totals) ctx.warn('unknown_currency', 'Зардлын валют тодорхойгүй. «Amount spent (USD)» гэх мэт валюттай толгойгоор экспортлох эсвэл Currency багана сонгоно уу.');
}

/** Дараалсан өдрүүдийг хугацаа болгож бичнэ: «2026-08-26 – 2026-08-29, 2026-09-29». */
export function formatDayRanges(days: readonly string[]): string {
    const ranges: Array<[string, string]> = [];
    for (const day of [...days].sort()) {
        const last = ranges[ranges.length - 1];
        if (last && shiftReviewDate(last[1], 1) === day) last[1] = day;
        else ranges.push([day, day]);
    }
    return ranges.map(([from, to]) => from === to ? from : `${from} – ${to}`).join(', ');
}

const ISSUE_MESSAGES: Partial<Record<WarningCode, (label: string) => string>> = {
    invalid_number: label => `«${label}»: тоо биш нүд тооцоонд ороогүй (0 гэж тооцоогүй).`,
    invalid_duration: label => `«${label}»: хугацааг уншиж чадаагүй (hh:mm:ss хэлбэрээр, эсвэл толгойд нэгжийг (сек/мин) заана уу).`,
    invalid_date: () => 'Огноо буруу (YYYY-MM-DD хэлбэр шаардлагатай) мөрүүдийг хассан.',
    invalid_hour: () => 'Цагийг уншиж чадаагүй мөрүүд цагийн задаргаанд ороогүй.',
    invalid_phone: () => 'Утасны дугаар буруу мөрүүд давхардаагүй залгагчийн тоонд ороогүй.',
    out_of_period: () => 'Сонгосон хугацаанаас гадуурх мөрүүдийг хассан.',
    duplicate_total: () => 'Нэгээс олон «нийт» мөр байна. Эхнийхийг л ашигласан.',
    no_time: () => 'Цаггүй дуудлагууд цагийн задаргаанд ороогүй (нийт тоонд орсон).',
};

/**
 * Файлын мөрүүдийг холболтоор нэгтгэнэ. `period` өгвөл огноотой мөрийг хугацаагаар шүүнэ
 * (хамаарахгүй мөрийг хасаж анхааруулна; `split` үед анхааруулахгүй). `firstLine` — анхааруулгын мөрийн дугаарт.
 */
export function aggregateChannelReport(
    rows: readonly Record<string, unknown>[],
    mapping: ChannelMapping,
    source: ChannelSource,
    options: { period?: { from: string; to: string } | null; firstLine?: number; breakdownLimit?: number; split?: boolean } = {},
): ChannelAggregate {
    const ctx = new AggregateContext(source, mapping);
    if (source === 'meta_ads' && ctx.mapped.has('result_type')) {
        ctx.metaTypes = metaCampaignTypes(ctx, rows);
        ctx.deliveredTypes = metaDeliveredTypes(ctx, rows);
    }
    const read = readRows(ctx, rows, options.firstLine ?? 2, options.period, options.split);
    const totals: ChannelTotals = {};
    const breakdown: BreakdownRow[] = [];
    // Хасагдсан мөр байвал файлын «нийт» мөр шүүсэн мөрүүдтэй таарахгүй.
    const total = read.excluded === 0 ? read.totalRaw : null;
    if (read.totalRaw && !total) {
        // Долоо хоногоор хуваах үед файлын «нийт» мөр бүх хугацааных тул ашиглахгүй нь хэвийн — мэдээлэл төдий.
        if (options.split) ctx.warn('total_ignored', 'Файлын «нийт» мөр бүх хугацааных тул долоо хоногийн дүнд ашиглаагүй (мөрүүдийн нийлбэрээр).', undefined, 'info');
        else ctx.warn('total_ignored', 'Файлын «нийт» мөрийг ашиглаагүй: хугацаанаас гадуур эсвэл огноо буруу мөр хасагдсан тул нийт мөр шүүсэн мөрүүдтэй тохирохгүй.');
    }
    const totalValue = (key: string) => {
        if (!total || !ctx.mapped.has(key)) return null;
        const parsed = ctx.parseMetric(key, ctx.cell(total, key));
        return parsed === 'invalid' ? null : parsed;
    };

    if (ctx.shape === 'calls') aggregateCalls(ctx, read.calls, totals, breakdown);
    else aggregateSummaryRows(ctx, read.used, totalValue, totals, breakdown, read.daily);
    applyMetaResults(ctx, read.used, totalValue, totals);
    applyMetaCurrency(ctx, read.used, totals);

    // Бодож гаргах үзүүлэлт: нийт дүнгээс; эс бөгөөс файлын «нийт» мөр эсвэл ганц (идэвхтэй) мөр.
    const live = read.used.filter(row => row.active);
    for (const d of ctx.spec.derived) {
        const num = totals[d.num];
        const den = d.den.map(k => totals[k]).find(v => typeof v === 'number');
        if (typeof num === 'number' && typeof den === 'number' && den > 0) totals[d.key] = roundDerived(num / den * d.scale, d.digits);
        else if (ctx.mapped.has(d.key)) {
            const value = totalValue(d.key) ?? (live.length === 1 ? live[0].values[d.key] : null);
            if (typeof value === 'number') totals[d.key] = value;
        }
    }

    const limit = options.breakdownLimit ?? CHANNEL_LIMITS.breakdown;
    const bounded: BreakdownRow[] = [];
    for (const kind of new Set(breakdown.map(r => r.kind))) {
        const list = breakdown.filter(r => r.kind === kind);
        if (list.length > limit) ctx.warn('truncated', `Задаргааны эхний ${limit} мөрийг хадгална (нийт ${list.length}). Нийт дүнд бүх мөр орсон.`, undefined, 'info');
        bounded.push(...list.slice(0, limit));
    }
    for (const issue of ctx.issues.entries()) {
        const label = issue.field ? ctx.fieldByKey.get(issue.field)?.label ?? issue.field : '';
        const more = issue.count > issue.rows.length ? ', …' : '';
        ctx.warnings.push({ code: issue.code, level: 'warning', field: issue.field, count: issue.count, rows: issue.rows, message: `${ISSUE_MESSAGES[issue.code]?.(label) ?? issue.code} (${issue.count} мөр: ${issue.rows.join(', ')}${more})` });
    }
    const rowCount = ctx.shape === 'calls' ? read.calls.length : live.length;
    const zeroRows = ctx.shape === 'calls' ? 0 : read.used.length - live.length;
    if (!rowCount && !zeroRows && !ctx.errors.length) ctx.errors.push(options.period && read.excluded ? 'Сонгосон хугацаанд хамаарах өгөгдөлтэй мөр алга. Хугацаа эсвэл файлаа шалгана уу.' : 'Өгөгдөлтэй мөр олдсонгүй.');

    // Meta: тайлангийн хугацааны аль өдрүүдэд файлын мөр байгаа (өдрийн мөр 0 байсан ч өгөгдөл мөн).
    let dataPeriod: { from: string; to: string } | null = null;
    let missingDays: string[] = [];
    if (source === 'meta_ads' && read.period) {
        const window = options.period ?? read.period;
        const from = window.from > read.period.from ? window.from : read.period.from;
        const to = window.to < read.period.to ? window.to : read.period.to;
        dataPeriod = from <= to ? { from, to } : null;
        if (options.period && dataPeriod) {
            missingDays = daysBetween(options.period.from, options.period.to).filter(day => !read.days.has(day));
            const days = periodDays(options.period);
            if (missingDays.length) ctx.warn('partial_coverage', `Тайлангийн ${days} өдрөөс ${days - missingDays.length}-д л өгөгдөл байна — өгөгдөлгүй: ${formatDayRanges(missingDays)}. Бүтэн долоо хоногтой шууд харьцуулахгүй.`);
        }
    }

    return {
        source, shape: ctx.shape, totals, breakdown: bounded, warnings: ctx.warnings, errors: ctx.errors,
        missing: ctx.spec.expected(ctx.shape).filter(key => !(key in totals)),
        rowCount, zeroRows, excludedRows: read.excluded, totalRow: !!read.totalRaw, detectedPeriod: read.period,
        dataPeriod, missingDays, dailyRows: read.daily,
    };
}

/**
 * Өдрөөр задалсан Meta файл нэгээс олон хурлын долоо хоног (Лхагва–Мягмар) хамарвал тэдгээр долоо
 * хоног (файлын огноогоор); хуваах боломжгүй бол [].
 */
export function channelSplitWeeks(result: Pick<ChannelAggregate, 'source' | 'dailyRows' | 'detectedPeriod'>): Array<{ from: string; to: string }> {
    if (result.source !== 'meta_ads' || !result.dailyRows || !result.detectedPeriod) return [];
    const weeks = reviewWeeksBetween(result.detectedPeriod.from, result.detectedPeriod.to);
    return weeks.length > 1 && weeks.length <= CHANNEL_SPLIT_MAX_WEEKS ? weeks : [];
}

/**
 * Файлыг хурлын долоо хоног бүрээр тусад нь нэгтгэнэ (кампанит ажлын задаргаа ч долоо хоногоор;
 * үр дүнгийн төрлийг бүх файлаас). Мөргүй долоо хоногийг алгасна.
 */
export function aggregateByReviewWeeks(
    rows: readonly Record<string, unknown>[],
    mapping: ChannelMapping,
    source: ChannelSource,
    weeks: ReadonlyArray<{ from: string; to: string }>,
    options: { firstLine?: number; breakdownLimit?: number } = {},
): Array<{ week: { from: string; to: string }; result: ChannelAggregate }> {
    return weeks
        .map(week => ({ week, result: aggregateChannelReport(rows, mapping, source, { ...options, period: week, split: true }) }))
        .filter(({ result }) => result.rowCount + result.zeroRows > 0);
}

/**
 * Хуваах үед долоо хоногийг анхдагчаар хадгалахгүй шалтгаан. Meta API-ийн тайланг файлаар солихгүй ('api').
 * Хадгалсан файлын тайлангийн өдрүүдийг шинэ файл бүрэн хамраагүй бол ('fuller') хадгалсныг үлдээнэ —
 * жишээ нь «сүүлийн 30 хоног»-ийн экспорт долоо хоногийн дундаас эхэлдэг тул өмнө 7/7-оор хадгалсан
 * долоо хоногийг 2/7-оор дарахгүй. Хадгалсан тайлангийн хамралт тодорхойгүй (хуучин мөр) бол бүтэн долоо хоног.
 */
export function splitWeekSkip(week: { from: string; to: string }, dataPeriod: { from: string; to: string } | null, existing: ChannelExistingReport | null): ChannelSplitSkip | null {
    if (!existing) return null;
    if (existing.origin === 'api') return 'api';
    if (existing.sameFile) return null;
    const saved = existing.data_from && existing.data_to ? { from: existing.data_from, to: existing.data_to } : week;
    return !dataPeriod || dataPeriod.from > saved.from || dataPeriod.to < saved.to ? 'fuller' : null;
}

/** Урьдчилан харах долоо хоногийн товч (нийт дүн, хамралт, хадгалсан тайлан, алгасах шалтгаан). */
export function splitWeekSummary(week: { from: string; to: string }, result: ChannelAggregate, existing: ChannelExistingReport | null = null): ChannelSplitWeek {
    return {
        from: week.from, to: week.to, dataPeriod: result.dataPeriod, missingDays: result.missingDays,
        rowCount: result.rowCount, zeroRows: result.zeroRows, totals: result.totals, existing,
        skip: splitWeekSkip(week, result.dataPeriod, existing),
    };
}

/**
 * Ижил агуулгатай (content hash) өөр хадгалсан тайлан. Огноотой мөртэй файлыг өөр хугацаанд дахин
 * ашиглах нь хэвийн (мөрүүд хугацаагаар шүүгдэнэ — нэг өдрийн Meta файлыг хэд хэдэн долоо хоногт)
 * тул ИЖИЛ хугацааны өөр эх үүсвэрийг л; огноогүй файлыг (CallPro бүлгийн тайлан, огноогүй SMS)
 * өөр хугацаанд дахин оруулбал ч мэдэгдэнэ. Ижил эх үүсвэр, хугацааны мөр нь «хадгалсан тайлан» (давхар биш).
 */
export function pickDuplicateReport<T extends { source: string; period_from: string; period_to: string }>(
    rows: readonly T[],
    target: { source: ChannelSource; period: { from: string; to: string }; dated: boolean },
): T | null {
    return rows.find(row => {
        const samePeriod = row.period_from === target.period.from && row.period_to === target.period.to;
        if (samePeriod) return row.source !== target.source;
        return !target.dated;
    }) ?? null;
}

/** Цагийн задаргаанаас хамгийн их алдсан + тасалсан дуудлагатай цагууд (оргил). */
export function peakMissedHours(breakdown: readonly BreakdownRow[], top = 3): Array<{ label: string; missed: number }> {
    return breakdown.filter(r => r.kind === 'hour')
        .map(r => ({ label: r.label, missed: (r.values.missed ?? 0) + (r.values.abandoned ?? 0) }))
        .filter(r => r.missed > 0)
        .sort((a, b) => b.missed - a.missed || a.label.localeCompare(b.label))
        .slice(0, top);
}

// ---------------------------------------------------------------------------
// Харьцуулалт, форматлах
// ---------------------------------------------------------------------------

/**
 * Үзүүлэлт бүрийн өөрчлөлт. Суурь (өмнөх) байхгүй эсвэл 0 бол хувь null; валют өөр бол
 * мөнгөн үзүүлэлтийг харьцуулахгүй (`comparable: false`). Аль нэг тайлангийн өдрийн хамралт
 * дутуу (`partialCoverage`) бол ямар ч үзүүлэлтийг харьцуулахгүй — 6 өдрийг 7 өдөртэй тулгахгүй.
 * Meta-гийн үр дүнгийн төрөл бүрийн түлхүүр (`results_<төрөл>`, …) ч харьцуулалтад орно.
 */
export function compareWithPrevious(
    current: ChannelTotals,
    previous: ChannelTotals | null | undefined,
    source?: ChannelSource,
    options: { partialCoverage?: boolean } = {},
): Record<string, MetricDelta> {
    const money = new Set((source ? SPECS[source].metrics : Object.values(SPECS).flatMap(s => s.metrics)).filter(m => m.kind === 'money').map(m => m.key));
    const order = source ? SPECS[source].metrics.map(m => m.key) : [];
    const keys = [...new Set([...Object.keys(current), ...Object.keys(previous ?? {})])]
        .filter(key => typeof current[key] === 'number' || typeof previous?.[key] === 'number')
        .sort((a, b) => (order.indexOf(a) + 1 || 999) - (order.indexOf(b) + 1 || 999));
    const sameCurrency = (current.currency ?? null) === (previous?.currency ?? null);
    const result: Record<string, MetricDelta> = {};
    for (const key of keys) {
        const c = typeof current[key] === 'number' ? current[key] as number : null;
        const p = typeof previous?.[key] === 'number' ? previous[key] as number : null;
        const reason = options.partialCoverage && p !== null ? 'coverage' : money.has(key) && !sameCurrency ? 'currency' : undefined;
        const comparable = !reason;
        const delta = c !== null && p !== null && comparable ? round(c - p) : null;
        const pct = delta !== null && p !== null && p > 0 ? Math.round(delta / p * 1000) / 10 : null;
        result[key] = { current: c, previous: p, delta, pct, comparable, ...(reason ? { reason } : {}) };
    }
    return result;
}

export function formatDuration(seconds: number): string {
    const s = Math.round(seconds);
    const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), sec = s % 60;
    return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

export function formatChannelValue(value: number | null | undefined, kind: MetricKind, currency?: string | null): string {
    if (value === null || value === undefined || !Number.isFinite(value)) return '—';
    const n = (digits: number) => new Intl.NumberFormat('mn-MN', { maximumFractionDigits: digits }).format(value);
    switch (kind) {
        case 'duration': return formatDuration(value);
        case 'percent': return `${n(1)}%`;
        case 'decimal': return n(2);
        // 0.01-ээс бага өртгийг (постын оролцоо ~0.0037 USD) 0 болгож харуулахгүй — 4 орон хүртэл.
        case 'money': return `${n(value !== 0 && Math.abs(value) < 0.01 ? 4 : 2)}${currency ? ` ${currency}` : ''}`;
        default: return n(2);
    }
}

/** Хугацааны шалгалт: YYYY-MM-DD, эхлэл ≤ төгсгөл, 93 хүртэл өдөр (92 өдрийн зөрүү). */
export const ChannelPeriodSchema = z.object({
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
}).refine(({ from, to }) => {
    const a = Date.parse(`${from}T00:00:00Z`), b = Date.parse(`${to}T00:00:00Z`);
    return Number.isFinite(a) && Number.isFinite(b) && new Date(a).toISOString().slice(0, 10) === from && new Date(b).toISOString().slice(0, 10) === to
        && b >= a && (b - a) / 86_400_000 <= CHANNEL_PERIOD_MAX_DAYS;
}, 'Хугацаа буруу: эхлэх өдөр дуусахаас өмнө, 93 хүртэл өдөр байна.');

export function periodDays(period: { from: string; to: string }): number {
    return Math.round((Date.parse(`${period.to}T00:00:00Z`) - Date.parse(`${period.from}T00:00:00Z`)) / 86_400_000) + 1;
}
