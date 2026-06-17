import { NextRequest, NextResponse } from 'next/server';
import { getUserShop } from '@/lib/auth/supabase-auth';
import { resolvePermissions } from '@/lib/auth/require-permission';
import { supabaseAdmin } from '@/lib/supabase';
import { safeErrorResponse } from '@/lib/utils/safe-error';

/**
 * GET /api/dashboard/ai-audit
 * AI Orchestrator-ээр хийсэн write/delete/admin үйлдлийн аудит лог (shop-scoped).
 * Зөвхөн админ эрхтэй (canAccessAdmin / super_admin) хэрэглэгч харна.
 */
export async function GET(request: NextRequest) {
    try {
        const perm = await resolvePermissions();
        if (!perm) return NextResponse.json({ error: 'Нэвтрэх шаардлагатай' }, { status: 401 });
        if (perm.role !== 'super_admin' && !perm.permissions.canAccessAdmin) {
            return NextResponse.json({ error: 'Аудит харах эрх танд алга' }, { status: 403 });
        }

        const authShop = await getUserShop();
        if (!authShop) return NextResponse.json({ error: 'Холбогдсон shop олдсонгүй' }, { status: 403 });

        const db = supabaseAdmin();
        const { data: rows, error } = await db
            .from('ai_audit_log')
            .select('id, user_id, tool, args, success, created_at')
            .eq('shop_id', authShop.id)
            .order('created_at', { ascending: false })
            .limit(100);
        if (error) return NextResponse.json({ error: 'Аудит татахад алдаа гарлаа' }, { status: 500 });

        // Хэрэглэгчийн нэрсийг багцаар тодорхойлно
        const userIds = [...new Set((rows || []).map((r) => r.user_id).filter(Boolean))] as string[];
        const nameById: Record<string, string> = {};
        if (userIds.length) {
            const { data: profs } = await db.from('user_profiles').select('id, full_name, email').in('id', userIds);
            (profs || []).forEach((p) => { nameById[p.id] = p.full_name || p.email || p.id; });
        }

        const entries = (rows || []).map((r) => ({
            id: r.id,
            tool: r.tool,
            success: r.success,
            created_at: r.created_at,
            user: r.user_id ? (nameById[r.user_id] || 'Тодорхойгүй') : 'Систем',
            args: r.args || {},
        }));

        return NextResponse.json({ entries });
    } catch (error) {
        return safeErrorResponse(error, 'Аудит татахад алдаа гарлаа');
    }
}
