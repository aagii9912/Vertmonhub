/**
 * Хариуцагчгүй идэвхтэй лидийг шинэ лидтэй ижил дүрмээр (`lib/sales/auto-assign.ts`) хуваарилна:
 * төсөлд бүртгэлтэй, идэвхтэй, дансандаа холбогдсон менежер; олон бол идэвхтэй лид нь цөөнд.
 *
 *   SHOP_ID=<uuid> npx tsx scripts/assign-unassigned-leads.ts            # урьдчилсан шалгалт (бичихгүй)
 *   SHOP_ID=<uuid> npx tsx scripts/assign-unassigned-leads.ts --apply    # бичнэ
 *
 * Зөвхөн хариуцагчгүй хэвээр байгаа лидийг шинэчилнэ (хооронд нь хүн оноосныг дарахгүй); лид бүрт
 * timeline-д «автоматаар хуваарилагдав», `admin_audit_log`-д `leads.auto_assign_backfill`.
 */

import * as path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { ACTIVE_STATUSES } from '../src/lib/leads/labels';
import { activeLeadLoad, autoAssignCandidates, leastLoaded } from '../src/lib/sales/auto-assign';
import { fetchAllRows } from '../src/lib/utils/pagination';

const usage = 'SHOP_ID=<uuid> npx tsx scripts/assign-unassigned-leads.ts [--apply]';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BATCH = 200;

async function main() {
    const args = process.argv.slice(2);
    if (args.some(arg => arg !== '--apply') || args.length > 1) throw new Error(`Ашиглах команд: ${usage}`);
    const apply = args.includes('--apply');

    dotenv.config({ path: path.resolve(__dirname, '../.env.local'), quiet: true });
    const shopId = process.env.SHOP_ID;
    if (!shopId || !uuid.test(shopId)) throw new Error('SHOP_ID UUID утгыг ил тод тохируулна уу');
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceKey) throw new Error('Supabase URL болон service-role тохиргоо шаардлагатай');
    const db = createClient(supabaseUrl, serviceKey, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });

    const leads = await fetchAllRows<{ id: string; project_id: string | null; sales_manager_name: string | null }>((from, to) => db.from('leads')
        .select('id, project_id, sales_manager_name').eq('shop_id', shopId).is('deleted_at', null).in('status', ACTIVE_STATUSES)
        .order('created_at').order('id').range(from, to));
    const unassigned = leads.filter(lead => !lead.sales_manager_name?.trim());
    const plan = new Map<string, string[]>();
    let skipped = 0;
    for (const projectId of [...new Set(unassigned.map(lead => lead.project_id))]) {
        const projectLeads = unassigned.filter(lead => lead.project_id === projectId);
        const candidates = projectId ? await autoAssignCandidates(db, shopId, projectId) : [];
        if (!projectId || !candidates.length) { skipped += projectLeads.length; continue; }
        const load = await activeLeadLoad(db, shopId, projectId, candidates);
        for (const lead of projectLeads) {
            const manager = leastLoaded(candidates, load)!;
            load.set(manager, (load.get(manager) ?? 0) + 1);
            plan.set(manager, [...plan.get(manager) ?? [], lead.id]);
        }
    }
    const summary = {
        mode: apply ? 'apply' : 'dry-run', unassigned: unassigned.length, skipped_without_manager: skipped,
        plan: Object.fromEntries([...plan].map(([manager, ids]) => [manager, ids.length])),
    };
    if (!apply) { console.log(JSON.stringify(summary, null, 2)); return; }

    const assigned: Record<string, number> = {};
    for (const [manager, ids] of plan) {
        for (let offset = 0; offset < ids.length; offset += BATCH) {
            const batch = ids.slice(offset, offset + BATCH);
            const { data, error } = await db.from('leads').update({ sales_manager_name: manager, updated_at: new Date().toISOString() })
                .eq('shop_id', shopId).in('id', batch).is('deleted_at', null).or('sales_manager_name.is.null,sales_manager_name.eq.""')
                .select('id');
            if (error) throw new Error(`Лид хуваарилж чадсангүй (${manager}): ${error.message}`);
            const updated = (data ?? []).map(row => row.id as string);
            assigned[manager] = (assigned[manager] ?? 0) + updated.length;
            if (!updated.length) continue;
            const { error: activityError } = await db.from('lead_activities').insert(updated.map(leadId => ({
                shop_id: shopId, lead_id: leadId, type: 'manager', content: `${manager} автоматаар хуваарилагдав`,
                meta: { action: 'auto_assign', to: manager, backfill: true },
            })));
            if (activityError) console.error(`Timeline бичигдсэнгүй (${manager}): ${activityError.message}`);
        }
    }
    const { error: auditError } = await db.from('admin_audit_log').insert({
        actor_id: null, action: 'leads.auto_assign_backfill', target_id: shopId, meta: { assigned, skipped_without_manager: skipped },
    });
    console.log(JSON.stringify({ ...summary, assigned, ...(auditError ? { warning: `Audit бичигдсэнгүй: ${auditError.message}` } : {}) }, null, 2));
}

main().catch(error => {
    console.error(error instanceof Error ? error.message : 'Хуваарилалтын тодорхойгүй алдаа');
    process.exitCode = 1;
});
