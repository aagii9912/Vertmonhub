import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { requireModule, resolvePermissions } from '@/lib/auth/require-permission';
import { getUserShop, supabaseAdmin } from '@/lib/auth/supabase-auth';
import { getAdAccounts } from '@/lib/facebook/marketing-api';
import { metaAdsToken, metaAdsTokenSource, type MetaAdsConnection } from '@/lib/facebook/ads-auth';
import { logger } from '@/lib/utils/logger';
import { withRoute } from '@/lib/api/route';

/** 'act_123' ба '123'-г ижил гэж үзнэ (shops_facebook_ad_account_unique-тэй адил). */
const accountKey = (id: string | null | undefined) => (id ? String(id).replace(/^act_/, '') : '');
const ADMIN_ONLY = 'Системийн хэрэглэгчийн токентой үед төслийн зарын дансыг зөвхөн админ сонгоно. Админд хандана уу.';

/**
 * System User токен бүх төслийн зарын дансыг хардаг тул тэр үед данс сонгох/солихыг зөвхөн
 * admin/super_admin хийнэ (нэг төслийн маркетингийн ажилтан өөр төслийн дансыг өөртөө холбохгүй).
 * Хэрэглэгчийн OAuth токенд жагсаалт тухайн хүний Meta эрхээр хязгаарлагдана.
 */
async function canChooseAccount(shop: MetaAdsConnection | null | undefined): Promise<boolean> {
    if (metaAdsTokenSource(shop) !== 'system') return true;
    const role = (await resolvePermissions())?.role;
    return role === 'admin' || role === 'super_admin';
}

/** Өөр төсөлд холбогдсон зарын дансууд (нэр, ID-г бусад төсөлд харуулахгүй, 409-өөс сэргийлнэ). */
async function accountsLinkedElsewhere(db: SupabaseClient, shopId: string): Promise<Set<string>> {
    const { data, error } = await db.from('shops').select('id,facebook_ad_account_id').not('facebook_ad_account_id', 'is', null).neq('id', shopId);
    if (error) throw new Error('Төслүүдийн зарын дансыг уншиж чадсангүй.');
    return new Set((data ?? []).map(row => accountKey(row.facebook_ad_account_id)).filter(Boolean));
}

/**
 * GET /api/marketing/facebook/ads/accounts
 * Тухайн төсөлд сонгох боломжтой Facebook Ad Account-уудыг буцаана (өөр төсөлд холбогдсоныг хасна).
 * System User токентой үед админ бус хэрэглэгч зөвхөн төслийнхөө сонгосон дансыг харна.
 */
export async function GET(_req: NextRequest) {
    try {
        const denied = await requireModule('marketing-roi');
        if (denied) return denied;
        const authShop = await getUserShop();
        if (!authShop) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const admin = supabaseAdmin();
        const { data: shop } = await admin
            .from('shops')
            .select('meta_ads_user_access_token, meta_ads_user_token_expires_at, facebook_ad_account_id')
            .eq('id', authShop.id)
            .single();

        const adsToken = metaAdsToken(shop);
        const canSelect = await canChooseAccount(shop);
        const selected = accountKey(shop?.facebook_ad_account_id);
        if (!canSelect && !selected) return NextResponse.json({ error: ADMIN_ONLY, admin_required: true }, { status: 403 });

        const [result, linkedElsewhere] = await Promise.all([getAdAccounts(adsToken), accountsLinkedElsewhere(admin, authShop.id)]);
        const accounts = (result.data || [])
            .filter(account => !linkedElsewhere.has(accountKey(account.id)))
            .filter(account => canSelect || accountKey(account.id) === selected);

        return NextResponse.json({
            accounts,
            selected_id: shop?.facebook_ad_account_id || null,
            can_select: canSelect,
        });
    } catch (error: any) {
        logger.error('[FB Ads Accounts] error:', { error });
        if (error?.message?.includes('дууссан')) {
            return NextResponse.json({ error: 'Token хугацаа дууссан', token_expired: true }, { status: 401 });
        }
        if (error?.message?.includes('холболтоо')) return NextResponse.json({ error: 'Meta Ads холболтоо хийнэ үү.', connect_required: true }, { status: 400 });
        if (error?.message?.includes('200') || error?.message?.includes('permission') || error?.message?.includes('ads_read')) {
            return NextResponse.json({
                error: 'ads_read зөвшөөрөл шаардлагатай. Facebook-аар дахин нэвтэрнэ үү.',
                permission_required: true,
            }, { status: 403 });
        }
        return NextResponse.json({ error: 'Ad account-ийн жагсаалт татахад алдаа' }, { status: 500 });
    }
}

/**
 * POST /api/marketing/facebook/ads/accounts
 * Хэрэглэгч сонгосон ad_account_id-г shops-д хадгална
 */
const SelectAccountSchema = z.object({ ad_account_id: z.string().trim().regex(/^act_\d{1,40}$/) });

export const POST = withRoute({ module: 'marketing-roi', access: 'write', error: 'Хадгалахад алдаа' }, async ({ request: req, shop: authShop }) => {
    const parsed = SelectAccountSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
        return NextResponse.json({ error: 'ad_account_id шаардлагатай' }, { status: 400 });
    }
    const adAccountId = parsed.data.ad_account_id;

    const admin = supabaseAdmin();
    const { data: shop, error: readError } = await admin.from('shops')
        .select('meta_ads_user_access_token,meta_ads_user_token_expires_at,facebook_ad_account_id').eq('id', authShop.id).single();
    if (readError) return NextResponse.json({ error: 'Meta Ads тохиргоог уншиж чадсангүй.' }, { status: 503 });
    // marketing-roi кампанит ажил татахын өмнө сонгосон дансаа дахин илгээдэг — өөрчлөлтгүй бол OK.
    if (accountKey(shop?.facebook_ad_account_id) === accountKey(adAccountId)) {
        return NextResponse.json({ ok: true, ad_account_id: adAccountId });
    }
    if (!await canChooseAccount(shop)) return NextResponse.json({ error: ADMIN_ONLY, admin_required: true }, { status: 403 });
    const accounts = await getAdAccounts(metaAdsToken(shop));
    if (!accounts.data.some(account => account.id === adAccountId)) {
        return NextResponse.json({ error: 'Энэ зарын данс Meta Ads холболтод байхгүй байна.' }, { status: 403 });
    }
    const { error } = await admin
        .from('shops')
        .update({ facebook_ad_account_id: adAccountId })
        .eq('id', authShop.id);

    // Нэг зарын данс зөвхөн нэг төсөлд (shops_facebook_ad_account_unique).
    if (error?.code === '23505') {
        return NextResponse.json({ error: 'Энэ зарын данс өөр төсөлд холбогдсон байна' }, { status: 409 });
    }
    if (error) {
        logger.error('[FB Ads Accounts POST] error:', { error });
        return NextResponse.json({ error: 'Хадгалахад алдаа' }, { status: 500 });
    }

    return NextResponse.json({ ok: true, ad_account_id: adAccountId });
});
