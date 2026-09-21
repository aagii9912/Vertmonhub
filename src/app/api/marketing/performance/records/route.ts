import { NextRequest, NextResponse } from 'next/server';
import { getUserShop, getUserId } from '@/lib/auth/supabase-auth';
import { requireModule, requireModuleWrite } from '@/lib/auth/require-permission';
import { supabaseAdmin } from '@/lib/supabase';
import { MarketingRecordSchema } from '@/lib/marketing/performance-records';
import { safeErrorResponse } from '@/lib/utils/safe-error';
import { ubDateStr } from '@/lib/utils/date';

export async function GET(request: NextRequest) {
    try {
        const denied = await requireModule('leads');
        if (denied) return denied;
        const marketingDenied = await requireModule('marketing-roi');
        if (marketingDenied) return marketingDenied;
        const shop = await getUserShop();
        if (!shop) return NextResponse.json({ error: 'Нэвтрэх шаардлагатай' }, { status: 401 });
        const search = (request.nextUrl.searchParams.get('q') || '').trim().slice(0, 120).replace(/[%_\\]/g, '');
        let query = supabaseAdmin().from('leads').select('id,customer_name,project_id,marketing_campaign_id,marketing_owner_name,marketing_channel,sales_manager_name,sales_handoff_at')
            .eq('shop_id', shop.id).is('deleted_at', null).order('created_at', { ascending: false }).limit(30);
        if (search) query = query.ilike('customer_name', `%${search}%`);
        const { data, error } = await query;
        if (error) throw error;
        return NextResponse.json({ leads: data }, { headers: { 'Cache-Control': 'private, no-store' } });
    } catch (error) { return safeErrorResponse(error, 'Лидийн жагсаалт татаж чадсангүй'); }
}

export async function POST(request: NextRequest) {
    try {
        const denied = await requireModuleWrite('marketing-roi');
        if (denied) return denied;
        const shop = await getUserShop();
        if (!shop) return NextResponse.json({ error: 'Нэвтрэх шаардлагатай' }, { status: 401 });
        const parsed = MarketingRecordSchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return NextResponse.json({ error: 'Талбаруудаа шалгана уу.', details: parsed.error.flatten() }, { status: 400 });
        const input = parsed.data;
        const db = supabaseAdmin();
        if (input.kind === 'attribution' || input.kind === 'handoff') {
            const leadDenied = await requireModuleWrite('leads');
            if (leadDenied) return leadDenied;
        }
        if ('project_id' in input) {
            const { data, error } = await db.from('projects').select('id').eq('shop_id', shop.id).eq('id', input.project_id).maybeSingle();
            if (error) throw error;
            if (!data) return NextResponse.json({ error: 'Төсөл олдсонгүй' }, { status: 404 });
        }
        let campaign: { project_id: string | null; marketing_owner_name: string | null; channel: string | null } | null = null;
        if ('marketing_campaign_id' in input && input.marketing_campaign_id) {
            const { data, error } = await db.from('marketing_campaigns').select('project_id,marketing_owner_name,channel').eq('id', input.marketing_campaign_id).eq('shop_id', shop.id).maybeSingle();
            if (error) throw error;
            if (!data?.project_id || !data.marketing_owner_name || !data.channel) return NextResponse.json({ error: 'Акцын төсөл, хариуцагч, сувгийг эхлээд бүртгэнэ үү' }, { status: 400 });
            campaign = data;
        }
        let result;
        if (input.kind === 'activity') {
            if (input.completed_on && input.completed_on > ubDateStr()) return NextResponse.json({ error: 'Ирээдүйн ажлыг дууссан гэж бүртгэхгүй' }, { status: 400 });
            const { kind: _kind, ...row } = input;
            const { data: existing, error: existingError } = await db.from('marketing_campaigns').select('id,project_id').eq('id', input.id).eq('shop_id', shop.id).maybeSingle();
            if (existingError) throw existingError;
            if (existing && existing.project_id !== input.project_id) {
                const [{ count: leads, error: leadError }, { count: spend, error: spendError }] = await Promise.all([
                    db.from('leads').select('id', { head: true, count: 'exact' }).eq('shop_id', shop.id).eq('marketing_campaign_id', input.id),
                    db.from('marketing_spend_entries').select('id', { head: true, count: 'exact' }).eq('shop_id', shop.id).eq('marketing_campaign_id', input.id),
                ]);
                if (leadError || spendError) throw leadError || spendError;
                if (leads || spend) return NextResponse.json({ error: 'Лид эсвэл зардал холбогдсон акцын төслийг солих боломжгүй' }, { status: 409 });
            }
            const values = { ...row, completed_on: row.status === 'completed' ? row.completed_on : null };
            // Never upsert by a user-supplied ID: another shop may own that ID.
            result = existing ? await db.from('marketing_campaigns').update(values).eq('shop_id', shop.id).eq('id', row.id).select('id').single()
                : await db.from('marketing_campaigns').insert({ ...values, shop_id: shop.id }).select('id').single();
        } else if (input.kind === 'target') {
            const { kind: _kind, id, ...row } = input;
            result = id ? await db.from('marketing_targets').update(row).eq('id', id).eq('shop_id', shop.id).select('id').single()
                : await db.from('marketing_targets').upsert({ ...row, shop_id: shop.id }, { onConflict: 'shop_id,project_id,marketing_owner_name,month' }).select('id').single();
        } else if (input.kind === 'spend') {
            const { data: existing, error } = await db.from('marketing_spend_entries').select('id').eq('id', input.id).eq('shop_id', shop.id).maybeSingle();
            if (error) throw error;
            const row = { spent_at: input.spent_at, amount: input.amount, note: input.note, marketing_campaign_id: input.marketing_campaign_id,
                project_id: campaign!.project_id, marketing_owner_name: campaign!.marketing_owner_name, channel: campaign!.channel };
            result = existing ? await db.from('marketing_spend_entries').update(row).eq('shop_id', shop.id).eq('id', input.id).is('deleted_at', null).select('id').single()
                : await db.from('marketing_spend_entries').insert({ ...row, id: input.id, shop_id: shop.id, created_by: await getUserId() }).select('id').single();
        } else {
            const { data: lead, error } = await db.from('leads').select('id,sales_manager_name,sales_handoff_at').eq('id', input.lead_id).eq('shop_id', shop.id).is('deleted_at', null).maybeSingle();
            if (error) throw error;
            if (!lead) return NextResponse.json({ error: 'Лид олдсонгүй' }, { status: 404 });
            if (input.kind === 'handoff' && !lead.sales_manager_name?.trim()) return NextResponse.json({ error: 'Эхлээд борлуулалтын менежерт хуваарилна уу' }, { status: 409 });
            if (input.kind === 'handoff' && lead.sales_handoff_at) return NextResponse.json({ success: true });
            const updates = input.kind === 'handoff' ? { sales_handoff_at: new Date().toISOString() } : {
                project_id: campaign?.project_id || input.project_id, marketing_campaign_id: input.marketing_campaign_id,
                marketing_owner_name: campaign?.marketing_owner_name || input.marketing_owner_name,
                marketing_channel: campaign?.channel || input.marketing_channel,
            };
            result = await db.from('leads').update(updates).eq('id', input.lead_id).eq('shop_id', shop.id).is('deleted_at', null).select('id').single();
        }
        if (result.error) throw result.error;
        return NextResponse.json({ success: true, id: result.data.id });
    } catch (error) { return safeErrorResponse(error, 'Хадгалж чадсангүй. Мэдээллээ шалгаад дахин оролдоно уу.'); }
}
