/**
 * Хэрэглэгчийн бүртгэлийн «гинжийг» бүрэн болгох модуль.
 *
 * ЯАГААД ХЭРЭГТЭЙ ВЭ:
 * `supabase/migrations/20260322_drop_auth_triggers.sql` нь `handle_new_user`
 * триггерийг устгахдаа «user_profiles-ыг апп код үүсгэнэ» гэж тэмдэглэсэн ч
 * үүсгэдэг код нь зөвхөн админаар хэрэглэгч үүсгэх/урих замд бичигдсэн байв.
 * Google/Facebook-ээр нэвтэрсэн хүн (нэвтрэх хуудсанд товч нь бий) дараах
 * бүх мөргүй үлдэж байсан:
 *   • user_profiles  → resolveManagerIdentity нэр олохгүй → самбар чимээгүй хоосон
 *   • shop_members   → getUserShop() null → БҮХ дашбоардын API 401
 *   • user_roles     → RBAC `viewer` руу унана
 *
 * Энэ модуль нэвтрэлт бүрийн дараа (auth callback) best-effort ажиллаж
 * профайл болон shop гишүүнчлэлийг бүрдүүлнэ.
 *
 * ЧУХАЛ ЗАРЧИМ: РОЛЬ АВТОМАТААР ОЛГОХГҮЙ. Роль бол эрх — түүнийг зөвхөн админ
 * гараар олгоно. Роль байхгүй хэрэглэгч нэвтэрч, «эрх хүлээгдэж байна» гэсэн
 * тайлбар харна (чимээгүй хоосон биш).
 */

import { supabaseAdmin } from '@/lib/supabase';
import { logger } from '@/lib/utils/logger';

export interface ProvisionResult {
    /** user_profiles мөр байгаа/үүссэн эсэх */
    hasProfile: boolean;
    /** Хандах боломжтой shop олдсон эсэх */
    hasShop: boolean;
    /** user_roles мөр байгаа эсэх (энэ модуль олгохгүй — зөвхөн мэдээлнэ) */
    hasRole: boolean;
    /** Энэ дуудлагаар шинээр үүссэн зүйлс (лог/оношилгоонд) */
    created: string[];
}

/** auth.users мета өгөгдлөөс харагдах нэрийг гаргана. */
function displayNameFrom(meta: Record<string, unknown> | null | undefined): string | null {
    if (!meta) return null;
    for (const key of ['full_name', 'name', 'user_name']) {
        const v = meta[key];
        if (typeof v === 'string' && v.trim()) return v.trim();
    }
    return null;
}

/**
 * Нэвтэрсэн хэрэглэгчийн профайл + shop гишүүнчлэлийг баталгаажуулна.
 * Best-effort: алдаа гарвал нэвтрэлтийг ЗОГСООХГҮЙ, зөвхөн лог бичнэ.
 */
export async function ensureUserProvisioned(userId: string): Promise<ProvisionResult> {
    const created: string[] = [];
    const result: ProvisionResult = { hasProfile: false, hasShop: false, hasRole: false, created };

    if (!userId) return result;

    try {
        const db = supabaseAdmin();

        const [{ data: authUser }, { data: profile }, { data: roleRow }] = await Promise.all([
            db.auth.admin.getUserById(userId),
            db.from('user_profiles').select('id, full_name').eq('id', userId).maybeSingle(),
            db.from('user_roles').select('user_id').eq('user_id', userId).maybeSingle(),
        ]);

        result.hasRole = !!roleRow;

        const email = authUser?.user?.email || null;
        const metaName = displayNameFrom(authUser?.user?.user_metadata as Record<string, unknown>);

        // ---- 1) user_profiles ----
        if (!profile) {
            // full_name-д имэйл БИЧИХГҮЙ. Нэр байхгүй бол null үлдээнэ —
            // ингэснээр «нэр тодорхойгүй» гэдэг ил харагдаж, roster-той худал
            // таарах («имэйл» нэртэй менежер) эрсдэлээс сэргийлнэ.
            const { error } = await db.from('user_profiles').upsert(
                { id: userId, email, full_name: metaName },
                { onConflict: 'id' },
            );
            if (error) {
                logger.warn('[ensureUserProvisioned] профайл үүсгэж чадсангүй', { error: error.message });
            } else {
                created.push('user_profiles');
                result.hasProfile = true;
            }
        } else {
            result.hasProfile = true;
            // Профайл байгаа ч нэр хоосон, харин OAuth мета нэр өгсөн бол дүүргэнэ
            if (!profile.full_name && metaName) {
                const { error } = await db
                    .from('user_profiles')
                    .update({ full_name: metaName })
                    .eq('id', userId);
                if (!error) created.push('user_profiles.full_name');
            }
        }

        // ---- 2) shop гишүүнчлэл ----
        const [{ data: owned }, { data: member }] = await Promise.all([
            db.from('shops').select('id').eq('user_id', userId).limit(1),
            db.from('shop_members').select('shop_id').eq('user_id', userId).limit(1),
        ]);

        if ((owned && owned.length) || (member && member.length)) {
            result.hasShop = true;
        } else {
            // Зөвхөн НЭГ shop байгаа тохиолдолд автоматаар холбоно. Олон төсөлтэй
            // орчинд аль нь болохыг таах нь буруу — админ гараар оноох ёстой
            // (эс бөгөөс хэрэглэгч өөр төслийн өгөгдөл харах эрсдэлтэй).
            const { data: shops } = await db.from('shops').select('id').limit(2);
            if (shops && shops.length === 1) {
                const { error } = await db
                    .from('shop_members')
                    .upsert(
                        { shop_id: shops[0].id, user_id: userId, role: 'member' },
                        { onConflict: 'shop_id,user_id' },
                    );
                if (error) {
                    logger.warn('[ensureUserProvisioned] shop холбож чадсангүй', { error: error.message });
                } else {
                    created.push('shop_members');
                    result.hasShop = true;
                }
            }
        }
    } catch (error) {
        logger.warn('[ensureUserProvisioned] алдаа (нэвтрэлтийг зогсоохгүй)', {
            error: error instanceof Error ? error.message : String(error),
        });
    }

    return result;
}
