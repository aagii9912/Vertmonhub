/**
 * Хиймэл Meta Ads Manager-ийн Campaigns экспорт (Breakdown → By time → Day) — бодит экспортын 27 багана,
 * дараалал, хэлбэртэй ижил боловч бүх нэр, тоо зохиомол. `.csv` файл git-д ордоггүй (бодит өгөгдлийн
 * хамгаалалт) тул тестүүд энэ модулийн текстийг ашиглана.
 *
 * 2026-09-12 – 2026-09-24 (13 өдөр, шинэ өдөр эхэнд), өдөр бүр 9 кампанит ажлын мөр:
 *  - дуудлага (үр дүнгүй өдрүүдэд indicator хоосон ч зардалтай; 09-15-нд 0 зардалтай 1 дуудлага),
 *  - постын харилцаа, постын оролцоо (0.01-ээс бага өртөг), ThruPlay, хүрсэн хүн (Results = Reach),
 *  - ижил нэртэй 2 идэвхгүй кампанит ажил (бүх өдөр 0), ижил нэртэй өөр төрлийн 2 кампанит ажил.
 * Хүргэлтгүй өдрийн мөр Ads Manager шиг 0 / хоосон утгатай.
 */

export const META_ADS_EXPORT_HEADERS = [
    'Reporting starts', 'Reporting ends', 'Campaign name', 'Campaign delivery', 'Attribution setting', 'Results', 'Result indicator', 'Reach', 'Frequency',
    'Cost per results', 'Ad set budget', 'Ad set budget type', 'Amount spent (USD)', 'Ends', 'Impressions', 'CPM (cost per 1,000 impressions) (USD)',
    'Link clicks', 'shop_clicks', 'CPC (cost per link click) (USD)', 'CTR (link click-through rate)', 'Clicks (all)', 'CTR (all)', 'CPC (all) (USD)',
    'Landing page views', 'Cost per landing page view (USD)', 'Results (initial)', 'Results (initial) indicator',
] as const;

const CALLS = 'actions:click_to_call_native_call_placed';
const POST_INTERACTION = 'actions:post_interaction_gross';
const POST_ENGAGEMENT = 'actions:post_engagement';
const THRUPLAY = 'video_thruplay_watched_actions';

interface Delivery { spend: number; impressions: number; reach: number; results: number | null; indicator: string; link: number | null; clicks: number; lpv: number | null }
const idle = (indicator = ''): Delivery => ({ spend: 0, impressions: 0, reach: 0, results: indicator ? 0 : null, indicator, link: null, clicks: 0, lpv: null });

function campaigns(day: number): Array<[name: string, delivery: string, budget: string, budgetType: string, ends: string, Delivery]> {
    const calls = [2, 0, 3, 1, 2, 0, 4, 3, 0, 2, 5, 3, 1][day];
    const quiet = day === 3;
    return [
        ['Дуудлагын кампанит ажил', 'active', '20', 'Daily', '2026-09-30', {
            spend: quiet ? 0 : 10, impressions: quiet ? 0 : 5000, reach: quiet ? 0 : 3000, results: calls || null, indicator: calls ? CALLS : '',
            link: quiet ? null : 40, clicks: quiet ? 0 : 150, lpv: quiet || day === 5 ? null : 5,
        }],
        ['Постын урамшуулал', 'active', '4', 'Daily', '2026-09-30',
            day >= 4 ? { spend: 4, impressions: 8000, reach: 6000, results: 20, indicator: POST_INTERACTION, link: 3, clicks: 60, lpv: null } : idle()],
        ['Брэнд хүрэлт', 'inactive', 'Using ad set budget', '0', 'Ongoing',
            day <= 6 ? { spend: 1.2, impressions: 9500, reach: 9000, results: 9000, indicator: 'reach', link: null, clicks: 6, lpv: null } : idle('reach')],
        ['Видео үзэлт', 'recently_completed', '3', 'Daily', '2026-09-18',
            day === 5 || day === 6 ? { spend: 3, impressions: 7000, reach: 5000, results: 600, indicator: THRUPLAY, link: null, clicks: 40, lpv: null } : idle()],
        ['Постын оролцоо', 'inactive', '2.5', 'Daily', 'Ongoing',
            day >= 8 && day <= 10 ? { spend: 2.5, impressions: 6000, reach: 4500, results: 900, indicator: POST_ENGAGEMENT, link: 2, clicks: 30, lpv: null } : idle()],
        ['Хуучин кампанит ажил', 'inactive', '5', 'Daily', 'Ongoing', idle()],
        ['Хуучин кампанит ажил', 'inactive', '6', 'Daily', 'Ongoing', idle()],
        ['Давхар нэр', 'inactive', '5', 'Daily', 'Ongoing',
            day === 10 ? { spend: 5, impressions: 2500, reach: 2000, results: 2, indicator: CALLS, link: 10, clicks: 25, lpv: 1 } : idle()],
        ['Давхар нэр', 'inactive', '1', 'Daily', 'Ongoing',
            day === 11 ? { spend: 1, impressions: 1500, reach: 1200, results: 400, indicator: POST_ENGAGEMENT, link: null, clicks: 12, lpv: null } : idle()],
    ];
}

const num = (value: number | null | undefined, digits = 6) => value === null || value === undefined ? '' : value.toFixed(digits).replace(/\.?0+$/, '');
const day = (index: number) => new Date(Date.UTC(2026, 8, 12 + index)).toISOString().slice(0, 10);

/** Өгөгдлийн мөрүүд (толгойгүй), CSV-ийн нүдний текстээр. */
function buildRows(): string[][] {
    const lines: string[][] = [];
    for (let index = 12; index >= 0; index--) {
        const date = day(index);
        for (const [name, delivery, budget, budgetType, ends, v] of campaigns(index)) {
            const ratio = (a: number, b: number | null, digits = 6) => b ? num(a / b, digits) : '';
            lines.push([
                date, date, name, delivery, v.spend ? '7-day click or 1-day view' : '-', num(v.results), v.indicator, num(v.reach), v.reach ? num(v.impressions / v.reach) : '0',
                v.results && v.spend ? num(v.spend / v.results, 8) : '', budget, budgetType, v.spend ? num(v.spend, 2) : '0', ends, num(v.impressions),
                v.impressions ? num(v.spend / v.impressions * 1000) : '0', num(v.link), '', v.link && v.spend ? ratio(v.spend, v.link) : '',
                v.link && v.impressions ? num(v.link / v.impressions * 100) : '', num(v.clicks), v.impressions ? num(v.clicks / v.impressions * 100) : '0',
                v.clicks && v.spend ? ratio(v.spend, v.clicks) : '0', num(v.lpv), v.lpv && v.spend ? ratio(v.spend, v.lpv) : '', '', '',
            ]);
        }
    }
    return lines;
}

export const META_ADS_DAILY_ROWS = buildRows();
/** Ads Manager шиг: олон үгтэй толгойг л хашилтад. */
export const META_ADS_DAILY_CSV = `${[META_ADS_EXPORT_HEADERS.map(header => header.includes(' ') ? `"${header}"` : header), ...META_ADS_DAILY_ROWS].map(row => row.join(',')).join('\n')}\n`;
/** Файлыг уншсантай ижил мөрийн объектууд (толгой → нүд). */
export const metaAdsDailyTable = () => META_ADS_DAILY_ROWS.map(row => Object.fromEntries(META_ADS_EXPORT_HEADERS.map((header, i) => [header, row[i]])));
