import { NextRequest, NextResponse } from 'next/server';
import { safeEqual } from '@/lib/crypto/safe-equal';
import { supabaseAdmin } from '@/lib/supabase';
import { loadReportInventory } from '@/lib/inventory/report-inventory';
import { publicInventoryFeed } from '@/lib/inventory/public-feed';
import { ubDateStr } from '@/lib/utils/date';
import { logger } from '@/lib/utils/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'private, no-store' };

/**
 * Orshin 3D (төслийн 3D аялал, киоск) байрны төлөвийг эндээс минут тутам уншина — сервер хооронд, зөвхөн GET.
 * Төлөв нь Лхагвын тайлан, AI `list_properties`-тэй нэг дүрэм (`loadReportInventory`); хариунд үнэ, менежер,
 * худалдан авагч байхгүй (`lib/inventory/public-feed.ts`). Баримт: docs/features/ORSHIN-INVENTORY-FEED-2026-11-20.md.
 */
export async function GET(request: NextRequest) {
    const secret = process.env.ORSHIN_INVENTORY_SECRET;
    const projectId = process.env.ORSHIN_INVENTORY_PROJECT_ID;
    if (!secret || !projectId) {
        logger.error('Orshin inventory feed is not configured');
        return NextResponse.json({ error: 'Service unavailable' }, { status: 503, headers: NO_STORE });
    }

    const authorization = request.headers.get('authorization');
    const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : null;
    if (!safeEqual(token, secret)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: NO_STORE });
    }

    try {
        const db = supabaseAdmin();
        const { data: project, error: projectError } = await db
            .from('projects')
            .select('id, shop_id, name')
            .eq('id', projectId)
            .maybeSingle();
        if (projectError || !project) {
            logger.error('Orshin inventory project is unavailable', { error: projectError });
            return NextResponse.json({ error: 'Service unavailable' }, { status: 503, headers: NO_STORE });
        }

        const inventory = await loadReportInventory(db, project.shop_id, ubDateStr());
        if (!inventory) {
            // Байр бүртгэгдээгүй төсөл: хоосон жагсаалтыг «бүгд худалдаанд гараагүй» гэж уншуулахгүй.
            return NextResponse.json({ error: 'Inventory unavailable' }, { status: 503, headers: NO_STORE });
        }
        return NextResponse.json(publicInventoryFeed(project.name, inventory), { headers: NO_STORE });
    } catch (error) {
        logger.error('Orshin inventory feed failed', { error });
        return NextResponse.json({ error: 'Байрны төлөв уншихад алдаа гарлаа' }, { status: 500, headers: NO_STORE });
    }
}
