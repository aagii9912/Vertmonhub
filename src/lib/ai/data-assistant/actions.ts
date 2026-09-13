/**
 * AI tool — борлуулагчийн ӨДӨР ТУТМЫН үйлдлүүд (wave 1).
 * Бүгд апп-ын service давхаргаар (ViewingService, TaskService, PaymentService,
 * leads/activities) дамжина → гараар ба AI-аар хийсэн бичлэг ижил side-effect-тэй.
 *
 * `confirm=false` үед mutating tool preview буцаана; AUTO_TOOL_NAMES-д багтсан
 * (буцаах боломжтой, эрсдэл багатай) tool-уудыг loop шууд confirm=true-ээр дуудна.
 */

import { supabaseAdmin as adminClient } from '@/lib/supabase';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { logLeadActivity, recordLeadContact } from '@/lib/leads/activities';
import { resolveActiveManagerName } from '@/lib/sales/manager-identity';
import { formatShortDate, formatTime, ubDateStr } from '@/lib/utils/date';
import { updateViewing, listViewings } from '@/lib/services/ViewingService';
import { listTasks, createTask, updateTask, isMissingTaskTable, TASK_MIGRATION_HINT } from '@/lib/services/TaskService';
import { listPayments, addPayment, updatePayment } from '@/lib/services/PaymentService';

type Args = Record<string, any>;
const db = () => adminClient();

function confirmNeeded(tool: string, args: Args, label: string, preview: Record<string, unknown>) {
    return { requiresConfirmation: true, action: { tool, args }, label, preview };
}

/** Лидийг id / нэр / утсаар олно. Олон таарвал сонголтуудыг буцаана (модель ask_user-ээр тодруулна). */
export async function findLead(shopId: string, a: { lead_id?: string; customer_name?: string; customer_phone?: string }) {
    let q = db().from('leads').select('id, customer_name, customer_phone, status, sales_manager_name').eq('shop_id', shopId).is('deleted_at', null);
    if (a.lead_id) q = q.eq('id', a.lead_id);
    else if (a.customer_phone) {
        const phone = String(a.customer_phone).replace(/\D/g, '').slice(-8);
        if (phone.length < 8) return { error: 'Лидийн бүтэн утасны дугаарыг оруулна уу' };
        q = q.ilike('customer_phone', `%${phone}%`);
    } else if (a.customer_name) {
        const name = String(a.customer_name).trim().replace(/[\\%_]/g, '\\$&');
        if (!name) return { error: 'Лидийн нэрийг оруулна уу' };
        q = q.ilike('customer_name', `%${name}%`);
    }
    else return { error: 'lead_id, customer_name эсвэл customer_phone шаардлагатай' };
    const { data, error } = await q.limit(5);
    if (error) return { error: 'Лид хайхад алдаа гарлаа. Дахин оролдоно уу.' };
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

const FollowupSchema = z.string().datetime({ offset: true }).nullable().optional();

export async function logCall(shopId: string, args: Args, userId: string, userName: string) {
    const parsed = FollowupSchema.safeParse(args.next_followup_at === '' ? null : args.next_followup_at);
    if (!parsed.success) return { error: 'Дараагийн холбооны огноо/цагийг ISO 8601 хэлбэрээр, цагийн бүстэй оруулна уу' };
    const f = await findLead(shopId, args);
    if ('error' in f) return f;
    const content = String(args.summary || 'Залгасан').trim().slice(0, 4000);
    if (!content) return { error: 'Дуудлагын товч агуулгыг оруулна уу' };
    const next = isoOrNull(parsed.data);
    const result = await recordLeadContact(db(), { shopId, leadId: f.lead.id, type: 'call', content, nextFollowupAt: next, userId, managerName: userName || null });
    if (!result.ok) return { error: result.error, partialSuccess: result.partialSuccess ?? false, leadId: f.lead.id };
    return { success: true, message: `«${f.lead.customer_name}»-д дуудлага бүртгэлээ${next ? `, дараагийн холбоо ${formatShortDate(next)} ${formatTime(next)}` : ''}.`, leadId: f.lead.id };
}

export async function setFollowup(shopId: string, args: Args, userId: string, userName: string) {
    const parsed = FollowupSchema.safeParse(args.next_followup_at === '' ? null : args.next_followup_at);
    if (!parsed.success || parsed.data === undefined) return { error: 'next_followup_at (ISO огноо/цаг, цагийн бүстэй) шаардлагатай' };
    const f = await findLead(shopId, args);
    if ('error' in f) return f;
    const next = isoOrNull(parsed.data);
    const message = next ? `«${f.lead.customer_name}»-ийн дараагийн холбоог ${formatShortDate(next)} ${formatTime(next)} болголоо.` : `«${f.lead.customer_name}»-ийн follow-up-ийг цуцаллаа.`;
    const content = String(args.note || '').trim().slice(0, 4000) || message;
    const result = await recordLeadContact(db(), { shopId, leadId: f.lead.id, type: 'note', content, nextFollowupAt: next, userId, managerName: userName || null });
    if (!result.ok) return { error: result.error, partialSuccess: result.partialSuccess ?? false, leadId: f.lead.id };
    return { success: true, message, leadId: f.lead.id };
}

export async function assignLeadManager(shopId: string, args: Args, confirm: boolean, userId: string, userName: string) {
    const f = await findLead(shopId, args);
    if ('error' in f) return f;
    const resolved = await resolveActiveManagerName(db(), shopId, args.manager_name);
    if (!resolved.ok) return { error: resolved.error };
    const manager = resolved.managerName;
    if (!confirm) return confirmNeeded('assign_lead_manager', { lead_id: f.lead.id, manager_name: manager }, `Лид шилжүүлэх: ${f.lead.customer_name}`, { Лид: f.lead.customer_name, 'Одоогийн менежер': f.lead.sales_manager_name || '-', 'Шинэ менежер': manager });
    const { data, error } = await db().from('leads').update({ sales_manager_name: manager, updated_at: new Date().toISOString() })
        .eq('id', f.lead.id).eq('shop_id', shopId).is('deleted_at', null).select('id').maybeSingle();
    if (error) return { error: 'Лидийн менежер шинэчлэгдсэнгүй. Дахин оролдоно уу.' };
    if (!data) return { error: 'Лид олдсонгүй. Менежер өөрчлөгдөөгүй.' };
    const activity = await logLeadActivity(db(), { shopId, leadId: f.lead.id, type: 'manager', content: `Менежер: ${f.lead.sales_manager_name || '-'} → ${manager}`, meta: { from: f.lead.sales_manager_name, to: manager }, createdBy: userId, createdByName: userName || null });
    if (!activity) return { error: `Лид ${manager}-д шилжсэн боловч өөрчлөлтийн түүх хадгалагдсангүй. Лидээ нээж шалгана уу.`, partialSuccess: true, leadId: f.lead.id };
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
        const { data } = await db().from('property_viewings').select('id, scheduled_at, status, lead_id, leads(customer_name), properties(name)').eq('id', args.viewing_id).eq('shop_id', shopId).is('deleted_at', null).maybeSingle();
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
    return { success: true, warning: r.warning, message: `Уулзалтыг «${label}» гэж бүртгэлээ${interest ? ` (сонирхол ${interest}/5)` : ''}.${r.warning ? ` ${r.warning}` : ''}`, viewingId: v.viewing.id };
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
    return { success: true, warning: r.warning, message: `Уулзалтыг ${at.slice(0, 16).replace('T', ' ')} болгож зөөлөө.${r.warning ? ` ${r.warning}` : ''}`, viewingId: v.viewing.id };
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

const RECEIPT_KINDS = ['advance', 'installment', 'other'] as const;
const PAYMENT_METHODS = ['cash', 'bank', 'bank_transfer', 'barter', 'mortgage'] as const;
const RECEIPT_LABELS = { advance: 'Урьдчилгаа', installment: 'Хуваарийн төлбөр', other: 'Бусад төлөлт' };

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
    if (!Number.isFinite(paid) || paid < 0 || paid > amount) return { error: 'Төлсөн дүн 0-ээс багагүй, хуваарийн дүнгээс ихгүй байна' };
    const receiptKind = RECEIPT_KINDS.find(kind => kind === args.receipt_kind) ?? null;
    const paymentMethod = PAYMENT_METHODS.find(method => method === args.payment_method) ?? null;
    if ((paid > 0 || args.receipt_kind) && !receiptKind) return { error: 'Төлөлтийн төрлийг хэрэглэгчээс тодруулна уу: advance (урьдчилгаа), installment (хуваарийн төлбөр), other (бусад).', missingFields: ['receipt_kind'] };
    if ((paid > 0 || args.payment_method) && !paymentMethod) return { error: 'Төлбөрийн хэлбэрийг хэрэглэгчээс тодруулна уу: cash, bank, bank_transfer, barter, mortgage.', missingFields: ['payment_method'] };
    // Preview-ийн ID нь баталгаажуулалт/давтан оролдлого бүрт хэвээр дамжина.
    const requestId = args.client_request_id ?? (confirm ? null : randomUUID());
    if (!z.string().uuid().safeParse(requestId).success) return { error: 'Төлбөрийн баталгаажуулах мэдээлэл дутуу байна. Урьдчилсан мэдээллийг дахин гаргана уу.' };
    const due = String(args.due_date || ubDateStr()).slice(0, 10);
    const payload = { contract_id: c.contract.id, client_request_id: requestId as string, due_date: due, amount, paid_amount: paid, paid_date: paid > 0 ? (args.paid_date || ubDateStr()) : null, payment_method: paymentMethod, receipt_kind: receiptKind, label: args.label || null, installment_number: args.installment_number || undefined };
    if (!confirm) return confirmNeeded('add_contract_payment', payload, `Төлбөр бүртгэх: ${c.contract.contract_number || c.contract.customer_name}`, { Гэрээ: c.contract.contract_number || '-', Харилцагч: c.contract.customer_name, 'Төлөх огноо': due, Дүн: `${amount.toLocaleString()}₮`, Төлсөн: `${paid.toLocaleString()}₮`, 'Төлсөн огноо': payload.paid_date || '-', 'Төлөлтийн төрөл': receiptKind ? RECEIPT_LABELS[receiptKind] : '-', Хэлбэр: paymentMethod || '-' });
    const r = await addPayment(db(), shopId, c.contract.id, payload);
    if ('error' in r) return { error: r.error };
    return { success: true, message: `${c.contract.customer_name}-ийн гэрээнд ${amount.toLocaleString()}₮ төлбөрийн мөр нэмэгдлээ${paid > 0 ? ` (${paid.toLocaleString()}₮ ${payload.payment_method === 'barter' ? 'бартерын төлөлт бүртгэгдлээ' : 'төлсөн, кассад орлого бичигдлээ'})` : ''}.`, paymentId: r.payment.id };
}

export async function markPaymentPaid(shopId: string, args: Args, confirm: boolean) {
    let row: any = null;
    if (args.payment_id) {
        const { data, error } = await db().from('payment_schedules').select('id, contract_id, installment_number, label, amount, paid_amount, paid_date, payment_method, receipt_kind, status').eq('id', args.payment_id).eq('shop_id', shopId).maybeSingle();
        if (error) return { error: 'Төлбөрийн мөр уншихад алдаа гарлаа' };
        row = data;
    } else {
        const c = await findContract(shopId, args);
        if ('error' in c) return c;
        const { data, error } = await listPayments(db(), shopId, c.contract.id);
        if (error) return { error: 'Төлбөрийн хуваарь уншихад алдаа гарлаа' };
        const pending = (data || []).filter((p) => p.status !== 'paid');
        row = args.installment_number ? pending.find((p) => p.installment_number === Number(args.installment_number)) : pending[0];
        if (!row) return { error: 'Төлөгдөөгүй хуваарийн мөр олдсонгүй' };
    }
    if (!row) return { error: 'Төлбөрийн мөр олдсонгүй' };
    const paidAmount = args.paid_amount != null ? Number(args.paid_amount) : Number(row.amount);
    if (!Number.isFinite(paidAmount) || paidAmount < Number(row.paid_amount || 0) || paidAmount > Number(row.amount)) return { error: 'Төлсөн дүнг бууруулах эсвэл хуваарийн дүнгээс хэтрүүлэх боломжгүй' };
    const receiptKind = args.receipt_kind === undefined ? (row.receipt_kind ?? null) : args.receipt_kind;
    const paymentMethod = args.payment_method === undefined ? (row.payment_method ?? null) : args.payment_method;
    if ((paidAmount > Number(row.paid_amount || 0) || receiptKind) && !RECEIPT_KINDS.includes(receiptKind)) return { error: 'Төлөлтийн төрлийг хэрэглэгчээс тодруулна уу: advance (урьдчилгаа), installment (хуваарийн төлбөр), other (бусад).', missingFields: ['receipt_kind'] };
    if ((paidAmount > Number(row.paid_amount || 0) || paymentMethod) && !PAYMENT_METHODS.includes(paymentMethod)) return { error: 'Төлбөрийн хэлбэрийг хэрэглэгчээс тодруулна уу: cash, bank, bank_transfer, barter, mortgage.', missingFields: ['payment_method'] };
    const payload = {
        payment_id: row.id, paid_amount: paidAmount,
        paid_date: args.paid_date ?? (paidAmount > Number(row.paid_amount || 0) ? ubDateStr() : row.paid_date ?? null),
        payment_method: paymentMethod, receipt_kind: receiptKind,
    };
    if (!confirm) return confirmNeeded('mark_payment_paid', payload, `Төлбөр төлсөн гэж тэмдэглэх`, { Мөр: `#${row.installment_number}${row.label ? ` ${row.label}` : ''}`, Дүн: `${Number(row.amount).toLocaleString()}₮`, 'Төлсөн болгох': `${paidAmount.toLocaleString()}₮`, Огноо: payload.paid_date, 'Төлөлтийн төрөл': RECEIPT_LABELS[receiptKind as keyof typeof RECEIPT_LABELS] || '-', Хэлбэр: payload.payment_method || '-' });
    const r = await updatePayment(db(), shopId, row.id, { paid_amount: paidAmount, paid_date: payload.paid_date, payment_method: payload.payment_method, receipt_kind: payload.receipt_kind }, { recordReceiptDelta: true });
    if ('error' in r) return { error: r.error };
    return { success: true, message: `Төлбөрийн мөр #${row.installment_number} ${paidAmount.toLocaleString()}₮ ${payload.payment_method === 'barter' ? 'бартерын төлөлтөөр' : 'төлсөн гэж'} бүртгэгдлээ.`, paymentId: row.id };
}
