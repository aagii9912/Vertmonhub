/**
 * AI tool — борлуулагчийн ӨДӨР ТУТМЫН үйлдлүүд (wave 1).
 * Бүгд апп-ын service давхаргаар (ViewingService, TaskService, PaymentService,
 * leads/activities) дамжина → гараар ба AI-аар хийсэн бичлэг ижил side-effect-тэй.
 *
 * `confirm=false` үед mutating tool preview буцаана; AUTO_TOOL_NAMES-д багтсан
 * (буцаах боломжтой, эрсдэл багатай) tool-уудыг loop шууд confirm=true-ээр дуудна.
 */

import { supabaseAdmin as adminClient } from '@/lib/supabase';
import { recordLeadContact } from '@/lib/leads/activities';
import { updateViewing, listViewings } from '@/lib/services/ViewingService';
import { listTasks, createTask, updateTask, isMissingTaskTable, TASK_MIGRATION_HINT } from '@/lib/services/TaskService';
import { listPayments, addPayment, updatePayment } from '@/lib/services/PaymentService';
import { logLeadActivity } from '@/lib/leads/activities';

type Args = Record<string, any>;
const db = () => adminClient();

function confirmNeeded(tool: string, args: Args, label: string, preview: Record<string, unknown>) {
    return { requiresConfirmation: true, action: { tool, args }, label, preview };
}

/** Лидийг id / нэр / утсаар олно. Олон таарвал сонголтуудыг буцаана (модель ask_user-ээр тодруулна). */
export async function findLead(shopId: string, a: { lead_id?: string; customer_name?: string; customer_phone?: string }) {
    let q = db().from('leads').select('id, customer_name, customer_phone, status, sales_manager_name').eq('shop_id', shopId).is('deleted_at', null);
    if (a.lead_id) q = q.eq('id', a.lead_id);
    else if (a.customer_phone) q = q.ilike('customer_phone', `%${String(a.customer_phone).replace(/\D/g, '').slice(-8)}%`);
    else if (a.customer_name) q = q.ilike('customer_name', `%${a.customer_name}%`);
    else return { error: 'lead_id, customer_name эсвэл customer_phone шаардлагатай' };
    const { data } = await q.limit(5);
    if (!data || !data.length) return { error: 'Лид олдсонгүй' };
    if (data.length > 1 && !a.lead_id) return { error: 'Олон лид таарлаа — аль нь болохыг тодруул (ask_user)', options: data };
    return { lead: data[0] };
}

function isoOrNull(v: unknown): string | null | undefined {
    if (v === undefined) return undefined;
    if (v === null || v === '') return null;
    const t = Date.parse(String(v));
    return Number.isNaN(t) ? undefined : new Date(t).toISOString();
}

/* ---------------- Лид: дуудлага, follow-up, менежер ---------------- */

export async function logCall(shopId: string, args: Args, userId: string, userName: string) {
    const f = await findLead(shopId, args);
    if ('error' in f) return f;
    const content = String(args.summary || 'Залгасан').slice(0, 4000);
    const next = isoOrNull(args.next_followup_at);
    await recordLeadContact(db(), { shopId, leadId: f.lead.id, type: 'call', content, nextFollowupAt: next, userId, managerName: userName || null });
    return { success: true, message: `«${f.lead.customer_name}»-д дуудлага бүртгэлээ${next ? `, дараагийн холбоо ${next.slice(0, 16).replace('T', ' ')}` : ''}.`, leadId: f.lead.id };
}

export async function setFollowup(shopId: string, args: Args, userId: string, userName: string) {
    const f = await findLead(shopId, args);
    if ('error' in f) return f;
    const next = isoOrNull(args.next_followup_at);
    if (next === undefined) return { error: 'next_followup_at (ISO огноо/цаг) шаардлагатай' };
    await db().from('leads').update({ next_followup_at: next, updated_at: new Date().toISOString() }).eq('id', f.lead.id);
    if (args.note) await logLeadActivity(db(), { shopId, leadId: f.lead.id, type: 'note', content: String(args.note).slice(0, 4000), createdBy: userId, createdByName: userName || null });
    return { success: true, message: next ? `«${f.lead.customer_name}»-ийн дараагийн холбоог ${next.slice(0, 16).replace('T', ' ')} болголоо.` : `«${f.lead.customer_name}»-ийн follow-up-ийг цуцаллаа.`, leadId: f.lead.id };
}

export async function assignLeadManager(shopId: string, args: Args, confirm: boolean, userId: string, userName: string) {
    const f = await findLead(shopId, args);
    if ('error' in f) return f;
    const manager = String(args.manager_name || '').trim().slice(0, 120);
    if (!manager) return { error: 'manager_name шаардлагатай' };
    if (!confirm) return confirmNeeded('assign_lead_manager', { lead_id: f.lead.id, manager_name: manager }, `Лид шилжүүлэх: ${f.lead.customer_name}`, { Лид: f.lead.customer_name, 'Одоогийн менежер': f.lead.sales_manager_name || '-', 'Шинэ менежер': manager });
    await db().from('leads').update({ sales_manager_name: manager, updated_at: new Date().toISOString() }).eq('id', f.lead.id);
    await logLeadActivity(db(), { shopId, leadId: f.lead.id, type: 'manager', content: `Менежер: ${f.lead.sales_manager_name || '-'} → ${manager}`, createdBy: userId, createdByName: userName || null });
    return { success: true, message: `«${f.lead.customer_name}» лидийг ${manager}-д шилжүүллээ.`, leadId: f.lead.id };
}

/* ---------------- Уулзалт ---------------- */

export async function listViewingsTool(shopId: string, args: Args) {
    return listViewings(db(), shopId, { range: args.range, status: args.status, manager: args.manager, leadId: args.lead_id, limit: args.limit });
}

type ViewingRow = { id: string; scheduled_at: string; status: string; lead_id: string | null; leads?: { customer_name?: string } | { customer_name?: string }[] | null; properties?: { name?: string } | { name?: string }[] | null };
type FindViewing = { viewing: ViewingRow } | { error: string; options?: unknown };

async function findViewing(shopId: string, args: Args): Promise<FindViewing> {
    if (args.viewing_id) {
        const { data } = await db().from('property_viewings').select('id, scheduled_at, status, lead_id, leads(customer_name), properties(name)').eq('id', args.viewing_id).eq('shop_id', shopId).maybeSingle();
        return data ? { viewing: data as unknown as ViewingRow } : { error: 'Уулзалт олдсонгүй' };
    }
    const f = await findLead(shopId, args);
    if ('error' in f) return { error: f.error ?? 'Лид олдсонгүй', options: f.options };
    const { data } = await db().from('property_viewings').select('id, scheduled_at, status, lead_id, leads(customer_name), properties(name)')
        .eq('shop_id', shopId).eq('lead_id', f.lead.id).is('deleted_at', null).eq('status', 'scheduled').order('scheduled_at', { ascending: false }).limit(1);
    if (!data || !data.length) return { error: `«${f.lead.customer_name}»-д товлогдсон (scheduled) уулзалт алга` };
    return { viewing: data[0] as unknown as ViewingRow };
}

export async function recordViewingOutcome(shopId: string, args: Args, userId: string, userName: string) {
    const v = await findViewing(shopId, args);
    if ('error' in v) return v;
    const status = ['completed', 'no_show', 'cancelled'].includes(args.status) ? args.status : 'completed';
    const interest = args.interest_level != null ? Math.max(1, Math.min(5, Number(args.interest_level))) : undefined;
    const r = await updateViewing(db(), shopId, v.viewing.id, {
        status, interest_level: interest, customer_feedback: args.feedback ? String(args.feedback).slice(0, 4000) : undefined,
        agent_notes: args.notes ? String(args.notes).slice(0, 4000) : undefined, next_followup_at: isoOrNull(args.next_followup_at),
    }, { userId, managerName: userName || null });
    if (!r.ok) return { error: r.error };
    const label = status === 'completed' ? 'болсон' : status === 'no_show' ? 'ирээгүй' : 'цуцлагдсан';
    return { success: true, message: `Уулзалтыг «${label}» гэж бүртгэлээ${interest ? ` (сонирхол ${interest}/5)` : ''}.`, viewingId: v.viewing.id };
}

export async function rescheduleViewing(shopId: string, args: Args, confirm: boolean, userId: string, userName: string) {
    const v = await findViewing(shopId, args);
    if ('error' in v) return v;
    const at = isoOrNull(args.scheduled_at);
    if (!at) return { error: 'scheduled_at (ISO огноо/цаг) шаардлагатай' };
    const one = <T,>(x: T | T[] | null | undefined): T | undefined => (Array.isArray(x) ? x[0] : x ?? undefined);
    const lead = one(v.viewing.leads)?.customer_name || '-';
    const prop = one(v.viewing.properties)?.name || '-';
    if (!confirm) return confirmNeeded('reschedule_viewing', { viewing_id: v.viewing.id, scheduled_at: at }, `Уулзалт зөөх: ${lead}`, { Лид: lead, Байр: prop, 'Хуучин цаг': String(v.viewing.scheduled_at).slice(0, 16).replace('T', ' '), 'Шинэ цаг': at.slice(0, 16).replace('T', ' ') });
    const r = await updateViewing(db(), shopId, v.viewing.id, { scheduled_at: at, status: 'scheduled' }, { userId, managerName: userName || null });
    if (!r.ok) return { error: r.error };
    return { success: true, message: `Уулзалтыг ${at.slice(0, 16).replace('T', ' ')} болгож зөөлөө.`, viewingId: v.viewing.id };
}

/* ---------------- Хувийн ажил ---------------- */

export async function listMyTasks(shopId: string, args: Args, userId: string) {
    const { data, error } = await listTasks(db(), shopId, userId, args.status || 'pending');
    if (error) return isMissingTaskTable(error) ? { tasks: [], note: TASK_MIGRATION_HINT } : { error: error.message };
    return { tasks: (data || []).slice(0, args.limit || 30) };
}

export async function createTaskTool(shopId: string, args: Args, userId: string) {
    const title = String(args.title || '').trim().slice(0, 300);
    if (!title) return { error: 'title шаардлагатай' };
    const { data, error } = await createTask(db(), shopId, userId, { title, note: args.note, dueAt: isoOrNull(args.due_at) ?? null, remindAt: isoOrNull(args.remind_at) ?? null });
    if (error) return { error: isMissingTaskTable(error) ? TASK_MIGRATION_HINT : error.message };
    return { success: true, message: `«${title}» ажил нэмэгдлээ${data.due_at ? ` (${String(data.due_at).slice(0, 16).replace('T', ' ')})` : ''}.`, taskId: data.id };
}

export async function completeTaskTool(shopId: string, args: Args, userId: string) {
    let id: string | null = args.task_id || null;
    if (!id && args.title) {
        const { data } = await listTasks(db(), shopId, userId, 'pending');
        const hit = (data || []).find((t) => t.title.toLowerCase().includes(String(args.title).toLowerCase()));
        if (!hit) return { error: 'Ийм нэртэй хийгдээгүй ажил олдсонгүй' };
        id = hit.id;
    }
    if (!id) return { error: 'task_id эсвэл title шаардлагатай' };
    const { data, error } = await updateTask(db(), shopId, userId, id, { status: 'done' });
    if (error) return { error: error.message };
    if (!data) return { error: 'Ажил олдсонгүй' };
    return { success: true, message: `«${data.title}» ажлыг дуусгалаа.`, taskId: data.id };
}

/* ---------------- Гэрээний төлбөр ---------------- */

async function findContract(shopId: string, args: Args) {
    let q = db().from('property_contracts').select('id, contract_number, customer_name, total_price, paid_amount, balance').eq('shop_id', shopId).is('deleted_at', null);
    if (args.contract_id) q = q.eq('id', args.contract_id);
    else if (args.contract_number) q = q.ilike('contract_number', `%${args.contract_number}%`);
    else if (args.customer_name) q = q.ilike('customer_name', `%${args.customer_name}%`);
    else return { error: 'contract_id, contract_number эсвэл customer_name шаардлагатай' };
    const { data } = await q.limit(5);
    if (!data || !data.length) return { error: 'Гэрээ олдсонгүй' };
    if (data.length > 1 && !args.contract_id) return { error: 'Олон гэрээ таарлаа — тодруул (ask_user)', options: data };
    return { contract: data[0] };
}

export async function listContractPayments(shopId: string, args: Args) {
    const c = await findContract(shopId, args);
    if ('error' in c) return c;
    const { data, error } = await listPayments(db(), shopId, c.contract.id);
    if (error) return { error: error.message };
    return { contract: c.contract, payments: data || [] };
}

export async function addContractPayment(shopId: string, args: Args, confirm: boolean) {
    const c = await findContract(shopId, args);
    if ('error' in c) return c;
    const amount = Number(args.amount);
    if (!Number.isFinite(amount) || amount < 0) return { error: 'amount шаардлагатай' };
    const paid = Number(args.paid_amount || 0);
    const due = String(args.due_date || new Date().toISOString().slice(0, 10)).slice(0, 10);
    const payload = { contract_id: c.contract.id, due_date: due, amount, paid_amount: paid, paid_date: paid > 0 ? (args.paid_date || due) : null, payment_method: args.payment_method || null, label: args.label || null, installment_number: args.installment_number || undefined };
    if (!confirm) return confirmNeeded('add_contract_payment', payload, `Төлбөр бүртгэх: ${c.contract.contract_number || c.contract.customer_name}`, { Гэрээ: c.contract.contract_number || '-', Харилцагч: c.contract.customer_name, 'Төлөх огноо': due, Дүн: `${amount.toLocaleString()}₮`, Төлсөн: `${paid.toLocaleString()}₮`, Хэлбэр: args.payment_method || '-' });
    const r = await addPayment(db(), shopId, c.contract.id, payload);
    if ('error' in r) return { error: r.error };
    return { success: true, message: `${c.contract.customer_name}-ийн гэрээнд ${amount.toLocaleString()}₮ төлбөрийн мөр нэмэгдлээ${paid > 0 ? ` (${paid.toLocaleString()}₮ төлсөн, кассад орлого бичигдлээ)` : ''}.`, paymentId: r.payment.id };
}

export async function markPaymentPaid(shopId: string, args: Args, confirm: boolean) {
    let row: any = null;
    if (args.payment_id) {
        const { data } = await db().from('payment_schedules').select('id, contract_id, installment_number, label, amount, paid_amount, status').eq('id', args.payment_id).eq('shop_id', shopId).maybeSingle();
        row = data;
    } else {
        const c = await findContract(shopId, args);
        if ('error' in c) return c;
        const { data } = await listPayments(db(), shopId, c.contract.id);
        const pending = (data || []).filter((p) => p.status !== 'paid');
        row = args.installment_number ? pending.find((p) => p.installment_number === Number(args.installment_number)) : pending[0];
        if (!row) return { error: 'Төлөгдөөгүй хуваарийн мөр олдсонгүй' };
    }
    if (!row) return { error: 'Төлбөрийн мөр олдсонгүй' };
    const paidAmount = args.paid_amount != null ? Number(args.paid_amount) : Number(row.amount);
    const payload = { payment_id: row.id, paid_amount: paidAmount, paid_date: args.paid_date || new Date().toISOString().slice(0, 10), payment_method: args.payment_method || null };
    if (!confirm) return confirmNeeded('mark_payment_paid', payload, `Төлбөр төлсөн гэж тэмдэглэх`, { Мөр: `#${row.installment_number}${row.label ? ` ${row.label}` : ''}`, Дүн: `${Number(row.amount).toLocaleString()}₮`, 'Төлсөн болгох': `${paidAmount.toLocaleString()}₮`, Огноо: payload.paid_date, Хэлбэр: payload.payment_method || '-' });
    const r = await updatePayment(db(), shopId, row.id, { paid_amount: paidAmount, paid_date: payload.paid_date, payment_method: payload.payment_method }, { recordReceiptDelta: true });
    if ('error' in r) return { error: r.error };
    return { success: true, message: `Төлбөрийн мөр #${row.installment_number} ${paidAmount.toLocaleString()}₮ төлсөн гэж бүртгэгдлээ (касс: орлого).`, paymentId: row.id };
}
