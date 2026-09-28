import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireModule, requireModuleWrite } from '@/lib/auth/require-permission';
import { getUserId, getUserShop } from '@/lib/auth/supabase-auth';
import { supabaseAdmin } from '@/lib/supabase';
import { META_IMPORT_LIMITS, MetaImportOptions, parseMetaSpendFile, type MetaImportSummary } from '@/lib/marketing/meta-spend-import';

export const runtime = 'nodejs';
export const maxDuration = 60;
const headers = { 'Cache-Control': 'private, no-store' };
const unavailable = () => NextResponse.json({ error: 'Meta файл импортын мэдээлэлд холбогдож чадсангүй. Импортын шинэчлэл суусан эсэхийг шалгана уу.' }, { status: 503 });

export async function GET() {
    const denied = await requireModule('marketing-roi'); if (denied) return denied;
    const shop = await getUserShop();
    if (!shop) return NextResponse.json({ error: 'Байгууллагад хандах эрх алга.' }, { status: 403 });
    const { data, error } = await supabaseAdmin().from('meta_spend_imports')
        .select('id,file_name,account_id,currency,from_date,to_date,created_at,summary')
        .eq('shop_id', shop.id).order('created_at', { ascending: false }).limit(5);
    if (error) return unavailable();
    return NextResponse.json({ imports: data }, { headers });
}

export async function POST(request: NextRequest) {
    const denied = await requireModuleWrite('marketing-roi'); if (denied) return denied;
    const shop = await getUserShop(), user = await getUserId();
    if (!shop || !user) return NextResponse.json({ error: 'Байгууллагад хандах эрх алга.' }, { status: 403 });
    if (Number(request.headers.get('content-length')) > META_IMPORT_LIMITS.bytes + 65536)
        return NextResponse.json({ error: '2 MB хүртэл файл оруулна уу.' }, { status: 413 });
    try {
        const form = await request.formData();
        const action = z.enum(['preview', 'commit']).parse(form.get('action'));
        const requestId = z.uuid().parse(form.get('requestId'));
        const expected = action === 'commit' ? z.string().regex(/^[a-f0-9]{32}$/).parse(form.get('fingerprint')) : null;
        const file = form.get('file');
        if (!(file instanceof File) || !file.size || file.size > META_IMPORT_LIMITS.bytes || !/\.(csv|xlsx|tsv)$/i.test(file.name))
            throw new Error('2 MB хүртэл .csv, .xlsx эсвэл .tsv файл сонгоно уу. .xls файлыг CSV болгон хадгална уу.');
        const options = MetaImportOptions.parse(JSON.parse(String(form.get('options'))));
        const parsed = await parseMetaSpendFile(await file.arrayBuffer(), options);
        const { data, error } = await supabaseAdmin().rpc('import_meta_daily_spend', {
            p_shop: shop.id, p_user: user, p_id: requestId, p_file: file.name.slice(0, 255), p_account: parsed.accountId,
            p_currency: parsed.currency, p_timezone: parsed.timezone, p_rate: options.mntPerUnit,
            p_rows: parsed.rows, p_commit: action === 'commit', p_expected: expected,
        });
        if (error?.code === '40001' || error?.code === '23505')
            return NextResponse.json({ error: 'Зардлын мэдээлэл өөрчлөгдсөн байна. Файлыг дахин шалгаж баталгаажуулна уу.' }, { status: 409 });
        if (error?.code === '23514')
            return NextResponse.json({ error: 'Зарын дансны валют, цагийн бүс эсвэл мөрүүд хадгалсан мэдээлэлтэй тохирохгүй байна.' }, { status: 400 });
        if (error || !data) return unavailable();
        const { rows, ...info } = parsed;
        return NextResponse.json({ ...info, ...data as MetaImportSummary, sample: rows.slice(0, 20) }, { headers });
    } catch (error) {
        return NextResponse.json({ error: error instanceof z.ZodError ? 'Дансны цагийн бүс, валют, эерэг ханш болон импортын тохиргоог шалгана уу.'
            : error instanceof SyntaxError ? 'Импортын тохиргоо буруу байна.'
                : error instanceof Error ? error.message : 'Файлыг уншиж чадсангүй.' }, { status: 400 });
    }
}
