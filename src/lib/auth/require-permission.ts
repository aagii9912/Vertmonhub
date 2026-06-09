import { NextResponse } from 'next/server';
import { getUserId, supabaseAdmin } from '@/lib/auth/supabase-auth';
import { fetchRolePermissions, type RolePermissions } from '@/lib/rbac';

/**
 * Хэрэглэгчийн дүр + RBAC эрхийг тодорхойлно (user_roles → admins fallback → fetchRolePermissions).
 */
export async function resolvePermissions(): Promise<{ role: string; permissions: RolePermissions } | null> {
    const userId = await getUserId();
    if (!userId) return null;

    const db = supabaseAdmin();
    let role = 'viewer';
    const { data: roleRow } = await db.from('user_roles').select('role').eq('user_id', userId).single();
    if (roleRow?.role) {
        role = roleRow.role;
    } else {
        const { data: adminRow } = await db
            .from('admins').select('role').eq('user_id', userId).eq('is_active', true).single();
        if (adminRow?.role) role = adminRow.role;
    }
    const permissions = await fetchRolePermissions(role);
    return { role, permissions };
}

/** Бичих эрх шаардана. Эрхгүй бол NextResponse (401/403), эрхтэй бол null буцаана. */
export async function requireWrite(): Promise<NextResponse | null> {
    const p = await resolvePermissions();
    if (!p) return NextResponse.json({ error: 'Нэвтрэх шаардлагатай' }, { status: 401 });
    if (!p.permissions.canWrite) {
        return NextResponse.json({ error: 'Энэ үйлдлийг хийх эрх (бичих) танд алга' }, { status: 403 });
    }
    return null;
}

/** Устгах эрх шаардана. Эрхгүй бол NextResponse (401/403), эрхтэй бол null буцаана. */
export async function requireDelete(): Promise<NextResponse | null> {
    const p = await resolvePermissions();
    if (!p) return NextResponse.json({ error: 'Нэвтрэх шаардлагатай' }, { status: 401 });
    if (!p.permissions.canDelete) {
        return NextResponse.json({ error: 'Энэ үйлдлийг хийх эрх (устгах) танд алга' }, { status: 403 });
    }
    return null;
}
