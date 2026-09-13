import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireModuleWrite } from '@/lib/auth/require-permission';
import { getUserShop, getUserId } from '@/lib/auth/supabase-auth';
import { supabaseAdmin } from '@/lib/supabase';
import { resolveManagerIdentity } from '@/lib/sales/manager-identity';
import { ACTIVE_STATUSES } from '@/lib/leads/labels';
import { logLeadActivity } from '@/lib/leads/activities';
import { safeErrorResponse } from '@/lib/utils/safe-error';

const ClaimSchema = z.object({ next_followup_at: z.string().datetime({ offset: true }) });

/** Хариуцагчгүй лидийг өөртөө авах + эхний холбоог нэг UPDATE-аар товлох. */
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
        const { data, error } = await db.from('leads').update({
            sales_manager_name: identity.managerName,
            next_followup_at: input.data.next_followup_at,
            updated_at: new Date().toISOString(),
        }).eq('id', id).eq('shop_id', shop.id).is('deleted_at', null)
            .in('status', ACTIVE_STATUSES).or('sales_manager_name.is.null,sales_manager_name.eq.""')
            .select('id').maybeSingle();
        if (error) return NextResponse.json({ error: 'Лид хариуцаж авахад алдаа гарлаа' }, { status: 500 });
        if (!data) return NextResponse.json({ error: 'Лидийг өөр хүн авсан, хаасан эсвэл олдсонгүй. Жагсаалтаа шинэчилнэ үү.' }, { status: 409 });
        const activity = await logLeadActivity(db, {
            shopId: shop.id, leadId: id, type: 'manager', createdBy: uid,
            createdByName: identity.managerName, content: `${identity.managerName} лидийг хариуцаж авч, холбогдох цагаа товлов`,
            meta: { action: 'claim', to: identity.managerName, next_followup_at: input.data.next_followup_at },
        });
        return NextResponse.json({ success: true, ...(!activity ? { warning: 'Хариуцагч ба цаг хадгалагдсан. Харин үйл ажиллагааны түүхийг хадгалж чадсангүй.' } : {}) });
    } catch (error) { return safeErrorResponse(error, 'Лид хариуцаж авахад алдаа гарлаа'); }
}
