import { NextRequest, NextResponse } from 'next/server';
import { getUserShop } from '@/lib/auth/supabase-auth';
import { requireModule, requireModuleWrite } from '@/lib/auth/require-permission';
import { supabaseAdmin } from '@/lib/supabase';
import { safeErrorResponse } from '@/lib/utils/safe-error';

/**
 * Маркетингийн энгийн хүснэгтүүдийн shop-scoped уншилт/бичилт.
 *
 * 2026-09 review (M23 / Wave 2.2): `marketing/*` хуудсууд browser-оос Supabase-д шууд
 * (зөвхөн RLS-д найдаж) select/insert хийдэг байв. Одоо энэ route RBAC (`marketing-roi`)
 * + `getUserShop` (x-shop-id гишүүнчлэл) шалгаад shop_id-г СЕРВЕР талд тамгална.
 *
 *   GET  /api/marketing/data/<table>?select=id,status&order=created_at.desc&limit=100
 *        &eq.type=email&gte.scheduled_date=2026-09-01&lte.scheduled_date=2026-09-30
 *   POST /api/marketing/data/<table>   body = мөр (shop_id/id-г үл тоож серверээс тавина)
 */
const TABLES = new Set([
    'ad_campaigns',
    'content_calendar',
    'marketing_campaigns',
    'message_campaigns',
    'brand_mentions',
    'social_posts',
]);
const COL = /^[a-z_][a-z0-9_]{0,60}$/;
const SELECT = /^(\*|[a-z_][a-z0-9_]*)(,[a-z_][a-z0-9_]*)*$/;
const MAX_LIMIT = 500;

function tableOf(param: string): string | null {
    return TABLES.has(param) ? param : null;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ table: string }> }) {
    try {
        const denied = await requireModule('marketing-roi');
        if (denied) return denied;
        const authShop = await getUserShop();
        if (!authShop) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const table = tableOf((await params).table);
        if (!table) return NextResponse.json({ error: 'Хүснэгт зөвшөөрөгдөөгүй' }, { status: 404 });

        const sp = request.nextUrl.searchParams;
        const select = SELECT.test(sp.get('select') || '*') ? (sp.get('select') || '*') : '*';
        const limit = Math.min(MAX_LIMIT, Math.max(1, Number(sp.get('limit')) || 200));

        let q = supabaseAdmin().from(table).select(select).eq('shop_id', authShop.id).limit(limit);

        const order = sp.get('order');
        if (order) {
            const [col, dir] = order.split('.');
            if (COL.test(col)) q = q.order(col, { ascending: dir !== 'desc', nullsFirst: false });
        }
        for (const [key, value] of sp.entries()) {
            const m = key.match(/^(eq|gte|lte|gt|lt|neq)\.([a-z_][a-z0-9_]*)$/);
            if (!m || value.length > 200) continue;
            const [, op, col] = m;
            if (col === 'shop_id') continue;
            q = (q as any)[op](col, value);
        }

        const { data, error } = await q;
        if (error) return NextResponse.json({ error: 'Уншихад алдаа гарлаа' }, { status: 400 });
        return NextResponse.json({ rows: data || [] }, { headers: { 'Cache-Control': 'private, no-store' } });
    } catch (error) {
        return safeErrorResponse(error, 'Маркетингийн өгөгдөл уншихад алдаа гарлаа');
    }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ table: string }> }) {
    try {
        const denied = await requireModuleWrite('marketing-roi');
        if (denied) return denied;
        const authShop = await getUserShop();
        if (!authShop) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const table = tableOf((await params).table);
        if (!table) return NextResponse.json({ error: 'Хүснэгт зөвшөөрөгдөөгүй' }, { status: 404 });

        const body = await request.json().catch(() => null);
        if (!body || typeof body !== 'object' || Array.isArray(body)) {
            return NextResponse.json({ error: 'Буруу өгөгдөл' }, { status: 400 });
        }
        const row: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(body as Record<string, unknown>)) {
            if (!COL.test(k) || ['shop_id', 'id', 'created_at', 'updated_at'].includes(k)) continue;
            if (typeof v === 'string' && v.length > 5000) return NextResponse.json({ error: `${k} хэт урт` }, { status: 400 });
            row[k] = v;
        }
        if (Object.keys(row).length === 0) return NextResponse.json({ error: 'Хоосон мөр' }, { status: 400 });
        row.shop_id = authShop.id;

        const { data, error } = await supabaseAdmin().from(table).insert(row).select().single();
        if (error) return NextResponse.json({ error: 'Хадгалахад алдаа гарлаа', details: [error.message] }, { status: 400 });
        return NextResponse.json({ row: data }, { status: 201 });
    } catch (error) {
        return safeErrorResponse(error, 'Маркетингийн өгөгдөл хадгалахад алдаа гарлаа');
    }
}
