import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getUserId, supabaseAdmin } from '@/lib/auth/supabase-auth';
import { getAdminUser } from '@/lib/admin/auth';
import { logAdminAudit } from '@/lib/admin/audit';
import { provisionUserAccess } from '@/lib/admin/user-provisioning';
import { safeErrorResponse } from '@/lib/utils/safe-error';

const input = z.object({
    userId: z.uuid(),
    shopIds: z.array(z.guid()).max(100),
}).strict();

/**
 * PUT /api/admin/users/projects — Ажилтны хандах төслүүдийг (shop = төсөл) тохируулна.
 *
 * Нэмсэн төсөлд гишүүнчлэл үүснэ. Борлуулалтын менежерийг тухайн төслийн бүртгэлд
 * (roster) профайлын нэрээр холбож, ганц төсөлтэй бол төслийн лидийг шууд хариуцуулна.
 * Хассан төсөлд гишүүнчлэл устаж, менежерийн холбоос салж идэвхгүй болно (лид нь нэрээрээ
 * үлдэх тул админ дахин хуваарилна). Эзэмшигчийн төслийг эндээс хасахгүй.
 */
export async function PUT(request: NextRequest) {
    try {
        const actorId = await getUserId();
        if (!actorId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        const admin = await getAdminUser();
        if (!admin || admin.role !== 'super_admin') return NextResponse.json({ error: 'Super admin эрх шаардлагатай' }, { status: 403 });

        const parsed = input.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return NextResponse.json({ error: 'Хэрэглэгч эсвэл төсөл буруу байна' }, { status: 400 });
        const { userId } = parsed.data;
        const wanted = new Set(parsed.data.shopIds);

        const db = supabaseAdmin();
        const [roleResult, shopsResult, membersResult, profileResult] = await Promise.all([
            db.from('user_roles').select('role').eq('user_id', userId).maybeSingle(),
            db.from('shops').select('id, name, user_id'),
            db.from('shop_members').select('shop_id').eq('user_id', userId),
            db.from('user_profiles').select('email').eq('id', userId).maybeSingle(),
        ]);
        for (const result of [roleResult, shopsResult, membersResult, profileResult]) if (result.error) throw result.error;
        if (!roleResult.data) return NextResponse.json({ error: 'Хэрэглэгч олдсонгүй' }, { status: 404 });
        const role = roleResult.data.role as string;
        const shops = new Map((shopsResult.data || []).map(shop => [shop.id as string, shop]));
        if ([...wanted].some(id => !shops.has(id))) return NextResponse.json({ error: 'Сонгосон төсөл олдсонгүй' }, { status: 400 });

        const current = new Set((membersResult.data || []).map(row => row.shop_id as string));
        const owned = new Set([...shops.values()].filter(shop => shop.user_id === userId).map(shop => shop.id as string));
        const add = [...wanted].filter(id => !current.has(id) && !owned.has(id));
        const remove = [...current].filter(id => !wanted.has(id));
        if (remove.some(id => owned.has(id))) return NextResponse.json({ error: 'Эзэмшигчийн төслийг хасах боломжгүй' }, { status: 409 });
        if (actorId === userId && remove.length) return NextResponse.json({ error: 'Өөрийгөө төслөөс хасах боломжгүй' }, { status: 409 });

        const added: string[] = [];
        for (const shopId of add) {
            if (role === 'sales_manager') {
                // Гишүүнчлэл + менежерийн бүртгэлийн холбоос + төслийн харьяаллыг нэг дүрмээр үүсгэнэ.
                const failure = await provisionUserAccess(db, {
                    actorId, userId, email: profileResult.data?.email || '', role, shopId, isNew: false,
                });
                if (failure) return NextResponse.json({ ...failure, added }, { status: failure.status });
            } else {
                const { error } = await db.from('shop_members').insert({ shop_id: shopId, user_id: userId, role: 'member' });
                if (error && error.code !== '23505') throw error;
            }
            added.push(shopId);
        }

        for (const shopId of remove) {
            // Хассан төслийн менежерийн холбоосыг салгаж идэвхгүй болгоно — эрх үлдэхгүй.
            const { error: rosterError } = await db.from('sales_managers').update({ user_id: null, is_active: false })
                .eq('shop_id', shopId).eq('user_id', userId);
            if (rosterError) throw rosterError;
            const { error } = await db.from('shop_members').delete().eq('shop_id', shopId).eq('user_id', userId);
            if (error) throw error;
        }

        await logAdminAudit({ actorId, action: 'user.projects_update', targetId: userId, meta: { added, removed: remove } });
        return NextResponse.json({ success: true, added, removed: remove });
    } catch (error) {
        return safeErrorResponse(error, 'Хэрэглэгчийн төслийн эрх хадгалахад алдаа гарлаа');
    }
}
