/**
 * Маркетингийн холболтын төлөв (Лхагвагийн хурлын хуудас, слайд, хэлэлцэх асуудал): Facebook хуудас, Instagram,
 * Meta зарын данс, токены эх сурвалж, синк, төгрөгийн ханш. Серверийн ачаалагч (`connections-load.ts`,
 * `GET /api/dashboard/marketing/connections`) токены утгыг хэзээ ч буцаахгүй — зөвхөн холбогдсон эсэх, эх
 * сурвалж, хугацаа. Цэвэр модуль: хөтөч ба тест хоёулаа ашиглана.
 */
import { ubDateStr } from '@/lib/utils/date';

/** Синкийн сүүлийн төлөв (`social_insights_sync`, `meta_insights_sync`, `meta_spend_sync`). */
export interface ConnectionSync {
    lastAttemptAt: string | null;
    lastSuccessAt: string | null;
    /** Сүүлийн амжилттай синкийн хамарсан өдрүүд. */
    from: string | null;
    to: string | null;
    error: string | null;
}

export interface MarketingConnections {
    page: { connected: boolean; name: string | null; sync: ConnectionSync | null };
    instagram: { connected: boolean; username: string | null; sync: ConnectionSync | null };
    ads: {
        /** Сонгосон зарын данс (`act_…`), сонгоогүй бол null. */
        accountId: string | null;
        /** 'system' = System User (`META_ADS_SYSTEM_TOKEN`), 'user' = төслийн OAuth токен, null = хүчинтэй токен алга. */
        tokenSource: 'system' | 'user' | null;
        /** Хэрэглэгчийн токен дуусах хүртэл үлдсэн бүтэн өдөр (System User эсвэл хугацаагүй бол null). */
        tokenDaysLeft: number | null;
        /** Хэрэглэгчийн токен хадгалсан боловч хугацаа нь дууссан (System User-гүй). */
        tokenExpired: boolean;
        /** Дэлгэрэнгүй (ad set × өдөр) синк; хүснэгт суулгаагүй эсвэл синк хийгээгүй бол null. */
        insights: ConnectionSync | null;
        /** Өдрийн зардлын синк. */
        spend: ConnectionSync | null;
        /** Зарын дансны валют (зардлын синкээс), тодорхойгүй бол null. */
        currency: string | null;
        /** Хадгалсан тооцооны ханш (1 валют = ₮); MNT данс бол 1. */
        mntPerUnit: number | null;
    };
}

export type ConnectionTone = 'ok' | 'warn' | 'off';
export interface ConnectionRow { key: string; label: string; status: string; detail: string | null; tone: ConnectionTone }

const dot = (day: string) => day.replaceAll('-', '.');
const dayOf = (iso: string | null) => iso ? dot(ubDateStr(new Date(iso))) : null;
/** Урт алдааг үгийн заагаар тайрна. */
const clip = (text: string, max: number) => {
    if (text.length <= max) return text;
    const cut = text.slice(0, max - 1);
    const space = cut.lastIndexOf(' ');
    return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,;:—-]+$/, '')}…`;
};

/** Ханш хадгалсан эсэх: MNT данс ханш шаардахгүй. */
export const metaRateSaved = (ads: MarketingConnections['ads']) => ads.currency === 'MNT' || (ads.mntPerUnit ?? 0) > 0;

function syncDetail(sync: ConnectionSync | null, empty: string): { detail: string; tone: ConnectionTone } {
    if (sync?.error) return { detail: `Синк алдаатай: ${clip(sync.error, 120)}`, tone: 'warn' };
    if (sync?.lastSuccessAt) return { detail: `Сүүлд ${dayOf(sync.lastSuccessAt)}${sync.to ? ` · ${dot(sync.to.slice(0, 10))} хүртэл` : ''}`, tone: 'ok' };
    return { detail: empty, tone: 'off' };
}

/** Хуудас, слайдын «Холболтын төлөв»-ийн мөрүүд (нэг дүрэм). */
export function connectionRows(c: MarketingConnections): ConnectionRow[] {
    const page = syncDetail(c.page.sync, 'Синк хийгдээгүй');
    const instagram = syncDetail(c.instagram.sync, 'Үзүүлэлтийн синк хийгдээгүй');
    const ads = c.ads;
    const insights = syncDetail(ads.insights, 'Синк хийгдээгүй');
    const spendError = ads.spend?.error ? `Зардлын синк алдаатай: ${clip(ads.spend.error, 120)}` : null;
    return [
        c.page.connected
            ? { key: 'page', label: 'Facebook хуудас', status: c.page.name ? `Холбогдсон · ${c.page.name}` : 'Холбогдсон', detail: page.detail, tone: page.tone === 'off' ? 'warn' : page.tone }
            : { key: 'page', label: 'Facebook хуудас', status: 'Холбогдоогүй', detail: 'Маркетинг → Сошиал хэсэгт холбоно', tone: 'off' },
        c.instagram.connected
            ? { key: 'instagram', label: 'Instagram', status: c.instagram.username ? `Холбогдсон · @${c.instagram.username}` : 'Холбогдсон', detail: c.instagram.sync ? instagram.detail : null, tone: instagram.tone === 'warn' ? 'warn' : 'ok' }
            : { key: 'instagram', label: 'Instagram', status: 'Холбогдоогүй', detail: null, tone: 'off' },
        ads.accountId
            ? { key: 'account', label: 'Meta зарын данс', status: `Сонгосон · ${ads.accountId}`, detail: ads.currency ? `Валют ${ads.currency}` : null, tone: 'ok' }
            : { key: 'account', label: 'Meta зарын данс', status: 'Сонгоогүй', detail: 'Meta ROI хуудсанд төслийн зарын дансыг сонгоно', tone: 'warn' },
        ads.tokenSource === 'system'
            ? { key: 'token', label: 'Meta токен', status: 'System User', detail: 'Хугацаагүй', tone: 'ok' }
            : ads.tokenSource === 'user'
                ? { key: 'token', label: 'Meta токен', status: 'Хэрэглэгчийн (OAuth)', detail: ads.tokenDaysLeft === null ? 'Хугацаагүй' : `${ads.tokenDaysLeft} хоногийн дараа дуусна`, tone: ads.tokenDaysLeft !== null && ads.tokenDaysLeft <= 14 ? 'warn' : 'ok' }
                : { key: 'token', label: 'Meta токен', status: ads.tokenExpired ? 'Хугацаа дууссан' : 'Алга', detail: '«Meta Ads холбох»-оор холбох эсвэл System User токен нэмэх', tone: ads.accountId ? 'warn' : 'off' },
        ads.accountId
            ? { key: 'sync', label: 'Meta зарын синк', status: ads.insights?.error || spendError ? 'Алдаатай' : ads.insights?.lastSuccessAt ? 'Ажиллаж байна' : 'Хийгдээгүй', detail: [ads.insights?.error ? insights.detail : null, spendError, !ads.insights?.error ? insights.detail : null].filter(Boolean).join(' · ') || null, tone: ads.insights?.error || spendError ? 'warn' : insights.tone }
            : { key: 'sync', label: 'Meta зарын синк', status: '—', detail: null, tone: 'off' },
        !ads.accountId
            ? { key: 'rate', label: 'Төгрөгийн ханш', status: '—', detail: null, tone: 'off' }
            : ads.currency === 'MNT'
                ? { key: 'rate', label: 'Төгрөгийн ханш', status: 'Шаардлагагүй (MNT данс)', detail: null, tone: 'ok' }
                : metaRateSaved(ads)
                    ? { key: 'rate', label: 'Төгрөгийн ханш', status: 'Оруулсан', detail: `1 ${ads.currency ?? 'USD'} = ${Math.round(ads.mntPerUnit!).toLocaleString('en-US')}₮ (тооцооны ханш)`, tone: 'ok' }
                    : { key: 'rate', label: 'Төгрөгийн ханш', status: 'Оруулаагүй', detail: 'Ханшгүй зардал ₮-д орохгүй — /marketing → «Бүртгэл» → «Meta автомат зардал»', tone: 'warn' },
    ];
}

/** Хурлаар шийдэх маркетингийн асуудал (холболт). Лид, гэрээтэй холбохгүй. */
export function connectionDiscussionItems(c: MarketingConnections): { title: string; detail: string; href?: string }[] {
    const items: { title: string; detail: string; href?: string }[] = [];
    const ads = c.ads;
    if (!ads.accountId) {
        items.push({ title: 'Meta зарын данс холбогдоогүй', detail: 'Meta ROI хуудсанд төслийн зарын дансыг сонгох (System User токен эсвэл «Meta Ads холбох»). Тэр хүртэл Meta зарын тойм, үр дүн, зардал тайланд орохгүй.', href: '/dashboard/marketing-roi' });
    } else if (!ads.tokenSource) {
        items.push({ title: 'Meta зарын данс холбогдоогүй', detail: `${ads.accountId} дансанд хүчинтэй токен алга${ads.tokenExpired ? ' (нэвтрэх эрх дууссан)' : ''}. «Meta Ads холбох»-оор дахин холбох эсвэл System User токен нэмэх — тэр хүртэл синк зогсоно.`, href: '/dashboard/marketing-roi' });
    }
    const error = ads.accountId ? ads.insights?.error || ads.spend?.error : null;
    if (error) items.push({ title: `Meta синк алдаатай: ${clip(error, 80)}`, detail: 'Meta ROI хуудаснаас синкийг дахин ажиллуулж, алдааг засах. Тэр хүртэл Meta зарын тоо хуучирсан эсвэл дутуу байж болно.', href: '/dashboard/marketing-roi' });
    if (ads.tokenSource === 'user' && ads.tokenDaysLeft !== null && ads.tokenDaysLeft <= 14) {
        items.push({ title: ads.tokenDaysLeft <= 0 ? 'Meta токен өнөөдөр дуусна' : `Meta токен ${ads.tokenDaysLeft} хоногт дуусна`, detail: '«Meta Ads дахин холбох» эсвэл хугацаагүй System User токен нэмэх. Дууссаны дараа Meta зарын синк зогсоно.', href: '/dashboard/marketing-roi' });
    }
    if (ads.accountId && !metaRateSaved(ads)) {
        items.push({ title: 'Төгрөгийн ханш оруулаагүй', detail: `Meta-гийн ${ads.currency ?? 'USD'} зардал ₮-д хөрвөхгүй, төсвийн гүйцэтгэлд орохгүй. /marketing → «Бүртгэл» → «Meta автомат зардал» хэсэгт тооцооны ханшаа оруулах.`, href: '/marketing' });
    }
    return items;
}

/** Хэрэглэгчийн токен дуусах хүртэл үлдсэн бүтэн өдөр (`now`-оос); хугацаагүй/буруу бол null. */
export function tokenDaysLeft(expiresAt: string | null | undefined, now: Date): number | null {
    const time = expiresAt ? Date.parse(expiresAt) : NaN;
    return Number.isFinite(time) ? Math.floor((time - now.getTime()) / 86_400_000) : null;
}
