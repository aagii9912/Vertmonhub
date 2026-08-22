/**
 * Менежерийн ӨДРИЙН АЖЛЫН функцууд (AI tool-ын хэрэгжүүлэлт).
 *
 * ЯАГААД ТУСДАА ФАЙЛ ВЭ:
 * Одоо байгаа data-assistant/functions.ts нь ДЭЛГҮҮР ДАЯАРХ аналитикт
 * зориулагдсан (нийт борлуулалт, бүх лид, прогноз). Гэтэл борлуулалтын
 * менежерийн жинхэнэ өдрийн ажил — «миний өнөөдрийн уулзалт», «хэнд эргэж
 * залгах вэ», «дуудлага тэмдэглэх», «уулзалт хойшлуулах», «сануулга тавих» —
 * ямар ч tool-оор хийгддэггүй байв. Энэ файл яг тэр цоорхойг нөхнө.
 *
 * ЗАРЧИМ: бүх функц КАНОНИК менежерийн нэр (`managerName`) дээр тулгуурлана.
 * Нэр тодорхойгүй (профайлд нэр алга) бол «эзэнгүй бичилт» үүсгэхийн оронд
 * ойлгомжтой алдаа буцаана — өмнө нь имэйлээр тамгалж, дашбоардаас алга
 * болдог байсан алдааг давтахгүй.
 */

import { supabaseAdmin } from '@/lib/supabase';
import { logger } from '@/lib/utils/logger';
import { recordActivity, type ActivityKind, type ActivityOutcome } from '@/lib/services/ActivityService';

const db = () => supabaseAdmin();

/** Тодорхойгүй нэртэй үед нэгдсэн алдаа. */
const NO_NAME_ERROR = {
    error:
        'Таны нэр системд тодорхойлогдоогүй байна. Профайлд бүтэн нэр тохируулаагүй тул ' +
        'үйлдлийг тань дээр бүртгэх боломжгүй. Админаас профайлын нэрээ (борлуулалтын ' +
        'бүртгэлтэй ижил бичлэгээр) тохируулж өгөхийг хүснэ үү.',
};

/** confirm=false үед мутацийг гүйцэтгэхгүй, урьдчилан харах хариу буцаана. */
function confirmNeeded(tool: string, args: unknown, label: string, preview: Record<string, unknown>) {
    return { requiresConfirmation: true, action: { tool, args }, label, preview };
}

/** `deleted_at` багана байхгүй (миграци ороогүй) орчинд ч ажиллана. */
async function runExcludingDeleted<T>(build: (excludeDeleted: boolean) => T): Promise<any> {
    const res: any = await build(true);
    if (res?.error && /deleted_at/i.test(res.error.message || '')) {
        return await build(false);
    }
    return res;
}

function startOfToday(): Date {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
}

function fmtDateTime(iso: string | null | undefined): string {
    if (!iso) return '';
    const d = new Date(iso);
    return `${d.toLocaleDateString('mn-MN')} ${d.toLocaleTimeString('mn-MN', { hour: '2-digit', minute: '2-digit' })}`;
}

// ============================================================
// УНШИХ — «миний» хамрах хүрээтэй
// ============================================================

/**
 * «Өнөөдөр юу хийх вэ?» — менежерийн өдрийн ажлын нэгдсэн зураг.
 * Уулзалт + хугацаа хэтэрсэн/өнөөдрийн дагалт + дуусах ажил.
 */
export async function getMyDay(shopId: string, managerName: string, userId: string) {
    if (!managerName) return NO_NAME_ERROR;

    const dayStart = startOfToday();
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);
    const nowIso = new Date().toISOString();

    const [viewingsRes, followupsRes, tasksRes, freshLeadsRes] = await Promise.all([
        runExcludingDeleted((excl) => {
            let q = db()
                .from('property_viewings')
                .select('id, scheduled_at, status, agent_notes, properties(name), leads(customer_name, customer_phone)')
                .eq('shop_id', shopId)
                .eq('sales_manager_name', managerName)
                .gte('scheduled_at', dayStart.toISOString())
                .lt('scheduled_at', dayEnd.toISOString())
                .order('scheduled_at', { ascending: true });
            if (excl) q = q.is('deleted_at', null);
            return q;
        }),
        runExcludingDeleted((excl) => {
            let q = db()
                .from('leads')
                .select('id, customer_name, customer_phone, status, next_followup_at')
                .eq('shop_id', shopId)
                .eq('sales_manager_name', managerName)
                .not('next_followup_at', 'is', null)
                .lte('next_followup_at', dayEnd.toISOString())
                .order('next_followup_at', { ascending: true })
                .limit(50);
            if (excl) q = q.is('deleted_at', null);
            return q;
        }),
        runExcludingDeleted((excl) => {
            let q = db()
                .from('user_tasks')
                .select('id, title, due_at, priority')
                .eq('shop_id', shopId)
                .eq('status', 'pending')
                .or(`assignee_id.eq.${userId},user_id.eq.${userId}`)
                .order('due_at', { ascending: true, nullsFirst: false })
                .limit(50);
            if (excl) q = q.is('deleted_at', null);
            return q;
        }),
        runExcludingDeleted((excl) => {
            let q = db()
                .from('leads')
                .select('id, customer_name, customer_phone, created_at')
                .eq('shop_id', shopId)
                .eq('sales_manager_name', managerName)
                .eq('status', 'new')
                .order('created_at', { ascending: true })
                .limit(20);
            if (excl) q = q.is('deleted_at', null);
            return q;
        }),
    ]);

    const viewings = (viewingsRes?.data || []) as any[];
    const followups = (followupsRes?.data || []) as any[];
    const tasks = (tasksRes?.data || []) as any[];
    const freshLeads = (freshLeadsRes?.data || []) as any[];

    const overdueFollowups = followups.filter((l) => l.next_followup_at && l.next_followup_at < nowIso);

    return {
        manager: managerName,
        date: dayStart.toLocaleDateString('mn-MN'),
        summary: {
            viewingsToday: viewings.length,
            followupsDue: followups.length,
            followupsOverdue: overdueFollowups.length,
            pendingTasks: tasks.length,
            untouchedNewLeads: freshLeads.length,
        },
        viewings: viewings.map((v) => ({
            id: v.id,
            at: fmtDateTime(v.scheduled_at),
            status: v.status,
            property: v.properties?.name || '—',
            customer: v.leads?.customer_name || '—',
            phone: v.leads?.customer_phone || '',
            notes: v.agent_notes || '',
        })),
        followups: followups.map((l) => ({
            leadId: l.id,
            customer: l.customer_name,
            phone: l.customer_phone,
            status: l.status,
            due: fmtDateTime(l.next_followup_at),
            overdue: !!(l.next_followup_at && l.next_followup_at < nowIso),
        })),
        tasks: tasks.map((t) => ({
            id: t.id,
            title: t.title,
            due: t.due_at ? fmtDateTime(t.due_at) : null,
            priority: t.priority || 'normal',
        })),
        untouchedNewLeads: freshLeads.map((l) => ({
            leadId: l.id,
            customer: l.customer_name,
            phone: l.customer_phone,
            since: fmtDateTime(l.created_at),
        })),
    };
}

/**
 * «Миний лийдүүд» — `list_leads` нь дэлгүүр даяарх лид буцаадаг тул менежер
 * өөрийнхөө ажлыг чатаар харах боломжгүй байсныг нөхнө.
 * `stale_days` өгвөл «N хоног хөндөөгүй» лидүүдийг шүүнэ.
 */
export async function listMyLeads(shopId: string, managerName: string, args: any) {
    if (!managerName) return NO_NAME_ERROR;

    const limit = Math.min(Math.max(Number(args?.limit) || 20, 1), 100);

    const res = await runExcludingDeleted((excl) => {
        let q = db()
            .from('leads')
            .select('id, customer_name, customer_phone, status, source, budget_max, next_followup_at, updated_at, created_at')
            .eq('shop_id', shopId)
            .eq('sales_manager_name', managerName)
            .order('updated_at', { ascending: false })
            .limit(limit);
        if (args?.status) q = q.eq('status', args.status);
        if (args?.source) q = q.eq('source', args.source);
        if (args?.stale_days) {
            const cutoff = new Date();
            cutoff.setDate(cutoff.getDate() - Number(args.stale_days));
            q = q.lt('updated_at', cutoff.toISOString());
        }
        if (excl) q = q.is('deleted_at', null);
        return q;
    });

    if (res?.error) return { error: `Лийд уншихад алдаа: ${res.error.message}` };

    const rows = (res?.data || []) as any[];
    return {
        manager: managerName,
        count: rows.length,
        leads: rows.map((l) => ({
            id: l.id,
            customer: l.customer_name,
            phone: l.customer_phone,
            status: l.status,
            source: l.source,
            budget: l.budget_max,
            nextFollowup: l.next_followup_at ? fmtDateTime(l.next_followup_at) : null,
            lastTouched: fmtDateTime(l.updated_at || l.created_at),
        })),
    };
}

/**
 * Уулзалтын жагсаалт. Өмнө нь уулзалт УНШДАГ tool огт байгаагүй тул
 * «маргааш хэдэн уулзалттай вэ?» гэсэн хамгийн энгийн асуултад ч хариулж
 * чаддаггүй байв.
 */
export async function listViewings(shopId: string, managerName: string, args: any) {
    const from = args?.from ? new Date(args.from) : startOfToday();
    const days = Math.min(Math.max(Number(args?.days) || 7, 1), 90);
    const to = new Date(from);
    to.setDate(to.getDate() + days);

    if (Number.isNaN(from.getTime())) return { error: 'Эхлэх огноо буруу байна (YYYY-MM-DD).' };

    // mine !== false → анхдагчаар зөвхөн ӨӨРИЙН уулзалт
    const onlyMine = args?.mine !== false;
    if (onlyMine && !managerName) return NO_NAME_ERROR;

    const res = await runExcludingDeleted((excl) => {
        let q = db()
            .from('property_viewings')
            .select('id, scheduled_at, status, agent_notes, interest_level, sales_manager_name, properties(name), leads(customer_name, customer_phone)')
            .eq('shop_id', shopId)
            .gte('scheduled_at', from.toISOString())
            .lt('scheduled_at', to.toISOString())
            .order('scheduled_at', { ascending: true })
            .limit(100);
        if (onlyMine) q = q.eq('sales_manager_name', managerName);
        if (args?.status) q = q.eq('status', args.status);
        if (excl) q = q.is('deleted_at', null);
        return q;
    });

    if (res?.error) return { error: `Уулзалт уншихад алдаа: ${res.error.message}` };

    const rows = (res?.data || []) as any[];
    return {
        range: `${from.toLocaleDateString('mn-MN')} — ${to.toLocaleDateString('mn-MN')}`,
        scope: onlyMine ? managerName : 'бүх менежер',
        count: rows.length,
        viewings: rows.map((v) => ({
            id: v.id,
            at: fmtDateTime(v.scheduled_at),
            status: v.status,
            manager: v.sales_manager_name || '—',
            property: v.properties?.name || '—',
            customer: v.leads?.customer_name || '—',
            phone: v.leads?.customer_phone || '',
            interestLevel: v.interest_level ?? null,
            notes: v.agent_notes || '',
        })),
    };
}

// ============================================================
// БИЧИХ — confirm-gated
// ============================================================

/** Уулзалтын цаг/тэмдэглэлийг өөрчлөх (хойшлуулах). */
export async function updateViewing(shopId: string, args: any, confirm = false, managerName = '') {
    if (!args?.viewing_id) return { error: 'viewing_id шаардлагатай.' };

    const res = await db()
        .from('property_viewings')
        .select('id, scheduled_at, status, sales_manager_name, leads(customer_name)')
        .eq('id', args.viewing_id)
        .eq('shop_id', shopId)
        .maybeSingle();

    const viewing: any = res.data;
    if (!viewing) return { error: 'Уулзалт олдсонгүй.' };

    const updates: Record<string, unknown> = {};
    if (args.scheduled_at) {
        const when = new Date(args.scheduled_at);
        if (Number.isNaN(when.getTime())) return { error: 'Шинэ цаг буруу форматтай байна.' };
        updates.scheduled_at = when.toISOString();
    }
    if (typeof args.notes === 'string') updates.agent_notes = args.notes;
    if (args.status && ['scheduled', 'completed', 'cancelled', 'no_show'].includes(args.status)) {
        updates.status = args.status;
    }
    if (Object.keys(updates).length === 0) {
        return { error: 'Өөрчлөх зүйл заагаагүй байна (scheduled_at, notes, status).' };
    }

    const label = `Уулзалт шинэчлэх${updates.scheduled_at ? ` → ${fmtDateTime(updates.scheduled_at as string)}` : ''}`;
    if (!confirm) {
        return confirmNeeded('update_viewing', args, label, {
            Харилцагч: viewing.leads?.customer_name || '—',
            'Одоогийн цаг': fmtDateTime(viewing.scheduled_at),
            'Шинэ цаг': updates.scheduled_at ? fmtDateTime(updates.scheduled_at as string) : '(өөрчлөхгүй)',
            Төлөв: (updates.status as string) || viewing.status,
        });
    }

    const { error } = await db().from('property_viewings').update(updates).eq('id', args.viewing_id);
    if (error) return { error: `Шинэчлэхэд алдаа: ${error.message}` };

    await recordActivity({
        shopId,
        actorName: managerName || viewing.sales_manager_name,
        entityType: 'viewing',
        entityId: args.viewing_id,
        kind: 'update',
        source: 'ai',
        body: label,
        payload: updates,
    });

    return { success: true, message: `${label} — амжилттай.` };
}

/**
 * Уулзалтыг дүгнэж хаах: ирсэн эсэх + сонирхлын түвшин + тэмдэглэл.
 * Схемд шаардлагатай багана бүгд аль хэдийн байсан (status, completed_at,
 * customer_feedback, agent_notes, interest_level) — дутуу байсан зүйл нь
 * зөвхөн эдгээрийг бөглөх ЗАМ байв.
 */
export async function completeViewing(shopId: string, args: any, confirm = false, managerName = '') {
    if (!args?.viewing_id) return { error: 'viewing_id шаардлагатай.' };

    const outcome = String(args.outcome || 'attended');
    const validOutcomes = ['attended', 'no_show', 'cancelled'];
    if (!validOutcomes.includes(outcome)) {
        return { error: `outcome нь ${validOutcomes.join(' / ')} байх ёстой.` };
    }

    const res = await db()
        .from('property_viewings')
        .select('id, scheduled_at, status, sales_manager_name, leads(customer_name)')
        .eq('id', args.viewing_id)
        .eq('shop_id', shopId)
        .maybeSingle();

    const viewing: any = res.data;
    if (!viewing) return { error: 'Уулзалт олдсонгүй.' };

    const statusMap: Record<string, string> = {
        attended: 'completed',
        no_show: 'no_show',
        cancelled: 'cancelled',
    };
    const interest = args.interest_level != null ? Number(args.interest_level) : null;
    if (interest != null && (Number.isNaN(interest) || interest < 1 || interest > 5)) {
        return { error: 'interest_level нь 1-5 хооронд байна.' };
    }

    const label = `Уулзалт дүгнэх: ${outcome}`;
    if (!confirm) {
        return confirmNeeded('complete_viewing', args, label, {
            Харилцагч: viewing.leads?.customer_name || '—',
            Цаг: fmtDateTime(viewing.scheduled_at),
            'Үр дүн': outcome,
            'Сонирхол (1-5)': interest ?? '—',
            Тэмдэглэл: args.notes || '—',
        });
    }

    const updates: Record<string, unknown> = {
        status: statusMap[outcome],
        completed_at: new Date().toISOString(),
    };
    if (typeof args.notes === 'string') updates.customer_feedback = args.notes;
    if (interest != null) updates.interest_level = interest;

    const { error } = await db().from('property_viewings').update(updates).eq('id', args.viewing_id);
    if (error) return { error: `Дүгнэхэд алдаа: ${error.message}` };

    await recordActivity({
        shopId,
        actorName: managerName || viewing.sales_manager_name,
        entityType: 'viewing',
        entityId: args.viewing_id,
        kind: 'viewing',
        outcome: outcome === 'attended' ? 'connected' : 'n/a',
        source: 'ai',
        body: args.notes || label,
        payload: { outcome, interest_level: interest },
    });

    return { success: true, message: `${label} — амжилттай бүртгэгдлээ.` };
}

/**
 * Дуудлага / уулзалт / тэмдэглэлийг бүртгэх — өдрийн ажлын гол гогцоо.
 * Өмнө нь зөвхөн `add_lead_note` (чөлөөт текст) байсан тул «хэдэн дуудлага
 * хийсэн», «хэн холбогдоогүй» гэдэг хэмжигддэггүй байв.
 */
export async function logActivity(
    shopId: string,
    args: any,
    confirm = false,
    userId = '',
    managerName = '',
) {
    if (!managerName) return NO_NAME_ERROR;

    const kind = String(args?.kind || 'call') as ActivityKind;
    const validKinds: ActivityKind[] = ['call', 'sms', 'messenger', 'meeting', 'note'];
    if (!validKinds.includes(kind)) {
        return { error: `kind нь ${validKinds.join(' / ')} байх ёстой.` };
    }

    const outcome = (args?.outcome || null) as ActivityOutcome | null;
    const validOutcomes = ['connected', 'no_answer', 'busy', 'wrong_number', 'scheduled', 'n/a'];
    if (outcome && !validOutcomes.includes(outcome)) {
        return { error: `outcome нь ${validOutcomes.join(' / ')} байх ёстой.` };
    }

    // Лийдийг ID эсвэл харилцагчийн нэрээр олно
    let leadId: string | null = args?.lead_id || null;
    let leadName: string | null = null;
    if (!leadId && args?.customer_name) {
        const found = await runExcludingDeleted((excl) => {
            let q = db()
                .from('leads')
                .select('id, customer_name')
                .eq('shop_id', shopId)
                .ilike('customer_name', `%${args.customer_name}%`)
                .limit(2);
            if (excl) q = q.is('deleted_at', null);
            return q;
        });
        const rows = (found?.data || []) as any[];
        if (rows.length === 0) return { error: `«${args.customer_name}» нэртэй лийд олдсонгүй.` };
        if (rows.length > 1) return { error: `«${args.customer_name}» нэрээр олон лийд олдлоо — lead_id-г нь заана уу.` };
        leadId = rows[0].id;
        leadName = rows[0].customer_name;
    }
    if (!leadId) return { error: 'lead_id эсвэл customer_name шаардлагатай.' };

    const kindLabel: Record<string, string> = {
        call: 'Дуудлага', sms: 'СМС', messenger: 'Мессенжер', meeting: 'Уулзалт', note: 'Тэмдэглэл',
    };
    const label = `${kindLabel[kind]} бүртгэх${leadName ? ` — ${leadName}` : ''}`;

    if (!confirm) {
        return confirmNeeded('log_activity', args, label, {
            Төрөл: kindLabel[kind],
            Харилцагч: leadName || leadId,
            'Үр дүн': outcome || '—',
            Тэмдэглэл: args.note || '—',
            Менежер: managerName,
        });
    }

    await recordActivity({
        shopId,
        actorId: userId || null,
        actorName: managerName,
        entityType: 'lead',
        entityId: leadId,
        kind,
        direction: kind === 'note' ? null : 'out',
        outcome,
        body: args.note || null,
        durationSec: args.duration_sec != null ? Number(args.duration_sec) : null,
        source: 'ai',
    });

    // Лийдийг «хөндсөн» гэж тэмдэглэнэ — stale шүүлт зөв ажиллана
    const touch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (args.next_followup_days != null) {
        const when = new Date();
        when.setDate(when.getDate() + Number(args.next_followup_days));
        when.setHours(10, 0, 0, 0);
        touch.next_followup_at = when.toISOString();
    }
    const { error } = await db().from('leads').update(touch).eq('id', leadId);
    if (error) logger.warn('[logActivity] лийд шинэчлэхэд алдаа', { error: error.message });

    return {
        success: true,
        message:
            `${label} — бүртгэгдлээ.` +
            (touch.next_followup_at ? ` Дараагийн дагалт: ${fmtDateTime(touch.next_followup_at as string)}.` : ''),
    };
}

/** Лийд дээр дараагийн дагалтын огноо тавих / цуцлах. */
export async function setLeadFollowup(shopId: string, args: any, confirm = false, managerName = '') {
    if (!args?.lead_id) return { error: 'lead_id шаардлагатай.' };

    const res = await db()
        .from('leads')
        .select('id, customer_name, next_followup_at')
        .eq('id', args.lead_id)
        .eq('shop_id', shopId)
        .maybeSingle();
    const lead: any = res.data;
    if (!lead) return { error: 'Лийд олдсонгүй.' };

    let nextAt: string | null = null;
    if (args.days != null) {
        const when = new Date();
        when.setDate(when.getDate() + Number(args.days));
        when.setHours(10, 0, 0, 0);
        nextAt = when.toISOString();
    } else if (args.at) {
        const when = new Date(args.at);
        if (Number.isNaN(when.getTime())) return { error: 'Огноо буруу форматтай байна.' };
        nextAt = when.toISOString();
    }

    const label = nextAt
        ? `Дагалт товлох — ${lead.customer_name}: ${fmtDateTime(nextAt)}`
        : `Дагалт цуцлах — ${lead.customer_name}`;

    if (!confirm) {
        return confirmNeeded('set_lead_followup', args, label, {
            Харилцагч: lead.customer_name,
            'Одоогийн дагалт': lead.next_followup_at ? fmtDateTime(lead.next_followup_at) : '—',
            'Шинэ дагалт': nextAt ? fmtDateTime(nextAt) : '(цуцлана)',
        });
    }

    const { error } = await db()
        .from('leads')
        .update({ next_followup_at: nextAt, updated_at: new Date().toISOString() })
        .eq('id', args.lead_id);
    if (error) return { error: `Дагалт тавихад алдаа: ${error.message}` };

    await recordActivity({
        shopId, actorName: managerName, entityType: 'lead', entityId: args.lead_id,
        kind: 'update', source: 'ai', body: label,
    });

    return { success: true, message: `${label} — амжилттай.` };
}

/** Лийдийг өөр менежерт шилжүүлэх. */
export async function reassignLead(shopId: string, args: any, confirm = false, managerName = '') {
    if (!args?.lead_id) return { error: 'lead_id шаардлагатай.' };
    const to = typeof args.to_manager === 'string' ? args.to_manager.trim() : '';
    if (!to) return { error: 'to_manager (хүлээн авах менежерийн нэр) шаардлагатай.' };

    const res = await db()
        .from('leads')
        .select('id, customer_name, sales_manager_name')
        .eq('id', args.lead_id)
        .eq('shop_id', shopId)
        .maybeSingle();
    const lead: any = res.data;
    if (!lead) return { error: 'Лийд олдсонгүй.' };

    // Хүлээн авагчийг бүртгэлээс баталгаажуулна — санамсаргүй бичсэн нэр дээр
    // лийд «алга болохоос» сэргийлнэ.
    const roster = await db()
        .from('sales_managers')
        .select('name, is_active')
        .eq('shop_id', shopId);
    const names = ((roster.data || []) as any[]).filter((r) => r.is_active).map((r) => r.name);
    if (names.length > 0 && !names.includes(to)) {
        return { error: `«${to}» борлуулалтын бүртгэлд алга. Боломжит нэрс: ${names.join(', ')}` };
    }

    const label = `Лийд шилжүүлэх — ${lead.customer_name}: ${lead.sales_manager_name || '(хуваарилаагүй)'} → ${to}`;
    if (!confirm) {
        return confirmNeeded('reassign_lead', args, label, {
            Харилцагч: lead.customer_name,
            'Одоогийн эзэн': lead.sales_manager_name || '(хуваарилаагүй)',
            'Шинэ эзэн': to,
        });
    }

    const { error } = await db()
        .from('leads')
        .update({ sales_manager_name: to, updated_at: new Date().toISOString() })
        .eq('id', args.lead_id);
    if (error) return { error: `Шилжүүлэхэд алдаа: ${error.message}` };

    await recordActivity({
        shopId, actorName: managerName, entityType: 'lead', entityId: args.lead_id,
        kind: 'assign', source: 'ai', body: label,
        payload: { from: lead.sales_manager_name, to },
    });

    return { success: true, message: `${label} — амжилттай.` };
}

// ============================================================
// АЖИЛ БА САНУУЛГА (user_tasks)
// ============================================================

/**
 * Ажил үүсгэх (+ сануулга). `user_tasks` хүснэгт болон
 * /api/cron/task-reminders аль хэдийн байсан ч чатаар ашиглах tool байгаагүй.
 */
export async function createTask(shopId: string, args: any, confirm = false, userId = '') {
    if (!userId) return { error: 'Хэрэглэгч тодорхойгүй байна.' };
    const title = typeof args?.title === 'string' ? args.title.trim() : '';
    if (!title) return { error: 'title (ажлын нэр) шаардлагатай.' };

    let dueAt: string | null = null;
    if (args.due_in_days != null) {
        const when = new Date();
        when.setDate(when.getDate() + Number(args.due_in_days));
        when.setHours(18, 0, 0, 0);
        dueAt = when.toISOString();
    } else if (args.due_at) {
        const when = new Date(args.due_at);
        if (Number.isNaN(when.getTime())) return { error: 'due_at буруу форматтай байна.' };
        dueAt = when.toISOString();
    }

    // Сануулгын анхдагч: хугацаанаас 2 цагийн өмнө
    let remindAt: string | null = null;
    if (args.remind_at) {
        const when = new Date(args.remind_at);
        if (Number.isNaN(when.getTime())) return { error: 'remind_at буруу форматтай байна.' };
        remindAt = when.toISOString();
    } else if (args.remind === true && dueAt) {
        remindAt = new Date(new Date(dueAt).getTime() - 2 * 60 * 60 * 1000).toISOString();
    }

    const priority = ['low', 'normal', 'high'].includes(args.priority) ? args.priority : 'normal';
    const label = `Ажил нэмэх: ${title}`;

    if (!confirm) {
        return confirmNeeded('create_task', args, label, {
            Ажил: title,
            Хугацаа: dueAt ? fmtDateTime(dueAt) : '—',
            Сануулга: remindAt ? fmtDateTime(remindAt) : '—',
            Ач: priority,
        });
    }

    const row: Record<string, unknown> = {
        shop_id: shopId,
        user_id: userId,
        assignee_id: userId,
        title,
        note: args.note || null,
        due_at: dueAt,
        remind_at: remindAt,
        priority,
        status: 'pending',
        source: 'ai',
    };
    if (args.entity_type && args.entity_id) {
        row.entity_type = args.entity_type;
        row.entity_id = args.entity_id;
    }

    let insert = await db().from('user_tasks').insert(row).select('id').single();
    if (insert.error && /assignee_id|priority|source|entity_/i.test(insert.error.message)) {
        // Миграци ороогүй орчинд шинэ багануудгүйгээр дахин оролдоно
        const { assignee_id, priority: _p, source, entity_type, entity_id, ...base } = row as any;
        void assignee_id; void _p; void source; void entity_type; void entity_id;
        insert = await db().from('user_tasks').insert(base).select('id').single();
    }
    if (insert.error) return { error: `Ажил үүсгэхэд алдаа: ${insert.error.message}` };

    return {
        success: true,
        taskId: insert.data?.id,
        message:
            `«${title}» ажил нэмэгдлээ.` +
            (dueAt ? ` Хугацаа: ${fmtDateTime(dueAt)}.` : '') +
            (remindAt ? ` Сануулга: ${fmtDateTime(remindAt)}.` : ''),
    };
}

/** Ажлыг дууссан болгох (ID эсвэл нэрээр). */
export async function completeTask(shopId: string, args: any, confirm = false, userId = '') {
    if (!userId) return { error: 'Хэрэглэгч тодорхойгүй байна.' };

    let taskId: string | null = args?.task_id || null;
    let title: string | null = null;

    if (!taskId && args?.title) {
        const found = await runExcludingDeleted((excl) => {
            let q = db()
                .from('user_tasks')
                .select('id, title')
                .eq('shop_id', shopId)
                .eq('status', 'pending')
                .or(`assignee_id.eq.${userId},user_id.eq.${userId}`)
                .ilike('title', `%${args.title}%`)
                .limit(2);
            if (excl) q = q.is('deleted_at', null);
            return q;
        });
        const rows = (found?.data || []) as any[];
        if (rows.length === 0) return { error: `«${args.title}» нэртэй дуусаагүй ажил олдсонгүй.` };
        if (rows.length > 1) return { error: `«${args.title}» нэрээр олон ажил олдлоо — task_id-г нь заана уу.` };
        taskId = rows[0].id;
        title = rows[0].title;
    }
    if (!taskId) return { error: 'task_id эсвэл title шаардлагатай.' };

    const label = `Ажил дуусгах${title ? `: ${title}` : ''}`;
    if (!confirm) {
        return confirmNeeded('complete_task', args, label, { Ажил: title || taskId });
    }

    const { error } = await db()
        .from('user_tasks')
        .update({ status: 'done', completed_at: new Date().toISOString() })
        .eq('id', taskId)
        .eq('shop_id', shopId);
    if (error) return { error: `Дуусгахад алдаа: ${error.message}` };

    return { success: true, message: `${label} — амжилттай.` };
}
