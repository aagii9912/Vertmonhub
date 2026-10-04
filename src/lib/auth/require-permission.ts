import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getUserId, supabaseAdmin } from '@/lib/auth/supabase-auth';
import { fetchRolePermissions, type RolePermissions } from '@/lib/rbac';

type ResolvedPermissions = { role: string; permissions: RolePermissions };

/**
 * Нэг хүсэлтэд эрхийг нэг л удаа уншина (requireModule ба төслийн хүрээ хоёулаа дууддаг).
 * Түлхүүр нь тухайн хүсэлтийн cookie store; хүсэлт хооронд кэш байхгүй тул strict
 * эрх (DB-ийн одоогийн grant) хэвээр. Хүсэлтээс гадуур (скрипт, тест) memo алгасна.
 */
const requestPermissions = new WeakMap<object, Promise<ResolvedPermissions | null>>();

async function currentRequestKey(): Promise<object | null> {
    try {
        return await cookies();
    } catch {
        return null;
    }
}

/**
 * Хэрэглэгчийн дүр + RBAC эрхийг тодорхойлно (user_roles → fetchRolePermissions, strict).
 */
export async function resolvePermissions(): Promise<ResolvedPermissions | null> {
    const key = await currentRequestKey();
    const cached = key ? requestPermissions.get(key) : undefined;
    if (cached) return cached;
    const pending = loadPermissions();
    if (key) requestPermissions.set(key, pending);
    try {
        const resolved = await pending;
        if (!resolved && key) requestPermissions.delete(key);
        return resolved;
    } catch (error) {
        if (key) requestPermissions.delete(key);
        throw error;
    }
}

async function loadPermissions(): Promise<ResolvedPermissions | null> {
    const userId = await getUserId();
    if (!userId) return null;

    const db = supabaseAdmin();
    // Ганц эх сурвалж: user_roles. (Хуучин `admins` хүснэгт prod DB-д байхгүй тул
    // fallback query бүр алдаа залгидаг байсан — 2026-09 review M2/M6.)
    const { data: roleRow, error: roleError } = await db.from('user_roles').select('role').eq('user_id', userId).maybeSingle();
    if (roleError) return null;
    const role = roleRow?.role || 'viewer';
    const permissions = await fetchRolePermissions(role, db, true).catch(() => null);
    if (!permissions) return null;
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
