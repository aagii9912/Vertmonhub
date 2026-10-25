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
        /** Дэлгэрэнгүй (ad set × өдөр) синк; хүснэгт суулгаагүй эсвэл синк хийгээгүй бол null. `from`/`to` нь сүүлийн
         *  амжилттай синкийн хүссэн хугацаа (хуучин хугацааг дахин татсан байж болно) — өгөгдлийн хамрах хүрээ биш. */
        insights: ConnectionSync | null;
        /** Хадгалсан ad set × өдрийн хамгийн сүүлийн өдөр (`meta_ad_insights_daily`) — өгөгдөл хаана хүртэл байгаа. */
        dataTo?: string | null;
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

/**
 * Синкийн тайлбар. `to` = өгөгдөл хаана хүртэл: Page/IG-ийн синк үргэлж өчигдрөөр дуусдаг тул `last_to`; Meta зарын синк
 * хуучин хугацааг дахин татаж болох тул `last_to` биш, хадгалсан хамгийн сүүлийн өдөр (`ads.dataTo`).
 */
function syncDetail(sync: ConnectionSync | null, empty: string, to: string | null | undefined = sync?.to): { detail: string; tone: ConnectionTone } {
    if (sync?.error) return { detail: `Синк алдаатай: ${clip(sync.error, 120)}`, tone: 'warn' };
    if (sync?.lastSuccessAt) return { detail: `Сүүлд ${dayOf(sync.lastSuccessAt)}${to ? ` · өгөгдөл ${dot(to.slice(0, 10))} хүртэл` : ''}`, tone: 'ok' };
    return { detail: empty, tone: 'off' };
}

/** Meta зарын cron 6 цаг тутам: сүүлийн амжилттай синк үүнээс хуучин бол «Хоцорсон». */
export const META_SYNC_STALE_MS = 24 * 3_600_000;

/** «Meta зарын синк»-ийн мөр: алдаа, хүчинтэй токенгүй (синк зогссон), хоцорсон, ажиллаж буй. */
function adsSyncRow(ads: MarketingConnections['ads'], now: Date): ConnectionRow {
    const label = 'Meta зарын синк';
    if (!ads.accountId) return { key: 'sync', label, status: '—', detail: null, tone: 'off' };
    // `?? null`: дутуу бол синкийн хүссэн хугацаа (`last_to`) руу буцахгүй.
    const insights = syncDetail(ads.insights, 'Синк хийгдээгүй', ads.dataTo ?? null);
    const spendError = ads.spend?.error ? `Зардлын синк алдаатай: ${clip(ads.spend.error, 120)}` : null;
    if (ads.insights?.error || spendError) {
        return { key: 'sync', label, status: 'Алдаатай', detail: [ads.insights?.error ? insights.detail : null, spendError].filter(Boolean).join(' · ') || null, tone: 'warn' };
    }
    const last = ads.insights?.lastSuccessAt ?? null;
    const lastText = last ? insights.detail : null;
    if (!ads.tokenSource) return { key: 'sync', label, status: 'Ажиллахгүй', detail: ['Хүчинтэй токен алга — синк зогссон', lastText].filter(Boolean).join(' · '), tone: 'warn' };
    if (last && now.getTime() - Date.parse(last) > META_SYNC_STALE_MS) return { key: 'sync', label, status: 'Хоцорсон', detail: `24 цагаас дээш синк амжилтгүй · ${lastText}`, tone: 'warn' };
    return { key: 'sync', label, status: last ? 'Ажиллаж байна' : 'Хийгдээгүй', detail: insights.detail, tone: insights.tone };
}

/** Төгрөгийн ханшны мөр. Валют тодорхойгүй бол (зардлын синк хийгдээгүй) ханш оруулаагүй гэж таамаглахгүй. */
function rateRow(ads: MarketingConnections['ads']): ConnectionRow {
    const label = 'Төгрөгийн ханш';
    if (!ads.accountId) return { key: 'rate', label, status: '—', detail: null, tone: 'off' };
    if (!ads.currency) return { key: 'rate', label, status: 'Тодорхойгүй', detail: 'Дансны валют тодорхойгүй — Meta зардлын синк хийгдээгүй', tone: 'warn' };
    if (ads.currency === 'MNT') return { key: 'rate', label, status: 'Шаардлагагүй (MNT данс)', detail: null, tone: 'ok' };
    if (metaRateSaved(ads)) return { key: 'rate', label, status: 'Оруулсан', detail: `1 ${ads.currency} = ${Math.round(ads.mntPerUnit!).toLocaleString('en-US')}₮ (тооцооны ханш)`, tone: 'ok' };
    return { key: 'rate', label, status: 'Оруулаагүй', detail: 'Ханшгүй зардал ₮-д орохгүй — /marketing → «Бүртгэл» → «Meta автомат зардал»', tone: 'warn' };
}

/** Хэрэглэгчийн токен дуусах хугацааны бичлэг (мөр ба хэлэлцэх асуудал ижил). */
const tokenExpiryText = (days: number) => days <= 0 ? '24 цагийн дотор дуусна' : `${days} хоногийн дараа дуусна`;

/** Хуудас, слайдын «Холболтын төлөв»-ийн мөрүүд (нэг дүрэм). `now` = хоцорсон синкийг тодорхойлох мөч. */
export function connectionRows(c: MarketingConnections, now: Date = new Date()): ConnectionRow[] {
    const page = syncDetail(c.page.sync, 'Синк хийгдээгүй');
    const instagram = syncDetail(c.instagram.sync, 'Үзүүлэлтийн синк хийгдээгүй');
    const ads = c.ads;
    return [
        c.page.connected
            ? { key: 'page', label: 'Facebook хуудас', status: c.page.name ? `Холбогдсон · ${c.page.name}` : 'Холбогдсон', detail: page.detail, tone: page.tone === 'off' ? 'warn' : page.tone }
            : { key: 'page', label: 'Facebook хуудас', status: 'Холбогдоогүй', detail: 'Маркетинг → Сошиал хэсэгт холбоно', tone: 'off' },
        // Холбогдсон ч синк хийгдээгүй бол Facebook хуудастай адил анхааруулна (үзүүлэлт тайланд орохгүй).
        c.instagram.connected
            ? { key: 'instagram', label: 'Instagram', status: c.instagram.username ? `Холбогдсон · @${c.instagram.username}` : 'Холбогдсон', detail: instagram.detail, tone: instagram.tone === 'off' ? 'warn' : instagram.tone }
            : { key: 'instagram', label: 'Instagram', status: 'Холбогдоогүй', detail: null, tone: 'off' },
        ads.accountId
            ? { key: 'account', label: 'Meta зарын данс', status: `Сонгосон · ${ads.accountId}`, detail: ads.currency ? `Валют ${ads.currency}` : null, tone: 'ok' }
            : { key: 'account', label: 'Meta зарын данс', status: 'Сонгоогүй', detail: 'Meta ROI хуудсанд төслийн зарын дансыг сонгоно', tone: 'warn' },
        ads.tokenSource === 'system'
            ? { key: 'token', label: 'Meta токен', status: 'System User', detail: 'Хугацаагүй', tone: 'ok' }
            : ads.tokenSource === 'user'
                ? { key: 'token', label: 'Meta токен', status: 'Хэрэглэгчийн (OAuth)', detail: ads.tokenDaysLeft === null ? 'Хугацаагүй' : tokenExpiryText(ads.tokenDaysLeft), tone: ads.tokenDaysLeft !== null && ads.tokenDaysLeft <= 14 ? 'warn' : 'ok' }
                : { key: 'token', label: 'Meta токен', status: ads.tokenExpired ? 'Хугацаа дууссан' : 'Алга', detail: '«Meta Ads холбох»-оор холбох эсвэл System User токен нэмэх', tone: ads.accountId ? 'warn' : 'off' },
        adsSyncRow(ads, now),
        rateRow(ads),
    ];
}

/**
 * Хурлаар шийдэх маркетингийн асуудал (холболт). Лид, гэрээтэй холбохгүй. Холбогдсон Facebook хуудас / Instagram-ийн
 * синк алдаатай эсвэл хийгдээгүй бол; холбогдоогүй хуудас, Instagram-ыг (зарим төсөлд байхгүй) зөвхөн холболтын слайдад.
 */
export function connectionDiscussionItems(c: MarketingConnections): { title: string; detail: string; href?: string }[] {
    const items: { title: string; detail: string; href?: string }[] = [];
    const social = [
        { of: 'Facebook хуудасны', connected: c.page.connected, sync: c.page.sync },
        { of: 'Instagram-ийн', connected: c.instagram.connected, sync: c.instagram.sync },
    ];
    for (const { of, connected, sync } of social) {
        if (!connected) continue;
        if (sync?.error) items.push({ title: `${of} синк алдаатай: ${clip(sync.error, 80)}`, detail: 'Маркетинг → Сошиал хэсэгт эрх, холболтыг шалгаж синкийг дахин ажиллуулах. Тэр хүртэл энэ долоо хоногийн үзүүлэлт дутуу байж болно.', href: '/marketing/social' });
        else if (!sync?.lastSuccessAt) items.push({ title: `${of} үзүүлэлт синк хийгдээгүй`, detail: 'Маркетинг → Сошиал хэсэгт синкийг ажиллуулах (6 цаг тутмын cron ч татна). Тэр хүртэл үзүүлэлт тайланд орохгүй.', href: '/marketing/social' });
    }
    const ads = c.ads;
    if (!ads.accountId) {
        items.push({ title: 'Meta зарын данс холбогдоогүй', detail: 'Meta ROI хуудсанд төслийн зарын дансыг сонгох (System User токен эсвэл «Meta Ads холбох»). Тэр хүртэл Meta зарын тойм, үр дүн, зардал тайланд орохгүй.', href: '/dashboard/marketing-roi' });
    } else if (!ads.tokenSource) {
        items.push({ title: 'Meta зарын данс холбогдоогүй', detail: `${ads.accountId} дансанд хүчинтэй токен алга${ads.tokenExpired ? ' (нэвтрэх эрх дууссан)' : ''}. «Meta Ads холбох»-оор дахин холбох эсвэл System User токен нэмэх — тэр хүртэл синк зогсоно.`, href: '/dashboard/marketing-roi' });
    }
    const error = ads.accountId ? ads.insights?.error || ads.spend?.error : null;
    if (error) items.push({ title: `Meta синк алдаатай: ${clip(error, 80)}`, detail: 'Meta ROI хуудаснаас синкийг дахин ажиллуулж, алдааг засах. Тэр хүртэл Meta зарын тоо хуучирсан эсвэл дутуу байж болно.', href: '/dashboard/marketing-roi' });
    if (ads.tokenSource === 'user' && ads.tokenDaysLeft !== null && ads.tokenDaysLeft <= 14) {
        items.push({ title: `Meta токен ${ads.tokenDaysLeft <= 0 ? '24 цагийн дотор' : `${ads.tokenDaysLeft} хоногт`} дуусна`, detail: '«Meta Ads дахин холбох» эсвэл хугацаагүй System User токен нэмэх. Дууссаны дараа Meta зарын синк зогсоно.', href: '/dashboard/marketing-roi' });
    }
    // Валют тодорхойгүй (зардлын синк хийгдээгүй) бол ханш хэрэгтэй эсэх нь ч тодорхойгүй — таамаглахгүй.
    if (ads.accountId && ads.currency && !metaRateSaved(ads)) {
        items.push({ title: 'Төгрөгийн ханш оруулаагүй', detail: `Meta-гийн ${ads.currency} зардал ₮-д хөрвөхгүй, төсвийн гүйцэтгэлд орохгүй. /marketing → «Бүртгэл» → «Meta автомат зардал» хэсэгт тооцооны ханшаа оруулах.`, href: '/marketing' });
    }
    return items;
}

/** Хэрэглэгчийн токен дуусах хүртэл үлдсэн бүтэн өдөр (`now`-оос); хугацаагүй/буруу бол null. */
export function tokenDaysLeft(expiresAt: string | null | undefined, now: Date): number | null {
    const time = expiresAt ? Date.parse(expiresAt) : NaN;
    return Number.isFinite(time) ? Math.floor((time - now.getTime()) / 86_400_000) : null;
}
