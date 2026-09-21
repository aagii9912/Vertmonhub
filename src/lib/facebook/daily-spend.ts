import { appsecretProof } from '@/lib/facebook/messenger';
import { dateSchema } from '@/lib/marketing/performance';

const BASE = 'https://graph.facebook.com/v21.0';
export interface MetaAccount { id: string; currency: string; timezone_name: string }
export interface MetaDailyRow { campaign_id: string; campaign_name: string; spent_at: string; native_amount: string }

// Never log a URL, response body or token. Even Graph paging.next can contain credentials.
export async function metaRead<T>(path: string, token: string, params: Record<string, string> = {}, signal?: AbortSignal): Promise<T> {
    const url = new URL(`${BASE}/${path}`);
    const proof = appsecretProof(token);
    for (const [key, value] of Object.entries({ ...params, ...(proof ? { appsecret_proof: proof } : {}) })) url.searchParams.set(key, value);
    let response: Response;
    try { response = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', signal: signal ?? AbortSignal.timeout(20000) }); }
    catch { throw new Error('Meta холболт тасарлаа эсвэл хугацаа хэтэрлээ. Дахин синк хийнэ үү.'); }
    const body = await response.json().catch(() => null);
    if (!response.ok || !body || body.error) {
        const code = Number(body?.error?.code);
        if (code === 190) throw new Error('Meta нэвтрэх эрх дууссан. Facebook холболтоо дахин холбоно уу.');
        if ([10, 200, 294].includes(code)) throw new Error('Meta зарын дансанд ads_read эрх шаардлагатай.');
        throw new Error(`Meta зардал татах алдаа (HTTP ${response.status}${Number.isFinite(code) ? `, code ${code}` : ''}). Дахин оролдоно уу.`);
    }
    return body as T;
}
export async function fetchMetaAccount(account: string, token: string): Promise<MetaAccount> {
    if (!/^act_\d+$/.test(account)) throw new Error('Meta зарын данс сонгоно уу.');
    const data = await metaRead<MetaAccount>(account, token, { fields: 'id,currency,timezone_name' });
    if (data.id !== account || !/^[A-Z]{3}$/.test(data.currency)) throw new Error('Meta дансны валют тодорхойгүй байна.');
    try { new Intl.DateTimeFormat('en', { timeZone: data.timezone_name }).format(); }
    catch { throw new Error('Meta дансны цагийн бүс тодорхойгүй байна.'); }
    if (!data.timezone_name) throw new Error('Meta дансны цагийн бүс тодорхойгүй байна.');
    return data;
}
export async function fetchMetaDailySpend(account: MetaAccount, token: string, from: string, to: string): Promise<MetaDailyRow[]> {
    const rows: MetaDailyRow[] = [], keys = new Set<string>(), cursors = new Set<string>();
    const signal = AbortSignal.timeout(90000);
    let after: string | undefined;
    for (let page = 0; page < 100; page++) {
        const result = await metaRead<{ data: Array<Record<string, string>>; paging?: { next?: string; cursors?: { after?: string } } }>(`${account.id}/insights`, token, {
            fields: 'account_id,account_currency,campaign_id,campaign_name,date_start,date_stop,spend', level: 'campaign', time_increment: '1',
            time_range: JSON.stringify({ since: from, until: to }), limit: '500', ...(after ? { after } : {}),
        }, signal);
        if (!Array.isArray(result.data)) throw new Error('Meta өдрийн зардлын хариу дутуу байна.');
        for (const r of result.data) {
            const key = `${r.campaign_id}:${r.date_start}`;
            if (r.account_id !== account.id.slice(4) || r.account_currency !== account.currency || !/^\d+$/.test(r.campaign_id || '') ||
                !dateSchema.safeParse(r.date_start).success || r.date_start !== r.date_stop || r.date_start < from || r.date_start > to ||
                !/^\d+(\.\d{1,6})?$/.test(r.spend || '') || Number(r.spend) >= 1e12 || keys.has(key)) {
                throw new Error('Meta өгөгдөл зөрүүтэй байна. Өмнөх зардлыг өөрчлөөгүй.');
            }
            keys.add(key);
            rows.push({ campaign_id: r.campaign_id, campaign_name: r.campaign_name || r.campaign_id, spent_at: r.date_start, native_amount: r.spend });
        }
        if (!result.paging?.next) return rows;
        // Rebuild the trusted Graph URL with a cursor; never follow arbitrary paging.next URLs.
        after = result.paging.cursors?.after;
        if (!after || cursors.has(after)) throw new Error('Meta хуудаслалт бүрэн дуусаагүй байна.');
        cursors.add(after);
    }
    throw new Error('Meta өгөгдөл хэт их байна. Хугацааг багасгаж дахин оролдоно уу.');
}
