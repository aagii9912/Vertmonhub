import { NextRequest, NextResponse } from 'next/server';
import { getUserShop } from '@/lib/auth/supabase-auth';
import { requireModule, requireModuleWrite } from '@/lib/auth/require-permission';
import { supabaseAdmin } from '@/lib/supabase';
import { MetaSyncInput, syncMetaSpend } from '@/lib/marketing/meta-spend';
import { safeErrorResponse } from '@/lib/utils/safe-error';
export const maxDuration = 180;

export async function GET() {
    const denied = await requireModule('marketing-roi');
    if (denied) return denied;
    const shop = await getUserShop();
    if (!shop) return NextResponse.json({ error: 'Нэвтрэх шаардлагатай' }, { status: 401 });
    try {
        const db = supabaseAdmin();
        const { data: config, error } = await db.from('shops').select('facebook_ad_account_id').eq('id', shop.id).single();
        if (error) throw error;
        const accountId = config?.facebook_ad_account_id ? `act_${config.facebook_ad_account_id.replace(/^act_/, '')}` : null;
        const { data: status, error: readError } = accountId ? await db.from('meta_spend_sync').select('account_id,currency,timezone,mnt_per_unit,last_attempt_at,last_success_at,last_from,last_to,last_error').eq('shop_id', shop.id).eq('account_id', accountId).maybeSingle() : { data: null, error: null };
        if (readError) throw readError;
        return NextResponse.json({ accountId, status }, { headers: { 'Cache-Control': 'private, no-store' } });
    } catch { return NextResponse.json({ error: 'Meta зардлын тохиргоог уншиж чадсангүй. Шинэчлэл суулгасан эсэхийг шалгана уу.' }, { status: 503 }); }
}
export async function POST(request: NextRequest) {
    const denied = await requireModuleWrite('marketing-roi');
    if (denied) return denied;
    const shop = await getUserShop();
    if (!shop) return NextResponse.json({ error: 'Нэвтрэх шаардлагатай' }, { status: 401 });
    const parsed = MetaSyncInput.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: '93 хүртэл өдрийн зөв хугацаа, эерэг ханш оруулна уу.' }, { status: 400 });
    try { return NextResponse.json({ success: true, ...await syncMetaSpend(supabaseAdmin(), shop.id, parsed.data) }); }
    catch (error) { return safeErrorResponse(error, error instanceof Error ? error.message : 'Meta синк амжилтгүй боллоо.'); }
}
