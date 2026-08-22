import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, getUserId } from '@/lib/auth/supabase-auth';
import { safeErrorResponse } from '@/lib/utils/safe-error';
import { logAdminAudit } from '@/lib/admin/audit';
import { sendInviteEmail } from '@/lib/email/email';
import { getAdminUser } from '@/lib/admin/auth';

/**
 * POST /api/admin/users/invite — урих / нэвтрэх холбоос үүсгэж имэйлээр илгээх (super_admin).
 *
 * Холбоосыг Resend-ээр имэйлээр АВТОМАТААР илгээнэ (best-effort). Илгээж чадаагүй бол
 * `action_link`-ийг буцаах тул админ гараар хуулж илгээж болно. Шинэ имэйл бол урилга
 * (хэрэглэгч үүснэ), бүртгэлтэй бол нэвтрэх (magiclink) холбоос үүснэ.
 */
export async function POST(request: NextRequest) {
    try {
        const userId = await getUserId();
        if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const supabase = supabaseAdmin();
        const admin = await getAdminUser();
        if (!admin || admin.role !== 'super_admin') {
            return NextResponse.json({ error: 'Super admin эрх шаардлагатай' }, { status: 403 });
        }

        const { email, role, shop_id, full_name } = await request.json();
        if (!email || typeof email !== 'string') {
            return NextResponse.json({ error: 'Имэйл шаардлагатай' }, { status: 400 });
        }

        // Бүтэн нэр ЗААВАЛ. Өмнө нь `full_name || email` гэж уналт хийдэг байсан тул
        // user_profiles.full_name нь имэйл болж, sales_managers бүртгэлийн нэртэй
        // хэзээ ч таарахгүй → менежерийн самбар чимээгүйхэн хоосон буцдаг байв.
        const fullName = typeof full_name === 'string' ? full_name.trim() : '';
        if (!fullName) {
            return NextResponse.json(
                { error: 'Бүтэн нэр шаардлагатай (борлуулалтын бүртгэлтэй нэрээр таарна)' },
                { status: 400 },
            );
        }

        // Олон төсөлтэй орчинд shop-ыг ТААХГҮЙ. Өмнө нь shop нэгээс олон байхад
        // урьсан хэрэглэгч ямар ч shop-д холбогдохгүй үлдэж, нэвтэрсэн ч бүх API
        // 401 буцаадаг байв.
        const { data: allShops } = await supabase.from('shops').select('id').limit(2);
        if (!shop_id && (allShops?.length || 0) > 1) {
            return NextResponse.json(
                { error: 'Төсөл (shop) сонгоно уу — олон төсөл байгаа тул автоматаар оноох боломжгүй' },
                { status: 400 },
            );
        }

        // NEXT_PUBLIC_APP_URL тохируулаагүй бол хүсэлт ирсэн жинхэнэ origin-ийг (host:port) ашиглана —
        // ингэснээр dev (localhost:3001) болон production дээр зөв руу чиглүүлнэ.
        const origin = (process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin).replace(/\/$/, '');
        const redirectTo = `${origin}/auth/callback`;

        // Эхлээд урилга (шинэ хэрэглэгч үүсгэнэ). Бүртгэлтэй бол magiclink руу шилжинэ.
        let mode: 'invite' | 'magiclink' = 'invite';
        let linkRes = await supabase.auth.admin.generateLink({
            type: 'invite',
            email,
            options: { redirectTo, data: { full_name: fullName } },
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
                { id: invitedUserId, email, full_name: fullName },
                { onConflict: 'id' }
            );

            if (role) {
                const { error: roleErr } = await supabase
                    .from('user_roles')
                    .upsert({ user_id: invitedUserId, role }, { onConflict: 'user_id' });
                if (roleErr) warnings.push('Дүр оноох алдаа: ' + roleErr.message);
            }

            let targetShopId: string | null = shop_id || null;
            if (!targetShopId && allShops && allShops.length === 1) {
                targetShopId = allShops[0].id;
            }
            if (targetShopId) {
                const { error: memberErr } = await supabase
                    .from('shop_members')
                    .upsert({ shop_id: targetShopId, user_id: invitedUserId, role: 'member' }, { onConflict: 'shop_id,user_id' });
                if (memberErr) warnings.push('Shop холболтын алдаа: ' + memberErr.message);
            }
        }

        // Урилгыг Resend-ээр имэйлээр илгээх (best-effort — амжилтгүй бол action_link fallback).
        let emailed = false;
        if (actionLink) {
            emailed = await sendInviteEmail({ to: email, actionLink, mode, fullName: full_name || undefined });
            if (!emailed) warnings.push('Имэйл илгээгдсэнгүй (RESEND_API_KEY / илгээгчийн домэйн шалгана уу) — холбоосыг гараар илгээнэ үү.');
        }

        await logAdminAudit({ actorId: userId, action: 'user.invite', targetId: invitedUserId, meta: { email, role: role || 'viewer', mode, emailed } });

        return NextResponse.json({
            success: true,
            mode,
            email,
            emailed,
            action_link: actionLink,
            warning: warnings.length ? warnings.join(' / ') : null,
        });
    } catch (error) {
        console.error('POST /api/admin/users/invite error:', error);
        return safeErrorResponse(error, 'Урих холбоос үүсгэх үед алдаа гарлаа');
    }
}
