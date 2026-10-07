import type { SupabaseClient } from '@supabase/supabase-js';
import { loadCustomerChat } from '@/lib/inbox/conversations';
import { normalizePhone, phoneIlikePattern } from '@/lib/utils/phone';

/**
 * Харилцагчийн картын лидээс гадуурх хэсгүүд — UI түвшинд л нэгтгэнэ (хүснэгт, merge дүрэм хэвээр).
 * Лид ба харилцагчийн найдвартай холбоос нь утас (`normalizePhone`): `leads.customer_id` ихэвчлэн хоосон,
 * ERP-ээс орсон гэрээнд `lead_id` байдаггүй. Хэсэг бүр зөвхөн тухайн модулийн эрхтэй үед уншигдана;
 * уналт `partial`-д нэрээрээ орно (хоосон жагсаалт мэт нуухгүй).
 */

export interface CustomerCardAccess {
    customers: boolean;
    inbox: boolean;
    contracts: boolean;
    serviceLogs: boolean;
}

export interface CardCustomer {
    id: string;
    name: string | null;
    phone: string | null;
    email: string | null;
    channel: 'messenger' | 'instagram' | null;
    message_count: number | null;
    last_contact_at: string | null;
    created_at: string | null;
    /** Ижил утастай өөр харилцагчийн бүртгэл (давхардал). */
    duplicates: number;
}

export interface CardMessage { from: 'customer' | 'staff' | 'bot'; text: string; at: string }

export interface CardMessages {
    customerId: string;
    channel: 'messenger' | 'instagram' | null;
    items: CardMessage[];
    /** Харилцагчийн сүүлийн мессеж — Meta-гийн 24 цагийн хариулах цонх үүнээс тоологдоно. */
    lastCustomerAt: string | null;
}

export interface CardContract {
    id: string;
    contract_number: string | null;
    contract_status: string | null;
    contract_date: string | null;
    total_price: number | null;
    paid_amount: number | null;
    balance: number | null;
    unit_number: string | null;
    block_name: string | null;
    sales_manager: string | null;
    /** Лидэд шууд холбогдсон эсвэл зөвхөн утсаар таарсан. */
    matched_by: 'lead' | 'phone';
}

export interface CardServiceLog {
    id: string;
    type: string | null;
    subject: string | null;
    status: string | null;
    priority: string | null;
    channel: string | null;
    manager_name: string | null;
    created_at: string;
    resolved_at: string | null;
}

export interface LeadCustomerCard {
    access: CustomerCardAccess;
    customer: CardCustomer | null;
    messages: CardMessages | null;
    contracts: CardContract[];
    serviceLogs: CardServiceLog[];
    partial: string[];
}

type CustomerRow = {
    id: string; name: string | null; phone: string | null; email: string | null; facebook_id: string | null;
    instagram_id: string | null; message_count: number | null; last_contact_at: string | null; created_at: string | null;
};

const CUSTOMER_FIELDS = 'id, name, phone, email, facebook_id, instagram_id, message_count, last_contact_at, created_at';
const CONTRACT_FIELDS = 'id, contract_number, contract_status, contract_date, total_price, paid_amount, balance, unit_number, block_name, sales_manager, customer_phone, customer_mobile';
const SERVICE_LOG_FIELDS = 'id, type, subject, status, priority, channel, manager_name, created_at, resolved_at, customer_phone';
const CARD_LIMIT = 20;

/** Лидийн холбоос (`customer_id`) эхэнд, дараа нь утсаар — сүүлд харилцсан нь эхэнд. */
async function findCustomers(db: SupabaseClient, shopId: string, customerId: string | null, phone: string | null): Promise<CustomerRow[]> {
    const rows = new Map<string, CustomerRow>();
    if (customerId) {
        const { data, error } = await db.from('customers').select(CUSTOMER_FIELDS)
            .eq('shop_id', shopId).eq('id', customerId).is('deleted_at', null).maybeSingle();
        if (error) throw error;
        if (data) rows.set(data.id, data as CustomerRow);
    }
    if (phone) {
        const { data, error } = await db.from('customers').select(CUSTOMER_FIELDS)
            .eq('shop_id', shopId).eq('phone_normalized', phone).is('deleted_at', null)
            .order('last_contact_at', { ascending: false, nullsFirst: false }).limit(5);
        if (error) throw error;
        for (const row of (data ?? []) as CustomerRow[]) if (!rows.has(row.id)) rows.set(row.id, row);
    }
    return [...rows.values()];
}

function channelOf(row: CustomerRow): CardCustomer['channel'] {
    return row.facebook_id ? 'messenger' : row.instagram_id ? 'instagram' : null;
}

async function loadMessages(db: SupabaseClient, shopId: string, customer: CustomerRow): Promise<CardMessages> {
    const items = await loadCustomerChat(db, shopId, customer.id, 30);
    const lastCustomerAt = items.filter((m) => m.from === 'customer').at(-1)?.at ?? null;
    return { customerId: customer.id, channel: channelOf(customer), items, lastCustomerAt };
}

async function loadContracts(db: SupabaseClient, shopId: string, leadId: string, phone: string | null): Promise<CardContract[]> {
    const pattern = phone ? phoneIlikePattern(phone, 8) : null;
    const [byLead, byPhone] = await Promise.all([
        db.from('property_contracts').select(CONTRACT_FIELDS)
            .eq('shop_id', shopId).eq('lead_id', leadId).is('deleted_at', null).limit(CARD_LIMIT),
        pattern
            ? db.from('property_contracts').select(CONTRACT_FIELDS)
                .eq('shop_id', shopId).is('deleted_at', null)
                .or(`customer_phone.ilike.${pattern},customer_mobile.ilike.${pattern}`).limit(CARD_LIMIT)
            : Promise.resolve({ data: [], error: null }),
    ]);
    if (byLead.error) throw byLead.error;
    if (byPhone.error) throw byPhone.error;
    const out = new Map<string, CardContract>();
    type Row = Omit<CardContract, 'matched_by'> & { customer_phone: string | null; customer_mobile: string | null };
    const strip = ({ customer_phone: _p, customer_mobile: _m, ...row }: Row, matched_by: CardContract['matched_by']): CardContract => ({ ...row, matched_by });
    for (const row of (byLead.data ?? []) as Row[]) out.set(row.id, strip(row, 'lead'));
    for (const row of (byPhone.data ?? []) as Row[]) {
        if (out.has(row.id)) continue;
        // `ilike` нь зөвхөн нэр дэвшигч — бүтэн нормчилсон дугаараар баталгаажуулна.
        if (normalizePhone(row.customer_phone) === phone || normalizePhone(row.customer_mobile) === phone) out.set(row.id, strip(row, 'phone'));
    }
    return [...out.values()].sort((a, b) => (b.contract_date ?? '').localeCompare(a.contract_date ?? ''));
}

async function loadServiceLogs(db: SupabaseClient, shopId: string, customerIds: string[], phone: string | null): Promise<CardServiceLog[]> {
    const pattern = phone ? phoneIlikePattern(phone, 8) : null;
    const [byCustomer, byPhone] = await Promise.all([
        customerIds.length
            ? db.from('service_logs').select(SERVICE_LOG_FIELDS).eq('shop_id', shopId).in('customer_id', customerIds)
                .order('created_at', { ascending: false }).limit(CARD_LIMIT)
            : Promise.resolve({ data: [], error: null }),
        pattern
            ? db.from('service_logs').select(SERVICE_LOG_FIELDS).eq('shop_id', shopId).ilike('customer_phone', pattern)
                .order('created_at', { ascending: false }).limit(CARD_LIMIT)
            : Promise.resolve({ data: [], error: null }),
    ]);
    if (byCustomer.error) throw byCustomer.error;
    if (byPhone.error) throw byPhone.error;
    type Row = CardServiceLog & { customer_phone: string | null };
    const out = new Map<string, CardServiceLog>();
    const strip = ({ customer_phone: _p, ...row }: Row): CardServiceLog => row;
    for (const row of (byCustomer.data ?? []) as Row[]) out.set(row.id, strip(row));
    for (const row of (byPhone.data ?? []) as Row[]) {
        if (!out.has(row.id) && normalizePhone(row.customer_phone) === phone) out.set(row.id, strip(row));
    }
    return [...out.values()].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, CARD_LIMIT);
}

export async function loadLeadCustomerCard(
    db: SupabaseClient,
    shopId: string,
    lead: { id: string; customer_id?: string | null; customer_phone?: string | null },
    access: CustomerCardAccess,
): Promise<LeadCustomerCard> {
    const partial: string[] = [];
    const normalized = normalizePhone(lead.customer_phone);
    // 8-аас цөөн оронтой дугаар өөр хүнтэй андуурагдана — утсаар холбохгүй.
    const phone = normalized && normalized.length >= 8 ? normalized : null;

    let customers: CustomerRow[] = [];
    if (access.customers || access.inbox || access.serviceLogs) {
        try {
            customers = await findCustomers(db, shopId, lead.customer_id ?? null, phone);
        } catch {
            partial.push('customer');
        }
    }
    const primary = customers[0] ?? null;

    const [messages, contracts, serviceLogs] = await Promise.all([
        access.inbox && primary
            ? loadMessages(db, shopId, primary).catch(() => { partial.push('messages'); return null; })
            : Promise.resolve(null),
        access.contracts
            ? loadContracts(db, shopId, lead.id, phone).catch(() => { partial.push('contracts'); return [] as CardContract[]; })
            : Promise.resolve([] as CardContract[]),
        access.serviceLogs
            ? loadServiceLogs(db, shopId, customers.map((c) => c.id), phone).catch(() => { partial.push('serviceLogs'); return [] as CardServiceLog[]; })
            : Promise.resolve([] as CardServiceLog[]),
    ]);

    return {
        access,
        customer: access.customers && primary ? {
            id: primary.id,
            name: primary.name,
            phone: primary.phone,
            email: primary.email,
            channel: channelOf(primary),
            message_count: primary.message_count,
            last_contact_at: primary.last_contact_at,
            created_at: primary.created_at,
            duplicates: customers.length - 1,
        } : null,
        messages,
        contracts,
        serviceLogs,
        partial,
    };
}
