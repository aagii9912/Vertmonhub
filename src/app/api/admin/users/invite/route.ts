import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, getUserId } from '@/lib/auth/supabase-auth';
import { safeErrorResponse } from '@/lib/utils/safe-error';
import { logAdminAudit } from '@/lib/admin/audit';

/**
 * POST /api/admin/users/invite — урих / нэвтрэх холбоос үүсгэх (super_admin).
 *
 * Имэйл АВТОМАТААР явуулахгүй — `action_link`-ийг буцааж, админ өөрөө хуулж илгээнэ
 * (гадагш үйлдэл хийхгүй, аюулгүй). Шинэ имэйл бол урилга (хэрэглэгч үүснэ),
 * бүртгэлтэй бол нэвтрэх (magiclink) холбоос үүснэ.
 */
export async function POST(request: NextRequest) {
    try {
        const userId = await getUserId();
        if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const supabase = supabaseAdmin();
        const { data: admin } = await supabase.from('admins').select('role').eq('user_id', userId).single();
        if (!admin || admin.role !== 'super_admin') {
            return NextResponse.json({ error: 'Super admin эрх шаардлагатай' }, { status: 403 });
        }

        const { email, role, shop_id, full_name } = await request.json();
        if (!email || typeof email !== 'string') {
            return NextResponse.json({ error: 'Имэйл шаардлагатай' }, { status: 400 });
        }

        const redirectTo = `${process.env.NEXT_PUBLIC_APP_URL || ''}/auth/callback`;

        // Эхлээд урилга (шинэ хэрэглэгч үүсгэнэ). Бүртгэлтэй бол magiclink руу шилжинэ.
        let mode: 'invite' | 'magiclink' = 'invite';
        let linkRes = await supabase.auth.admin.generateLink({
            type: 'invite',
            email,
            options: { redirectTo, data: { full_name: full_name || email } },
        });

        if (linkRes.error && /already|registered|exists/i.test(linkRes.error.message)) {
            mode = 'magiclink';
            linkRes = await supabase.auth.admin.generateLink({ type: 'magiclink', email, options: { redirectTo } });
        }

        if (linkRes.error || !linkRes.data) {
            return NextResponse.json({ error: 'Холбоос үүсгэхэд алдаа: ' + (linkRes.error?.message || 'тодорхойгүй') }, { status: 500 });
        }

        const actionLink = linkRes.data.properties?.action_link;
        const invitedUserId = linkRes.data.user?.id;
        const warnings: string[] = [];

        // Профайл + дүр + shop холболт (best-effort)
        if (invitedUserId) {
            await supabase.from('user_profiles').upsert(
                { id: invitedUserId, email, full_name: full_name || email },
                { onConflict: 'id' }
            );

            if (role) {
                const { error: roleErr } = await supabase
                    .from('user_roles')
                    .upsert({ user_id: invitedUserId, role }, { onConflict: 'user_id' });
                if (roleErr) warnings.push('Дүр оноох алдаа: ' + roleErr.message);
            }

            let targetShopId: string | null = shop_id || null;
            if (!targetShopId) {
                const { data: shopRows } = await supabase.from('shops').select('id').limit(2);
                if (shopRows && shopRows.length === 1) targetShopId = shopRows[0].id;
            }
            if (targetShopId) {
                const { error: memberErr } = await supabase
                    .from('shop_members')
                    .upsert({ shop_id: targetShopId, user_id: invitedUserId, role: 'member' }, { onConflict: 'shop_id,user_id' });
                if (memberErr) warnings.push('Shop холболтын алдаа: ' + memberErr.message);
            }
        }

        await logAdminAudit({ actorId: userId, action: 'user.invite', targetId: invitedUserId, meta: { email, role: role || 'viewer', mode } });

        return NextResponse.json({
            success: true,
            mode,
            email,
            action_link: actionLink,
            warning: warnings.length ? warnings.join(' / ') : null,
        });
    } catch (error) {
        console.error('POST /api/admin/users/invite error:', error);
        return safeErrorResponse(error, 'Урих холбоос үүсгэх үед алдаа гарлаа');
    }
}
