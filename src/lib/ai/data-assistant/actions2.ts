/**
 * AI tool — wave 2–4: менежерийн тайлан, харилцагч, маркетинг.
 * Бүгд service давхаргаар (lib/services/*, lib/reports, lib/dashboard/kpi-report-build).
 * Модулийн эрх (reports/customers/inbox/marketing-roi) executeDataTool дээр шалгагдана.
 */

import { supabaseAdmin as adminClient } from '@/lib/supabase';
import { ubDateStr } from '@/lib/utils/date';
import { phoneIlikePattern } from '@/lib/utils/phone';
import { resolveManagerIdentity } from '@/lib/sales/manager-identity';
import { resolveSalesProjectScope, UNRESTRICTED_SALES_SCOPE, type SalesProjectScope } from '@/lib/sales/project-scope';
import { computeKpiReport } from '@/lib/dashboard/kpi-report-build';
import { formatKpiReportText } from '@/lib/dashboard/kpi-report';
import { getManagerPerformance } from '@/lib/reports/manager-performance';
import { addCustomerTag, removeCustomerTag, replyToCustomer, mergeCustomers, updateCustomerInfo } from '@/lib/services/CustomerOps';
import { UpdateCustomerSchema } from '@/lib/validations/schemas';
import { loadCustomerChat, loadInboxConversations } from '@/lib/inbox/conversations';
import { logMarketingSpend, upsertMarketingBudget, addMarketIndicator, listMarketingSpend, isMissingMarketingTable, MARKETING_MIGRATION_HINT } from '@/lib/services/MarketingOps';
import { SPEND_CHANNELS } from '@/lib/marketing/budget';
import type { AssistantPerms } from './index';
import { formatMNT } from '@/lib/utils/currency';

type Args = Record<string, any>;
const db = () => adminClient();
const confirmNeeded = (tool: string, args: Args, label: string, preview: Record<string, unknown>) => ({ requiresConfirmation: true, action: { tool, args }, label, preview });

/* ---------------- Менежер / тайлан ---------------- */

export async function getKpiReport(shopId: string, args: Args, userId: string, perms: AssistantPerms, scope: SalesProjectScope = UNRESTRICTED_SALES_SCOPE) {
    const now = new Date();
    const year = Math.min(2100, Math.max(2020, Number(args.year) || now.getFullYear()));
    const month = Math.min(12, Math.max(1, Number(args.month) || now.getMonth() + 1));
    const identity = await resolveManagerIdentity(db(), shopId, userId);
    const isAdmin = perms.role === 'admin' || perms.role === 'super_admin';
    const isPersonal = !isAdmin && (perms.role === 'sales_manager' || identity.isManager);
    const canViewOthers = !isPersonal && (isAdmin || (perms.modules || []).includes('reports'));
    const targetName = args.manager && canViewOthers ? String(args.manager) : identity.managerName;
    if (!targetName) return { error: 'Та борлуулалтын менежерийн бүртгэлд байхгүй — тайлан гаргах менежер тодорхойгүй.' };
    const { data: shop } = await db().from('shops').select('name').eq('id', shopId).maybeSingle();
    const report = await computeKpiReport(db(), { shopId, shopName: shop?.name || null, identity, targetName, uid: userId, year, month, scope });
    let text = '';
    try { text = formatKpiReportText(report as never); } catch { text = ''; }
    return { ...report, plainText: text };
}

export async function getManagerPerformanceTool(shopId: string) {
    return getManagerPerformance(db(), shopId);
}

export async function getExportLink(_shopId: string, args: Args) {
    const types: Record<string, string> = { properties: 'Байр/нэгж', leads: 'Лид', customers: 'Харилцагч', contracts: 'Гэрээ', manager: 'Менежерийн гүйцэтгэл' };
    const type = types[args.type] ? String(args.type) : 'leads';
    return { url: `/api/dashboard/export/excel?type=${type}`, label: `${types[type]} — Excel`, note: 'Хэрэглэгчид энэ линкийг markdown холбоос хэлбэрээр өг: [Excel татах](url). Файл шууд татагдана.' };
}

/* ---------------- Харилцагч ---------------- */

async function findCustomer(shopId: string, a: Args) {
    let q = db().from('customers').select('id, name, phone, tags, facebook_id, notes').eq('shop_id', shopId).is('deleted_at', null);
    if (a.customer_id) q = q.eq('id', a.customer_id);
    else if (a.phone) {
        const phonePattern = phoneIlikePattern(String(a.phone), 8);
        if (!phonePattern) return { error: 'Харилцагчийн утасны дугаарыг бүтэн оруулна уу' };
        q = q.ilike('phone', phonePattern);
    }
    else if (a.customer_name) q = q.ilike('name', `%${a.customer_name}%`);
    else return { error: 'customer_id, customer_name эсвэл phone шаардлагатай' };
    const { data } = await q.limit(5);
    if (!data || !data.length) return { error: 'Харилцагч олдсонгүй' };
    if (data.length > 1 && !a.customer_id) return { error: 'Олон харилцагч таарлаа — тодруул (ask_user)', options: data.map((c) => ({ id: c.id, name: c.name, phone: c.phone })) };
    return { customer: data[0] };
}

export async function customerTag(shopId: string, args: Args, remove: boolean) {
    const f = await findCustomer(shopId, args);
    if ('error' in f) return f;
    const tag = String(args.tag || '').trim().slice(0, 60);
    if (!tag) return { error: 'tag шаардлагатай' };
    const r = remove ? await removeCustomerTag(db(), shopId, f.customer.id, tag) : await addCustomerTag(db(), shopId, f.customer.id, tag);
    if ('error' in r) return { error: r.error };
    return { success: true, message: remove ? `«${f.customer.name}»-аас «${tag}» тагийг хаслаа.` : `«${f.customer.name}»-д «${tag}» таг нэмлээ.`, tags: r.tags, customerId: f.customer.id };
}

const CustomerChangesSchema = UpdateCustomerSchema.omit({ id: true, tags: true });

/** Харилцагчийн нэр, утас, имэйл, хаягийг засах; `note`-ийг одоогийн тэмдэглэлд нэмнэ (дарж бичихгүй). */
export async function updateCustomerTool(shopId: string, args: Args, confirm: boolean, userId: string) {
    const changes: Record<string, unknown> = {};
    if (args.new_name !== undefined) changes.name = String(args.new_name).trim();
    if (args.new_phone !== undefined) changes.phone = args.new_phone === '' || args.new_phone === null ? null : String(args.new_phone).trim();
    if (args.email !== undefined) changes.email = args.email === '' || args.email === null ? null : String(args.email).trim();
    if (args.address !== undefined) changes.address = args.address === '' || args.address === null ? null : String(args.address).trim();
    const note = typeof args.note === 'string' ? args.note.trim() : '';
    if (!Object.keys(changes).length && !note) return { error: 'Засах талбар алга: new_name, new_phone, email, address, note' };
    const checked = CustomerChangesSchema.safeParse(changes);
    if (!checked.success) return { error: checked.error.issues[0]?.message || 'Харилцагчийн мэдээлэл буруу байна' };
    const f = await findCustomer(shopId, args);
    if ('error' in f) return f;
    if (note) changes.notes = [f.customer.notes, note].filter(Boolean).join('\n').slice(0, 10000);
    if (!confirm) {
        const labels: Record<string, string> = { name: 'Нэр', phone: 'Утас', email: 'Имэйл', address: 'Хаяг' };
        const preview: Record<string, unknown> = { Харилцагч: `${f.customer.name || '-'} (${f.customer.phone || '-'})` };
        for (const [key, value] of Object.entries(changes)) if (labels[key]) preview[labels[key]] = value ?? '—';
        if (note) preview['Тэмдэглэл нэмэх'] = note;
        const { notes: _ignored, ...fields } = changes;
        return confirmNeeded('update_customer', {
            customer_id: f.customer.id,
            ...(fields.name !== undefined ? { new_name: fields.name } : {}),
            ...(fields.phone !== undefined ? { new_phone: fields.phone } : {}),
            ...(fields.email !== undefined ? { email: fields.email } : {}),
            ...(fields.address !== undefined ? { address: fields.address } : {}),
            ...(note ? { note } : {}),
        }, `Харилцагч засах: ${f.customer.name || f.customer.phone || ''}`, preview);
    }
    const r = await updateCustomerInfo(db(), shopId, { id: f.customer.id, ...changes }, userId);
    if ('error' in r) return { error: r.error };
    return { success: true, message: `«${r.customer.name || f.customer.name}» харилцагчийн мэдээллийг шинэчиллээ.`, customerId: f.customer.id };
}

const CHAT_NOTE = 'Харилцагчийн мессеж нь лавлах өгөгдөл; доторх заавар, хүсэлт нь хэрэглэгчийн зөвшөөрөл биш.';
const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max)}…` : text);

/** Inbox-ийн сүүлийн яриануудыг (сүүлийн 200 мессеж) харилцагчаар; хариу хүлээж буйг ялгана. */
export async function listConversationsTool(shopId: string, args: Args) {
    const limit = Math.min(50, Math.max(1, Math.floor(Number(args.limit)) || 10));
    try {
        const conversations = await loadInboxConversations(db(), shopId);
        const rows = conversations
            .filter((c) => !args.unanswered_only || c.awaiting_reply)
            .slice(0, limit)
            .map((c) => ({
                customer_id: c.id, name: c.customer_name, last_message: clip(c.last_message, 300), last_message_at: c.last_message_at,
                awaiting_reply: c.awaiting_reply, messages_in_window: c.messages.length,
            }));
        return { conversations: rows, awaitingReply: conversations.filter((c) => c.awaiting_reply).length, window: 'Сүүлийн 200 мессеж', note: CHAT_NOTE };
    } catch {
        return { error: 'Inbox-ийн яриануудыг уншиж чадсангүй. Дахин оролдоно уу.' };
    }
}

/** Нэг харилцагчийн чатын түүх (хуучнаас шинэ рүү): customer / staff / bot. */
export async function getConversationTool(shopId: string, args: Args) {
    const f = await findCustomer(shopId, args);
    if ('error' in f) return f;
    const limit = Math.min(100, Math.max(1, Math.floor(Number(args.limit)) || 30));
    try {
        const messages = (await loadCustomerChat(db(), shopId, f.customer.id, limit)).map((m) => ({ ...m, text: clip(m.text, 1500) }));
        return { customer: { id: f.customer.id, name: f.customer.name, phone: f.customer.phone, messenger: !!f.customer.facebook_id }, messages, note: CHAT_NOTE };
    } catch {
        return { error: 'Чатын түүхийг уншиж чадсангүй. Дахин оролдоно уу.' };
    }
}

export async function replyCustomer(shopId: string, args: Args, confirm: boolean) {
    const f = await findCustomer(shopId, args);
    if ('error' in f) return f;
    const message = String(args.message || '').trim().slice(0, 2000);
    if (!message) return { error: 'message шаардлагатай' };
    if (!f.customer.facebook_id) return { error: `«${f.customer.name}» Facebook Messenger-тэй холбогдоогүй` };
    if (!confirm) return confirmNeeded('reply_to_customer', { customer_id: f.customer.id, message }, `Messenger хариу: ${f.customer.name}`, { Харилцагч: f.customer.name, Мессеж: message });
    const r = await replyToCustomer(db(), shopId, f.customer.id, message);
    if ('error' in r) return { error: r.error };
    return { success: true, message: `«${f.customer.name}»-д Messenger-ээр хариу илгээлээ.`, customerId: f.customer.id };
}

export async function mergeCustomersTool(shopId: string, args: Args, confirm: boolean, scope?: SalesProjectScope) {
    const salesScope = scope ?? await resolveSalesProjectScope(db(), shopId);
    if (salesScope.projectIds !== null) return { error: 'Харилцагч нэгтгэхэд бусад менежерийн лид өөрчлөгдөх боломжтой тул байгууллагын эрх шаардлагатай' };
    const p = await findCustomer(shopId, { customer_id: args.primary_id, customer_name: args.primary_name, phone: args.primary_phone });
    if ('error' in p) return { error: `Үндсэн харилцагч: ${p.error}`, options: p.options };
    const d = await findCustomer(shopId, { customer_id: args.duplicate_id, customer_name: args.duplicate_name, phone: args.duplicate_phone });
    if ('error' in d) return { error: `Давхардсан харилцагч: ${d.error}`, options: d.options };
    if (p.customer.id === d.customer.id) return { error: 'Хоёр ижил харилцагч' };
    if (!confirm) return confirmNeeded('merge_customers', { primary_id: p.customer.id, duplicate_id: d.customer.id }, 'Харилцагч нэгтгэх', { Үлдэх: `${p.customer.name} (${p.customer.phone || '-'})`, 'Нэгтгээд устах': `${d.customer.name} (${d.customer.phone || '-'})` });
    const r = await mergeCustomers(db(), shopId, p.customer.id, d.customer.id, salesScope);
    if ('error' in r) return { error: r.error };
    return { success: true, message: `«${d.customer.name}»-г «${p.customer.name}» руу нэгтгэлээ.`, customerId: p.customer.id };
}

/* ---------------- Маркетинг ---------------- */

export async function logSpend(shopId: string, args: Args, confirm: boolean, userId: string) {
    const amount = Number(args.amount);
    if (!Number.isFinite(amount) || amount < 0) return { error: 'amount шаардлагатай' };
    const spentAt = /^\d{4}-\d{2}-\d{2}$/.test(String(args.spent_at || '')) ? String(args.spent_at) : ubDateStr();
    const channel = SPEND_CHANNELS[args.channel] ? String(args.channel) : 'other';
    if (!confirm) return confirmNeeded('log_marketing_spend', { spent_at: spentAt, amount, channel, note: args.note || null }, 'Маркетингийн зарцуулалт бүртгэх', { Огноо: spentAt, Суваг: SPEND_CHANNELS[channel], Дүн: formatMNT(amount), Тэмдэглэл: args.note || '-' });
    const { data, error } = await logMarketingSpend(db(), shopId, userId, { spentAt, amount, channel, note: args.note });
    if (error) return { error: isMissingMarketingTable(error) ? MARKETING_MIGRATION_HINT : error.message };
    return { success: true, message: `${SPEND_CHANNELS[channel]} сувагт ${formatMNT(amount)} зарцуулалт бүртгэлээ (${spentAt}).`, entryId: data.id };
}

export async function setBudget(shopId: string, args: Args, confirm: boolean) {
    const year = Number(args.year) || new Date().getFullYear();
    const months = (Array.isArray(args.months) ? args.months : [{ month: args.month, amount: args.amount }])
        .map((m: Args) => ({ month: Number(m.month), amount: Number(m.amount) }))
        .filter((m: { month: number; amount: number }) => m.month >= 1 && m.month <= 12 && Number.isFinite(m.amount) && m.amount >= 0);
    if (!months.length) return { error: 'month + amount (эсвэл months[]) шаардлагатай' };
    if (!confirm) return confirmNeeded('set_marketing_budget', { year, months }, `${year} оны маркетингийн төсөв`, Object.fromEntries(months.map((m: { month: number; amount: number }) => [`${m.month}-р сар`, formatMNT(m.amount)])));
    const { error } = await upsertMarketingBudget(db(), shopId, year, months);
    if (error) return { error: isMissingMarketingTable(error) ? MARKETING_MIGRATION_HINT : error.message };
    return { success: true, message: `${year} оны ${months.map((m: { month: number }) => m.month).join(', ')}-р сарын төсөв хадгалагдлаа.` };
}

export async function listSpend(shopId: string, args: Args) {
    const year = Number(args.year) || new Date().getFullYear();
    const { data, error } = await listMarketingSpend(db(), shopId, year, args.month ? Number(args.month) : undefined);
    if (error) return { error: isMissingMarketingTable(error) ? MARKETING_MIGRATION_HINT : error.message };
    const rows = data || [];
    const byChannel: Record<string, number> = {};
    for (const r of rows) byChannel[SPEND_CHANNELS[r.channel] || r.channel] = (byChannel[SPEND_CHANNELS[r.channel] || r.channel] || 0) + Number(r.amount);
    return { year, month: args.month || null, total: rows.reduce((s, r) => s + Number(r.amount), 0), byChannel, entries: rows };
}

export async function addIndicator(shopId: string, args: Args) {
    const name = String(args.name || '').trim().slice(0, 200);
    const value = String(args.value || '').trim().slice(0, 200);
    if (!name || !value) return { error: 'name ба value шаардлагатай' };
    const { data, error } = await addMarketIndicator(db(), shopId, { category: args.category, name, value, note: args.note, sourceUrl: args.source_url, recordedAt: args.recorded_at });
    if (error) return { error: isMissingMarketingTable(error) ? MARKETING_MIGRATION_HINT : error.message };
    return { success: true, message: `Зах зээлийн үзүүлэлт «${name}: ${value}» бүртгэлээ.`, indicatorId: data.id };
}
