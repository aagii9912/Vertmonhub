import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { decryptToken } from '@/lib/crypto/tokens';
import { fetchMetaAccount, fetchMetaDailySpend } from '@/lib/facebook/daily-spend';
import { dateSchema } from './performance';

export const MetaSyncInput = z.object({
    from: dateSchema.optional(), to: dateSchema.optional(),
    currency: z.string().regex(/^[A-Z]{3}$/).optional(),
    mntPerUnit: z.number().min(0.000001).max(1000000).refine(v => Number(v.toFixed(6)) === v).optional(),
}).refine(v => !!v.from === !!v.to && (!v.from || (v.to! >= v.from && Date.parse(v.to!) - Date.parse(v.from) <= 92 * 86400000)), '93 хүртэл өдрийн хугацаа сонгоно уу')
    .refine(v => v.mntPerUnit === undefined || !!v.currency, 'Ханшийн валютыг сонгоно уу');
export type MetaSyncOptions = z.infer<typeof MetaSyncInput>;
export interface MetaSyncStatus {
    account_id: string; currency: string | null; timezone: string | null; mnt_per_unit: number | null;
    last_attempt_at: string; last_success_at: string | null; last_from: string | null; last_to: string | null; last_error: string | null;
}
export async function syncMetaSpend(db: SupabaseClient, shopId: string, options: MetaSyncOptions = {}) {
    const input = MetaSyncInput.parse(options);
    const started = new Date().toISOString();
    const { data: shop, error } = await db.from('shops').select('facebook_ad_account_id,facebook_user_access_token').eq('id', shopId).single();
    if (error) throw new Error('Meta тохиргоог уншиж чадсангүй.');
    const accountId = `act_${String(shop?.facebook_ad_account_id || '').replace(/^act_/, '')}`;
    if (!/^act_\d+$/.test(accountId)) throw new Error('Эхлээд Meta зарын дансаа сонгоно уу.');
    try {
        const token = decryptToken(shop?.facebook_user_access_token);
        if (!token) throw new Error('Facebook холболтоо ads_read эрхтэйгээр дахин холбоно уу.');
        const account = await fetchMetaAccount(accountId, token);
        const today = new Intl.DateTimeFormat('en-CA', { timeZone: account.timezone_name, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
        const to = input.to && input.to < today ? input.to : today;
        const from = input.from ?? new Date(Date.parse(`${to}T00:00:00Z`) - 34 * 86400000).toISOString().slice(0, 10);
        if (from > to) throw new Error('Ирээдүйн өдрийн зардлыг татах боломжгүй.');
        const { data: saved, error: stateError } = await db.from('meta_spend_sync').select('currency,mnt_per_unit').eq('shop_id', shopId).eq('account_id', accountId).maybeSingle();
        if (stateError) throw new Error('Meta зардлын шинэчлэл суулгагдаагүй эсвэл тохиргоог уншиж чадсангүй.');
        if (input.mntPerUnit !== undefined && input.currency !== account.currency) throw new Error(`Дансны валют ${account.currency}. Ханшийн валют тохирохгүй байна.`);
        if (account.currency === 'MNT' && input.mntPerUnit !== undefined && input.mntPerUnit !== 1) throw new Error('MNT дансны ханш 1 байна.');
        const rate = account.currency === 'MNT' ? 1 : input.mntPerUnit ?? (saved?.currency === account.currency ? saved.mnt_per_unit : null);
        const rows = await fetchMetaDailySpend(account, token, from, to);
        const { data: count, error: saveError } = await db.rpc('save_meta_daily_spend', {
            p_shop: shopId, p_account: accountId, p_from: from, p_to: to, p_currency: account.currency, p_timezone: account.timezone_name,
            p_rate: rate, p_replace_rate: input.mntPerUnit !== undefined, p_started: started, p_rows: rows,
        });
        if (saveError) throw new Error('Meta зардлыг хадгалж чадсангүй. Шинэчлэл суулгасан эсэх, сонгосон дансаа шалгаад дахин оролдоно уу.');
        return { rows: Number(count), from, to, currency: account.currency, timezone: account.timezone_name, mntPerUnit: rate, needsRate: rate === null };
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Meta синк амжилтгүй боллоо.';
        await db.rpc('record_meta_spend_failure', { p_shop: shopId, p_account: accountId, p_started: started, p_error: message });
        throw error;
    }
}
