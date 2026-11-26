import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireModuleWrite } from '@/lib/auth/require-permission';
import { getUserShop, getUserId } from '@/lib/auth/supabase-auth';
import { supabaseAdmin } from '@/lib/supabase';
import { resolveManagerIdentity } from '@/lib/sales/manager-identity';
import { claimUnassignedLead } from '@/lib/leads/claim';
import { safeErrorResponse } from '@/lib/utils/safe-error';
import { ProjectScopeError, resolveSalesProjectScope } from '@/lib/sales/project-scope';

const ClaimSchema = z.object({ next_followup_at: z.string().datetime({ offset: true }) });

/**
 * Хариуцагчгүй лидийг өөртөө авах + эхний холбоог нэг UPDATE-аар товлох. Лидийг автоматаар
 * хуваарилахгүй тул (эзэмшигч 2026-10-15) менежер өөрийн бүртгэлтэй төслийн лидийг энд хариуцаж авна.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const denied = await requireModuleWrite('leads');
        if (denied) return denied;
        const [shop, uid, { id }] = await Promise.all([getUserShop(), getUserId(), params]);
        if (!shop || !uid) return NextResponse.json({ error: 'Нэвтрэх шаардлагатай' }, { status: 401 });
        if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: 'Буруу лид' }, { status: 400 });
        const input = ClaimSchema.safeParse(await request.json().catch(() => null));
        if (!input.success || Date.parse(input.data.next_followup_at) <= Date.now()) {
            return NextResponse.json({ error: 'Холбогдох цагаа одоогоос хойш товлоно уу' }, { status: 400 });
        }
        const db = supabaseAdmin();
        const identity = await resolveManagerIdentity(db, shop.id, uid);
        if (!identity.isManager || !identity.managerName) {
            return NextResponse.json({ error: 'Лид хариуцаж авахын тулд идэвхтэй борлуулалтын менежерийн бүртгэлтэй байна' }, { status: 403 });
        }
        const scope = await resolveSalesProjectScope(db, shop.id);
        const result = await claimUnassignedLead(db, {
            shopId: shop.id, leadId: id, userId: uid, managerName: identity.managerName, scope,
            nextFollowupAt: input.data.next_followup_at,
            activity: {
                content: `${identity.managerName} лидийг хариуцаж авч, холбогдох цагаа товлов`,
                meta: { next_followup_at: input.data.next_followup_at },
            },
        });
        if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
        return NextResponse.json({ success: true, ...(!result.activityLogged ? { warning: 'Хариуцагч ба цаг хадгалагдсан. Харин үйл ажиллагааны түүхийг хадгалж чадсангүй.' } : {}) });
    } catch (error) {
        if (error instanceof ProjectScopeError) return NextResponse.json({ error: error.message }, { status: error.status });
        return safeErrorResponse(error, 'Лид хариуцаж авахад алдаа гарлаа');
    }
}
