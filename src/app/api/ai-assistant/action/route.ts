import { NextResponse } from 'next/server';
import { executeDataTool } from '@/lib/ai/data-assistant';
import { resolveSalesManagerName } from '@/lib/ai/data-assistant/functions';
import { MUTATING_TOOL_NAMES } from '@/lib/ai/data-assistant/tools';
import { supabaseAdmin } from '@/lib/supabase';
import { safeErrorResponse } from '@/lib/utils/safe-error';
import { resolveApiUser } from '@/lib/auth/resolve-user';
import { fetchRolePermissions } from '@/lib/rbac';

export const maxDuration = 30;

/**
 * AI Orchestrator — баталгаажуулсан үйлдлийг ГҮЙЦЭТГЭХ endpoint.
 *
 * Orchestrator mutating tool-уудыг шууд гүйцэтгэхгүй, preview буцаадаг. Хэрэглэгч
 * UI дээр "Зөвшөөрөх" дарахад энэ endpoint руу tool+args ирж, server дээр RBAC-г
 * ДАХИН шалгаад (canWrite/canDelete/super_admin), confirm=true-ээр бодит үйлдлийг хийнэ.
 */
export async function POST(req: Request) {
    try {
        const resolvedUser = await resolveApiUser();
        if (!resolvedUser) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const adminDb = supabaseAdmin();

        // Дүр тодорхойлох (user_roles → admins fallback)
        let roleName = 'viewer';
        const { data: roleRow } = await adminDb
            .from('user_roles').select('role').eq('user_id', resolvedUser.id).single();
        if (roleRow?.role) {
            roleName = roleRow.role;
        } else {
            const { data: adminData } = await adminDb
                .from('admins').select('role').eq('user_id', resolvedUser.id).eq('is_active', true).single();
            if (adminData?.role) roleName = adminData.role;
        }
        const permissions = await fetchRolePermissions(roleName);

        if (!permissions.modules.includes('ai-assistant')) {
            return NextResponse.json({ error: 'AI Orchestrator ашиглах эрх танд алга' }, { status: 403 });
        }

        const { shopId, tool, args, conversationId } = await req.json();
        if (!tool || !MUTATING_TOOL_NAMES.includes(tool)) {
            return NextResponse.json({ error: 'Буруу эсвэл зөвшөөрөгдөөгүй үйлдэл' }, { status: 400 });
        }
        if (!process.env.GEMINI_API_KEY) {
            // Tool гүйцэтгэлд Gemini шаардлагагүй ч орчны бүрэн бус байдлыг анхааруулна.
        }

        // Shop scoping
        const [{ data: ownedRows }, { data: memberRows }] = await Promise.all([
            adminDb.from('shops').select('id').eq('user_id', resolvedUser.id),
            adminDb.from('shop_members').select('shop_id').eq('user_id', resolvedUser.id),
        ]);
        const accessibleShopIds = new Set<string>([
            ...(ownedRows || []).map(r => r.id),
            ...(memberRows || []).map(r => r.shop_id),
        ]);
        if (shopId && !accessibleShopIds.has(shopId)) {
            return NextResponse.json({ error: 'Энэ shop-ийн мэдээлэлд хандах эрхгүй' }, { status: 403 });
        }
        const effectiveShopId = shopId || [...accessibleShopIds][0];
        if (!effectiveShopId) {
            return NextResponse.json({ error: 'Холбогдсон shop олдсонгүй' }, { status: 403 });
        }

        const perms = {
            canWrite: permissions.canWrite,
            canDelete: permissions.canDelete,
            role: roleName,
        };

        // RBAC-г executeDataTool дотор дахин шалгана. confirm=true → бодит үйлдэл.
        const userName = await resolveSalesManagerName(effectiveShopId, resolvedUser.id);
        const result = await executeDataTool(tool, args || {}, effectiveShopId, perms, resolvedUser.id, true, userName);

        const ok = !(result && result.error);
        const message = ok
            ? (result.message || 'Үйлдэл амжилттай гүйцэтгэгдлээ.')
            : (result.error || 'Үйлдэл амжилтгүй боллоо.');

        // Гүйцэтгэлийн үр дүнг харилцан ярианд тэмдэглэнэ (best-effort).
        if (conversationId) {
            try {
                await adminDb.from('ai_messages').insert({
                    conversation_id: conversationId,
                    role: 'assistant',
                    content: ok ? `✅ ${message}` : `⚠️ ${message}`,
                });
                await adminDb.from('ai_conversations')
                    .update({ updated_at: new Date().toISOString() })
                    .eq('id', conversationId);
            } catch (e) {
                console.warn('Action message persist failed:', e);
            }
        }

        return NextResponse.json({ success: ok, message, result });
    } catch (error) {
        return safeErrorResponse(error, 'Үйлдэл гүйцэтгэхэд алдаа гарлаа');
    }
}
