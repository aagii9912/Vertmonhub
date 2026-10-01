import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, getUserId } from '@/lib/auth/supabase-auth';
import { safeErrorResponse } from '@/lib/utils/safe-error';
import { logAdminAudit } from '@/lib/admin/audit';
import { sendInviteEmail } from '@/lib/email/email';
import { getAdminUser } from '@/lib/admin/auth';
import { adminUserInput, isAssignableRole, provisionUserAccess, resolveTargetShop } from '@/lib/admin/user-provisioning';

/**
 * POST /api/admin/users/invite — урих / нэвтрэх холбоос үүсгэж имэйлээр илгээх (super_admin).
 *
 * Холбоосыг Resend-ээр имэйлээр АВТОМАТААР илгээнэ (best-effort). Илгээж чадаагүй бол
 * `action_link`-ийг буцаах тул админ гараар хуулж илгээж болно. Шинэ имэйл бол урилга
 * (хэрэглэгч үүснэ), баталгаажуулсан бүртгэлтэй бол нэвтрэх (magiclink) холбоос үүснэ.
 */
export async function POST(request: NextRequest) {
    // createUser-ийн амжилттай хариу л шинээр үүсгэсэн бүртгэлийг батална.
    // generateLink(invite) нь хуучин баталгаажаагүй хэрэглэгч дээр мөн амжилттай.
    let createdUserId: string | undefined;
    try {
        const userId = await getUserId();
        if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const supabase = supabaseAdmin();
        const admin = await getAdminUser();
        if (!admin || admin.role !== 'super_admin') {
            return NextResponse.json({ error: 'Super admin эрх шаардлагатай' }, { status: 403 });
        }

        const parsed = adminUserInput.safeParse(await request.json());
        if (!parsed.success) return NextResponse.json({ error: 'Имэйл, дүр эсвэл байгууллагын мэдээлэл буруу байна' }, { status: 400 });
        const { email, role, full_name } = parsed.data;
        if (email === admin.email.trim().toLowerCase())
            return NextResponse.json({ error: 'Өөрийн дүрийг өөрчлөх боломжгүй' }, { status: 409 });
        if (!await isAssignableRole(supabase, role))
            return NextResponse.json({ error: 'Сонгосон дүр олдсонгүй' }, { status: 400 });
        const shop = await resolveTargetShop(supabase, parsed.data.shop_id);
        if (!shop.id) return NextResponse.json({ error: shop.error }, { status: 400 });

        // Production урилга зөвхөн тохируулсан үндсэн URL руу, local dev нь хүсэлтийн origin руу чиглэнэ.
        const configuredOrigin = process.env.NEXT_PUBLIC_APP_URL;
        if (process.env.NODE_ENV === 'production' && !configuredOrigin)
            return NextResponse.json({ error: 'Урилгын үндсэн URL тохируулагдаагүй байна' }, { status: 503 });
        const origin = (configuredOrigin || request.nextUrl.origin).replace(/\/$/, '');
        const originUrl = new URL(origin);
        if (originUrl.protocol !== 'https:' && !(originUrl.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(originUrl.hostname)))
            return NextResponse.json({ error: 'Урилгын URL аюулгүй биш байна' }, { status: 503 });
        const redirectTo = `${originUrl.origin}/auth/callback`;

        const created = await supabase.auth.admin.createUser({
            email, email_confirm: false, user_metadata: { full_name: full_name || email },
        });
        if (created.error) {
            if (!['email_exists', 'user_already_exists'].includes(created.error.code || '') &&
                !/already|registered|exists/i.test(created.error.message)) throw created.error;
        } else {
            if (!created.data?.user?.id) throw new Error('Шинэ хэрэглэгчийн ID ирсэнгүй');
            if (created.data.user.id === userId)
                return NextResponse.json({ error: 'Өөрийн дүрийг өөрчлөх боломжгүй' }, { status: 409 });
            createdUserId = created.data.user.id;
        }

        // Баталгаажаагүй бүртгэлд invite, баталгаажуулсан бүртгэлд magiclink үүсгэнэ.
        let mode: 'invite' | 'magiclink' = 'invite';
        let linkRes = await supabase.auth.admin.generateLink({
            type: 'invite',
            email,
            options: { redirectTo, ...(createdUserId ? { data: { full_name: full_name || email } } : {}) },
        });

        if (linkRes.error && /already|registered|exists/i.test(linkRes.error.message)) {
            mode = 'magiclink';
            linkRes = await supabase.auth.admin.generateLink({ type: 'magiclink', email, options: { redirectTo } });
        }

        if (linkRes.error || !linkRes.data) throw linkRes.error || new Error('Холбоос үүссэнгүй');

        const actionLink = linkRes.data.properties?.action_link;
        const invitedUserId = linkRes.data.user?.id;
        if (!invitedUserId || !actionLink) throw new Error('Урих холбоос бүрэн үүссэнгүй');
        if (createdUserId && invitedUserId !== createdUserId) throw new Error('Урих холбоосын хэрэглэгч шинэ бүртгэлтэй таарахгүй байна');
        const provisioningError = await provisionUserAccess(supabase, {
            actorId: userId, userId: invitedUserId, email, fullName: full_name, role, shopId: shop.id, isNew: createdUserId === invitedUserId,
        });
        // Холболтын алдааг helper буцаана. Дараах имэйл/audit алдаа олгосон эрхийг устгахгүй.
        createdUserId = undefined;
        if (provisioningError) return NextResponse.json(provisioningError, { status: provisioningError.status });

        const warnings: string[] = [];

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
        if (createdUserId) {
            try {
                const { error: rollbackError } = await supabaseAdmin().auth.admin.deleteUser(createdUserId);
                if (rollbackError) throw rollbackError;
            } catch (rollbackError) {
                console.error('Invite account rollback failed:', rollbackError);
                return NextResponse.json({ error: 'Урилга үүссэнгүй, шинэ бүртгэлийг буцааж устгаж чадсангүй. Админ бүртгэлийг шалгана уу.', partial_failure: true }, { status: 500 });
            }
        }
        return safeErrorResponse(error, 'Урих холбоос үүсгэх үед алдаа гарлаа');
    }
}
