/**
 * apiContext — route бүрийн НЭГ оролтын цэг.
 *
 * Аудитаар илэрсэн хоёр системийн асуудлыг НЭГ ДОР шийднэ:
 *   1. Зөвшөөрөл (RBAC) route-уудын 27%-д л хэрэгжсэн байсан — хөгжүүлэгч
 *      санавал `requireModule` дуудна, санахгүй бол алгасна. Дефолт нь
 *      «хамгаалалтгүй» байв.
 *   2. Аудит 86 mutating route-оос 5-д нь л бичигддэг байсан.
 *
 * Энэ функц нь дараах 4 зүйлийг нэг дуудалтаар гүйцэтгэнэ:
 *   • хэрэглэгчийг тодорхойлох (ганц зөвшөөрөгдсөн зам — Supabase Auth)
 *   • модуль + бичих/устгах эрхийг шалгах
 *   • зорилтот shop_id-г гишүүнчлэлээр баталгаажуулах
 *   • actor/shop/IP/UA урьдчилан бөглөгдсөн аудит бичигч буцаах
 *
 * Эрхгүй тохиолдолд `status:'denied'` аудит бичилт АВТОМАТААР хийгдэнэ —
 * ингэснээр эрх давах оролдлого мөрдөгдөх боломжтой болно.
 *
 * Хэрэглээ:
 *   const r = await apiContext(req, { module: 'contracts', action: 'write' });
 *   if ('error' in r) return r.error;
 *   const { ctx } = r;
 *   ...
 *   await ctx.audit({ entity: 'contract', entityId: id, action: 'update', ...diffFields(before, after) });
 */

import { NextResponse } from 'next/server';
import { resolveApiUser } from '@/lib/auth/resolve-user';
import { supabaseAdmin, getAccessibleShopIds } from '@/lib/auth/supabase-auth';
import { fetchRolePermissions, type RolePermissions } from '@/lib/rbac';
import { logActivity, type AuditActor, type AuditEvent, type AuditSource } from '@/lib/audit/log';
import { logger } from '@/lib/utils/logger';

export type ApiAction = 'read' | 'write' | 'delete';

/** ctx.audit-д дамжуулах хэсэг — actor/shop/request нь автоматаар бөглөгдөнө. */
export type ScopedAuditEvent = Omit<AuditEvent, 'shopId' | 'actor' | 'request'>;

export interface ApiContext {
    userId: string;
    userEmail: string;
    /** user_profiles.full_name — тайлан, attribution-д хэрэглэнэ */
    userName: string | null;
    role: string;
    permissions: RolePermissions;
    shopId: string;
    /** Хэрэглэгчийн хандах эрхтэй бүх shop (олон төслийн шалгалтад) */
    accessibleShopIds: Set<string>;
    /** actor/shop/IP/UA урьдчилан бөглөгдсөн аудит бичигч */
    audit: (event: ScopedAuditEvent) => Promise<void>;
}

export interface ApiContextOptions {
    /** Шаардагдах модуль (RBAC) */
    module: string;
    /** Шаардагдах үйлдлийн түвшин. Өгөөгүй бол зөвхөн модулийн хандалт шалгана. */
    action?: ApiAction;
    /**
     * Зорилтот shop-ыг тодорхойлох. Өгөөгүй бол `x-shop-id` header, дараа нь
     * хэрэглэгчийн эхний shop. Аль ч тохиолдолд гишүүнчлэлээр шалгагдана.
     */
    shopId?: string | null;
    /** Аудитын эх сурвалж (дефолт 'api') */
    source?: AuditSource;
}

type ContextResult = { ctx: ApiContext } | { error: NextResponse };

/** Хэрэглэгчийн дүрийг тодорхойлно (user_roles → admins fallback). */
async function resolveRole(userId: string): Promise<string> {
    const db = supabaseAdmin();

    const { data: roleRow } = await db
        .from('user_roles').select('role').eq('user_id', userId).maybeSingle();
    if (roleRow?.role) return roleRow.role;

    const { data: adminRow } = await db
        .from('admins').select('role').eq('user_id', userId).eq('is_active', true).maybeSingle();
    if (adminRow?.role) return adminRow.role;

    return 'viewer';
}

async function resolveUserName(userId: string): Promise<string | null> {
    try {
        const { data } = await supabaseAdmin()
            .from('user_profiles').select('full_name').eq('user_id', userId).maybeSingle();
        return data?.full_name ?? null;
    } catch {
        return null;
    }
}

/** Татгалзсан үйлдлийг ч аудитад үлдээнэ — аюулгүй байдлын мөрдлөгийн үндэс. */
async function denied(
    req: Request,
    opts: ApiContextOptions,
    reason: string,
    httpStatus: number,
    actor: { id?: string | null; name?: string | null; role?: string | null },
    shopId: string | null,
): Promise<{ error: NextResponse }> {
    await logActivity({
        shopId,
        actor,
        source: opts.source ?? 'api',
        entity: opts.module,
        action: opts.action ?? 'read',
        summary: `Эрхгүй хандалт: ${reason}`,
        status: 'denied',
        errorMessage: reason,
        request: req,
    });

    return {
        error: NextResponse.json(
            { error: httpStatus === 401 ? 'Нэвтрэх шаардлагатай' : reason },
            { status: httpStatus },
        ),
    };
}

export async function apiContext(
    req: Request,
    opts: ApiContextOptions,
): Promise<ContextResult> {
    // 1) Хэрэглэгч
    const user = await resolveApiUser();
    if (!user) {
        // Нэвтрээгүй хандалтыг бүрэн бүртгэвэл лог хог болно — зөвхөн
        // мутаци оролдлогыг тэмдэглэнэ.
        if (opts.action && opts.action !== 'read') {
            await logActivity({
                shopId: null,
                source: opts.source ?? 'api',
                entity: opts.module,
                action: opts.action,
                summary: 'Нэвтрээгүй хэрэглэгчийн бичих оролдлого',
                status: 'denied',
                request: req,
            });
        }
        return { error: NextResponse.json({ error: 'Нэвтрэх шаардлагатай' }, { status: 401 }) };
    }

    const role = await resolveRole(user.id);
    const permissions = await fetchRolePermissions(role);
    const userName = await resolveUserName(user.id);
    const actor = { id: user.id, name: userName, role };

    // 2) Зорилтот shop — гишүүнчлэлээр баталгаажуулна
    const accessibleShopIds = await getAccessibleShopIds(user.id);
    const requested = opts.shopId ?? req.headers.get('x-shop-id') ?? null;
    let shopId: string | null = requested;

    if (shopId && !accessibleShopIds.has(shopId)) {
        return denied(req, opts, 'Энэ төсөлд хандах эрхгүй', 403, actor, null);
    }
    if (!shopId) {
        shopId = accessibleShopIds.values().next().value ?? null;
    }
    if (!shopId) {
        return denied(req, opts, 'Холбогдсон төсөл олдсонгүй', 403, actor, null);
    }

    // 3) Модуль + үйлдлийн эрх (super_admin бүх шалгалтыг давна)
    if (role !== 'super_admin') {
        if (!permissions.modules.includes(opts.module)) {
            return denied(req, opts, 'Энэ хэсэгт хандах эрх танд алга', 403, actor, shopId);
        }
        if (opts.action === 'write' && !permissions.canWrite) {
            return denied(req, opts, 'Энэ үйлдлийг хийх эрх (бичих) танд алга', 403, actor, shopId);
        }
        if (opts.action === 'delete' && !permissions.canDelete) {
            return denied(req, opts, 'Энэ үйлдлийг хийх эрх (устгах) танд алга', 403, actor, shopId);
        }
    }

    const scopedShopId = shopId;
    const source = opts.source ?? 'api';

    const ctx: ApiContext = {
        userId: user.id,
        userEmail: user.email,
        userName,
        role,
        permissions,
        shopId: scopedShopId,
        accessibleShopIds,
        audit: (event) =>
            logActivity({ ...event, shopId: scopedShopId, actor, source, request: req }),
    };

    return { ctx };
}

/**
 * Аудит бичих БОГИНО зам — эрхийн шалгалтаа аль хэдийн хийсэн route-д.
 *
 * `apiContext`-ыг бүрэн нэвтрүүлэх нь зөв боловч аль хэдийн зөв guard-тай
 * (`requireModuleWrite` г.м) route-уудыг бүтнээр дахин бичих нь дэмий
 * регрессийн эрсдэл дагуулна. Тэдгээрт энэ туслахаар аудитыг нэг мөрөөр
 * нэмнэ — actor (id/нэр/дүр), IP, user-agent автоматаар бөглөгдөнө.
 *
 *   await auditFor(request, authShop.id, {
 *       entity: 'contract', entityId: id, action: 'create',
 *       summary: `${row.contract_number} гэрээ үүсгэв`, after: row,
 *   });
 */
export async function auditFor(
    req: Request | null,
    shopId: string | null,
    event: ScopedAuditEvent,
    source: AuditSource = 'api',
): Promise<void> {
    try {
        const user = await resolveApiUser();
        const actor: AuditActor = user
            ? { id: user.id, name: await resolveUserName(user.id), role: await resolveRole(user.id) }
            : {};

        await logActivity({ ...event, shopId, actor, source, request: req });
    } catch (err) {
        logger.warn('[auditFor] бичилт амжилтгүй', { error: String(err) });
    }
}

/**
 * Route-ийн catch блокт хэрэглэх туслах — алдааг ч аудитад үлдээнэ.
 * Ингэснээр «үйлдэл эхэлсэн ч дуусаагүй» тохиолдол мөрдөгдөнө.
 */
export async function auditError(
    ctx: ApiContext | null,
    entity: string,
    action: string,
    error: unknown,
): Promise<void> {
    if (!ctx) return;
    try {
        await ctx.audit({
            entity,
            action,
            status: 'error',
            errorMessage: error instanceof Error ? error.message : String(error),
        });
    } catch (e) {
        logger.warn('[apiContext] auditError failed', { error: String(e) });
    }
}
