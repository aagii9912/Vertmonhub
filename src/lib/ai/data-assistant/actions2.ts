/**
 * AI tool — wave 2–4: менежерийн тайлан, харилцагч, маркетинг, санхүү/худалдан авалт.
 * Бүгд service давхаргаар (lib/services/*, lib/reports, lib/dashboard/kpi-report-build).
 * Модулийн эрх (finance/procurement/reports/marketing-roi) executeDataTool дээр шалгагдана.
 */

import { supabaseAdmin as adminClient } from '@/lib/supabase';
import { resolveManagerIdentity } from '@/lib/sales/manager-identity';
import { computeKpiReport } from '@/lib/dashboard/kpi-report-build';
import { formatKpiReportText } from '@/lib/dashboard/kpi-report';
import { getManagerPerformance } from '@/lib/reports/manager-performance';
import { addCustomerTag, removeCustomerTag, setCustomerAiPause, replyToCustomer, mergeCustomers } from '@/lib/services/CustomerOps';
import { logMarketingSpend, upsertMarketingBudget, addMarketIndicator, listMarketingSpend, isMissingMarketingTable, MARKETING_MIGRATION_HINT } from '@/lib/services/MarketingOps';
import { listTransactions, financeSummary, addTransaction, listBills, payBill, type TxnMethod } from '@/lib/services/FinanceOps';
import { SPEND_CHANNELS } from '@/lib/marketing/budget';
import type { AssistantPerms } from './index';

type Args = Record<string, any>;
const db = () => adminClient();
const money = (n: number) => `${Math.round(n).toLocaleString()}₮`;
const confirmNeeded = (tool: string, args: Args, label: string, preview: Record<string, unknown>) => ({ requiresConfirmation: true, action: { tool, args }, label, preview });

/* ---------------- Менежер / тайлан ---------------- */

export async function getKpiReport(shopId: string, args: Args, userId: string, perms: AssistantPerms) {
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
    const report = await computeKpiReport(db(), { shopId, shopName: shop?.name || null, identity, targetName, uid: userId, year, month });
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
    let q = db().from('customers').select('id, name, phone, tags, facebook_id, ai_paused_until').eq('shop_id', shopId);
    if (a.customer_id) q = q.eq('id', a.customer_id);
    else if (a.phone) q = q.ilike('phone', `%${String(a.phone).replace(/\D/g, '').slice(-8)}%`);
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

export async function customerAiPause(shopId: string, args: Args) {
    const f = await findCustomer(shopId, args);
    if ('error' in f) return f;
    const resume = args.action === 'resume';
    const minutes = resume ? null : Math.max(5, Math.min(24 * 60, Number(args.minutes) || 60));
    const r = await setCustomerAiPause(db(), shopId, f.customer.id, minutes);
    if ('error' in r) return r;
    return { success: true, message: resume ? `«${f.customer.name}»-д AI хариулагч дахин идэвхжлээ.` : `«${f.customer.name}»-д AI-г ${minutes} минут зогсоолоо — та өөрөө хариулна.`, customerId: f.customer.id };
}

export async function replyCustomer(shopId: string, args: Args, confirm: boolean) {
    const f = await findCustomer(shopId, args);
    if ('error' in f) return f;
    const message = String(args.message || '').trim().slice(0, 2000);
    if (!message) return { error: 'message шаардлагатай' };
    if (!f.customer.facebook_id) return { error: `«${f.customer.name}» Facebook Messenger-тэй холбогдоогүй` };
    if (!confirm) return confirmNeeded('reply_to_customer', { customer_id: f.customer.id, message, ai_pause: args.ai_pause !== false }, `Messenger хариу: ${f.customer.name}`, { Харилцагч: f.customer.name, Мессеж: message, 'AI зогсоох': args.ai_pause === false ? 'Үгүй' : '30 мин' });
    const r = await replyToCustomer(db(), shopId, f.customer.id, message, args.ai_pause === false ? 'off' : 'pause');
    if ('error' in r) return { error: r.error };
    return { success: true, message: `«${f.customer.name}»-д Messenger-ээр хариу илгээлээ.`, customerId: f.customer.id };
}

export async function mergeCustomersTool(shopId: string, args: Args, confirm: boolean) {
    const p = await findCustomer(shopId, { customer_id: args.primary_id, customer_name: args.primary_name, phone: args.primary_phone });
    if ('error' in p) return { error: `Үндсэн харилцагч: ${p.error}`, options: p.options };
    const d = await findCustomer(shopId, { customer_id: args.duplicate_id, customer_name: args.duplicate_name, phone: args.duplicate_phone });
    if ('error' in d) return { error: `Давхардсан харилцагч: ${d.error}`, options: d.options };
    if (p.customer.id === d.customer.id) return { error: 'Хоёр ижил харилцагч' };
    if (!confirm) return confirmNeeded('merge_customers', { primary_id: p.customer.id, duplicate_id: d.customer.id }, 'Харилцагч нэгтгэх', { Үлдэх: `${p.customer.name} (${p.customer.phone || '-'})`, 'Нэгтгээд устах': `${d.customer.name} (${d.customer.phone || '-'})` });
    const r = await mergeCustomers(db(), shopId, p.customer.id, d.customer.id);
    if ('error' in r) return { error: r.error };
    return { success: true, message: `«${d.customer.name}»-г «${p.customer.name}» руу нэгтгэлээ.`, customerId: p.customer.id };
}

/* ---------------- Маркетинг ---------------- */

export async function logSpend(shopId: string, args: Args, confirm: boolean, userId: string) {
    const amount = Number(args.amount);
    if (!Number.isFinite(amount) || amount < 0) return { error: 'amount шаардлагатай' };
    const spentAt = /^\d{4}-\d{2}-\d{2}$/.test(String(args.spent_at || '')) ? String(args.spent_at) : new Date().toISOString().slice(0, 10);
    const channel = SPEND_CHANNELS[args.channel] ? String(args.channel) : 'other';
    if (!confirm) return confirmNeeded('log_marketing_spend', { spent_at: spentAt, amount, channel, note: args.note || null }, 'Маркетингийн зарцуулалт бүртгэх', { Огноо: spentAt, Суваг: SPEND_CHANNELS[channel], Дүн: money(amount), Тэмдэглэл: args.note || '-' });
    const { data, error } = await logMarketingSpend(db(), shopId, userId, { spentAt, amount, channel, note: args.note });
    if (error) return { error: isMissingMarketingTable(error) ? MARKETING_MIGRATION_HINT : error.message };
    return { success: true, message: `${SPEND_CHANNELS[channel]} сувагт ${money(amount)} зарцуулалт бүртгэлээ (${spentAt}).`, entryId: data.id };
}

export async function setBudget(shopId: string, args: Args, confirm: boolean) {
    const year = Number(args.year) || new Date().getFullYear();
    const months = (Array.isArray(args.months) ? args.months : [{ month: args.month, amount: args.amount }])
        .map((m: Args) => ({ month: Number(m.month), amount: Number(m.amount) }))
        .filter((m: { month: number; amount: number }) => m.month >= 1 && m.month <= 12 && Number.isFinite(m.amount) && m.amount >= 0);
    if (!months.length) return { error: 'month + amount (эсвэл months[]) шаардлагатай' };
    if (!confirm) return confirmNeeded('set_marketing_budget', { year, months }, `${year} оны маркетингийн төсөв`, Object.fromEntries(months.map((m: { month: number; amount: number }) => [`${m.month}-р сар`, money(m.amount)])));
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

/* ---------------- Санхүү / худалдан авалт ---------------- */

const METHODS: TxnMethod[] = ['cash', 'bank', 'barter', 'mortgage'];
const methodOf = (v: unknown): TxnMethod | null => (METHODS.includes(v as TxnMethod) ? (v as TxnMethod) : null);

export async function financeSummaryTool(shopId: string) {
    return financeSummary(db(), shopId);
}

export async function listTransactionsTool(shopId: string, args: Args) {
    const { data, error } = await listTransactions(db(), shopId, { type: args.type, limit: args.limit, from: args.from, to: args.to });
    if (error) return { error: error.message };
    const rows = data || [];
    return { count: rows.length, receipts: rows.filter((t) => t.type === 'receipt').reduce((s, t) => s + Number(t.amount), 0), disbursements: rows.filter((t) => t.type === 'disbursement').reduce((s, t) => s + Number(t.amount), 0), transactions: rows };
}

export async function addTransactionTool(shopId: string, args: Args, confirm: boolean) {
    const type: 'receipt' | 'disbursement' = args.type === 'disbursement' ? 'disbursement' : 'receipt';
    const amount = Number(args.amount);
    if (!Number.isFinite(amount) || amount <= 0) return { error: 'amount 0-ээс их байх ёстой' };
    const payload = { type, amount, txn_date: args.txn_date || null, method: methodOf(args.method), note: args.note || null, contract_id: args.contract_id || null, project_id: args.project_id || null };
    if (!confirm) return confirmNeeded('add_finance_transaction', payload, type === 'receipt' ? 'Кассын орлого бүртгэх' : 'Кассын зарлага бүртгэх', { Төрөл: type === 'receipt' ? 'Орлого' : 'Зарлага', Дүн: money(amount), Огноо: payload.txn_date || 'өнөөдөр', Хэлбэр: payload.method || '-', Тэмдэглэл: payload.note || '-' });
    const r = await addTransaction(db(), shopId, payload);
    if ('error' in r) return { error: r.error };
    return { success: true, message: `${type === 'receipt' ? 'Орлого' : 'Зарлага'} ${money(amount)} кассад бүртгэгдлээ.`, transactionId: r.transaction.id };
}

export async function listBillsTool(shopId: string, args: Args) {
    const { data, error } = await listBills(db(), shopId, args.status, args.limit || 30);
    if (error) return { error: error.message };
    const rows = (data || []).map((b: any) => ({ id: b.id, bill_number: b.bill_number, vendor: b.vendors?.name || null, project: b.projects?.name || null, bill_date: b.bill_date, due_date: b.due_date, total_amount: b.total_amount, paid_amount: b.paid_amount, status: b.status }));
    return { count: rows.length, outstanding: rows.reduce((s, b) => s + Math.max(0, Number(b.total_amount) - Number(b.paid_amount || 0)), 0), bills: rows };
}

export async function payBillTool(shopId: string, args: Args, confirm: boolean) {
    let q = db().from('vendor_bills').select('id, bill_number, total_amount, paid_amount, status, vendors(name)').eq('shop_id', shopId);
    if (args.bill_id) q = q.eq('id', args.bill_id);
    else if (args.bill_number) q = q.ilike('bill_number', `%${args.bill_number}%`);
    else return { error: 'bill_id эсвэл bill_number шаардлагатай' };
    const { data } = await q.limit(1);
    const bill: any = data?.[0];
    if (!bill) return { error: 'Нэхэмжлэх олдсонгүй' };
    const remaining = Number(bill.total_amount) - Number(bill.paid_amount || 0);
    const amount = args.amount != null ? Number(args.amount) : remaining;
    if (!Number.isFinite(amount) || amount <= 0) return { error: 'amount 0-ээс их байх ёстой' };
    const payload = { bill_id: bill.id, amount, method: methodOf(args.method), paid_date: args.paid_date || null };
    const vendorName = Array.isArray(bill.vendors) ? bill.vendors[0]?.name : bill.vendors?.name;
    if (!confirm) return confirmNeeded('pay_vendor_bill', payload, `Нэхэмжлэх төлөх: ${bill.bill_number || vendorName || ''}`, { Нийлүүлэгч: vendorName || '-', Нэхэмжлэх: bill.bill_number || '-', Нийт: money(Number(bill.total_amount)), Үлдэгдэл: money(remaining), Төлөх: money(amount), Хэлбэр: payload.method || '-' });
    const r = await payBill(db(), shopId, bill.id, payload);
    if ('error' in r) return { error: r.error };
    return { success: true, message: `Нэхэмжлэх ${bill.bill_number || ''} ${money(amount)} төлөгдлөө (${r.bill.status === 'paid' ? 'бүрэн төлөгдсөн' : 'хэсэгчлэн'}).`, billId: bill.id };
}
