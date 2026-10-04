import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase';
import { getAdminUser } from '@/lib/admin/auth';
import { logAdminAudit } from '@/lib/admin/audit';
import { safeErrorResponse } from '@/lib/utils/safe-error';
import {
    elysiumSyncStatus, ElysiumSyncError, setElysiumSyncEnabled, syncElysiumLeads,
} from '@/lib/services/ElysiumLeadSync';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const NO_STORE = { 'Cache-Control': 'private, no-store' };
const RunSchema = z.object({ dryRun: z.boolean().optional() }).strict();
const EnableSchema = z.object({ enabled: z.boolean() }).strict();

const forbidden = () => NextResponse.json({ error: 'Зөвхөн super admin хандана' }, { status: 403 });

async function readBody(request: NextRequest): Promise<unknown> {
    const raw = await request.text().catch(() => '');
    if (!raw.trim()) return {};
    try { return JSON.parse(raw); } catch { return null; }
}

function syncError(error: unknown, fallback: string) {
    if (error instanceof ElysiumSyncError) return NextResponse.json({ error: error.message }, { status: error.status, headers: NO_STORE });
    return safeErrorResponse(error, fallback);
}

/** GET /api/admin/integrations/elysium — Elysium холболтын төлөв (тохиргоо, сүүлийн ажиллалт, ledger). */
export async function GET() {
    const admin = await getAdminUser();
    if (!admin) return forbidden();
    try {
        return NextResponse.json(await elysiumSyncStatus(supabaseAdmin()), { headers: NO_STORE });
    } catch (error) {
        return syncError(error, 'Холболтын төлөвийг уншиж чадсангүй');
    }
}

/**
 * POST /api/admin/integrations/elysium — `{ dryRun?: boolean }`.
 * «Шалгах» (dryRun) юу ч бичихгүй; «Одоо татах» нь cron-той ижил тулгалтыг шууд ажиллуулна
 * (идэвхжүүлээгүй байсан ч).
 */
export async function POST(request: NextRequest) {
    const admin = await getAdminUser();
    if (!admin) return forbidden();
    const parsed = RunSchema.safeParse(await readBody(request));
    if (!parsed.success) return NextResponse.json({ error: 'Хүсэлт буруу байна' }, { status: 400 });
    const dryRun = !!parsed.data.dryRun;
    try {
        const result = await syncElysiumLeads(supabaseAdmin(), { trigger: 'manual', dryRun });
        await logAdminAudit({
            actorId: admin.id, action: 'integration.elysium_sync', targetId: 'elysium',
            meta: {
                dryRun, read: result.read, pending: result.pending, imported: result.imported, matched: result.matched,
                invalid: result.invalid, failed: result.failed, remaining: result.remaining,
            },
        });
        return NextResponse.json({ result }, { headers: NO_STORE });
    } catch (error) {
        return syncError(error, 'Elysium лид татахад алдаа гарлаа');
    }
}

/** PATCH /api/admin/integrations/elysium — `{ enabled: boolean }`: 15 минут тутмын автомат татах. */
export async function PATCH(request: NextRequest) {
    const admin = await getAdminUser();
    if (!admin) return forbidden();
    const parsed = EnableSchema.safeParse(await readBody(request));
    if (!parsed.success) return NextResponse.json({ error: 'Хүсэлт буруу байна' }, { status: 400 });
    try {
        const saved = await setElysiumSyncEnabled(supabaseAdmin(), parsed.data.enabled, admin.id);
        await logAdminAudit({ actorId: admin.id, action: 'integration.elysium_enable', targetId: 'elysium', meta: { enabled: saved.enabled } });
        return NextResponse.json(saved, { headers: NO_STORE });
    } catch (error) {
        return syncError(error, 'Тохиргоо хадгалагдсангүй');
    }
}
