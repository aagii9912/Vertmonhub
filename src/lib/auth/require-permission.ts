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
    // Ганц эх сурвалж: user_roles. (Хуучин `admins` хүснэгт prod DB-д байхгүй тул
    // fallback query бүр алдаа залгидаг байсан — 2026-09 review M2/M6.)
    const { data: roleRow } = await db.from('user_roles').select('role').eq('user_id', userId).maybeSingle();
    const role = roleRow?.role || 'viewer';
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

/** Тухайн модульд хандах эрх шаардана (унших). */
export async function requireModule(module: string): Promise<NextResponse | null> {
    const p = await resolvePermissions();
    if (!p) return NextResponse.json({ error: 'Нэвтрэх шаардлагатай' }, { status: 401 });
    if (p.role === 'super_admin') return null;
    if (!p.permissions.modules.includes(module)) {
        return NextResponse.json({ error: 'Энэ хэсэгт хандах эрх танд алга' }, { status: 403 });
    }
    return null;
}

/**
 * Жагсаалтын АЛЬ НЭГ модульд хандах эрх шаардана (унших) — ж: байрны хайлт нь
 * properties, viewings, leads аль ч модультай хэрэглэгчид хэрэгтэй.
 */
export async function requireAnyModule(modules: string[]): Promise<NextResponse | null> {
    const p = await resolvePermissions();
    if (!p) return NextResponse.json({ error: 'Нэвтрэх шаардлагатай' }, { status: 401 });
    if (p.role === 'super_admin') return null;
    if (!modules.some((m) => p.permissions.modules.includes(m))) {
        return NextResponse.json({ error: 'Энэ хэсэгт хандах эрх танд алга' }, { status: 403 });
    }
    return null;
}

/** Модулийн хандалт + бичих эрх шаардана. */
export async function requireModuleWrite(module: string): Promise<NextResponse | null> {
    const p = await resolvePermissions();
    if (!p) return NextResponse.json({ error: 'Нэвтрэх шаардлагатай' }, { status: 401 });
    if (p.role === 'super_admin') return null;
    if (!p.permissions.modules.includes(module)) {
        return NextResponse.json({ error: 'Энэ хэсэгт хандах эрх танд алга' }, { status: 403 });
    }
    if (!p.permissions.canWrite) {
        return NextResponse.json({ error: 'Энэ үйлдлийг хийх эрх (бичих) танд алга' }, { status: 403 });
    }
    return null;
}

/** Модулийн хандалт + устгах эрх шаардана. */
export async function requireModuleDelete(module: string): Promise<NextResponse | null> {
    const p = await resolvePermissions();
    if (!p) return NextResponse.json({ error: 'Нэвтрэх шаардлагатай' }, { status: 401 });
    if (p.role === 'super_admin') return null;
    if (!p.permissions.modules.includes(module)) {
        return NextResponse.json({ error: 'Энэ хэсэгт хандах эрх танд алга' }, { status: 403 });
    }
    if (!p.permissions.canDelete) {
        return NextResponse.json({ error: 'Энэ үйлдлийг хийх эрх (устгах) танд алга' }, { status: 403 });
    }
    return null;
}
