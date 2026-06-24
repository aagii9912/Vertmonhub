/**
 * Data Assistant Functions — Read, Write, and Chart generation
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { logger } from '@/lib/utils/logger';

// Lazy admin client — built on first property access so missing env at
// module-evaluation time (e.g. Next.js page-data collection) does not
// crash before any handler actually runs.
let _adminClient: SupabaseClient | null = null;
function getAdminClient(): SupabaseClient {
    if (_adminClient) return _adminClient;
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
    if (!url || !serviceKey) {
        throw new Error('Supabase admin env vars are not configured');
    }
    _adminClient = createClient<any>(url, serviceKey);
    return _adminClient;
}

const supabaseAdmin: SupabaseClient = new Proxy({} as SupabaseClient, {
    get(_target, prop) {
        const client = getAdminClient();
        const value = Reflect.get(client, prop, client);
        return typeof value === 'function' ? value.bind(client) : value;
    },
}) as SupabaseClient;

// ============================================
// HELPERS
// ============================================

function getDateFilter(timeRange: string): string {
    const now = new Date();
    switch (timeRange) {
        case 'today': now.setHours(0, 0, 0, 0); return now.toISOString();
        case 'week': now.setDate(now.getDate() - 7); return now.toISOString();
        case 'month': now.setMonth(now.getMonth() - 1); return now.toISOString();
        case 'year': now.setFullYear(now.getFullYear() - 1); return now.toISOString();
        default: return new Date(2000, 0, 1).toISOString();
    }
}

// ============================================
// READ FUNCTIONS
// ============================================

export async function fetchDashboardStats(shopId: string, timeRange: string = 'month') {
    const isoDate = getDateFilter(timeRange);
    const [ordersRes, revenueRes, customersRes, leadsRes, propertiesRes] = await Promise.all([
        supabaseAdmin.from('orders').select('*', { count: 'exact' }).eq('shop_id', shopId).gte('created_at', isoDate),
        supabaseAdmin.from('orders').select('total_amount').eq('shop_id', shopId).gte('created_at', isoDate),
        supabaseAdmin.from('customers').select('*', { count: 'exact' }).eq('shop_id', shopId),
        supabaseAdmin.from('leads').select('*', { count: 'exact' }).eq('shop_id', shopId).gte('created_at', isoDate),
        supabaseAdmin.from('properties').select('*', { count: 'exact' }).eq('shop_id', shopId).eq('is_active', true),
    ]);

    const totalRevenue = revenueRes.data?.reduce((sum, o) => sum + (Number(o.total_amount) || 0), 0) || 0;
    const leadsAll = leadsRes.data || [];
    const leadsByStatus = {
        new: leadsAll.filter(l => l.status === 'new').length,
        contacted: leadsAll.filter(l => l.status === 'contacted').length,
        viewing_scheduled: leadsAll.filter(l => l.status === 'viewing_scheduled').length,
        offered: leadsAll.filter(l => l.status === 'offered').length,
        negotiating: leadsAll.filter(l => l.status === 'negotiating').length,
        closed_won: leadsAll.filter(l => l.status === 'closed_won').length,
        closed_lost: leadsAll.filter(l => l.status === 'closed_lost').length,
    };

    return { timeRange, totalOrders: ordersRes.count || 0, totalRevenue, totalCustomers: customersRes.count || 0, totalLeads: leadsRes.count || 0, leadsByStatus, totalProperties: propertiesRes.count || 0 };
}

export async function fetchOrders(shopId: string, status?: string, limit: number = 10) {
    let query = supabaseAdmin.from('orders').select('id, total_amount, status, created_at, customers(name, phone)').eq('shop_id', shopId).order('created_at', { ascending: false }).limit(limit);
    if (status) query = query.eq('status', status);
    const { data } = await query;
    return data?.map(o => ({
        id: o.id.substring(0, 8), amount: o.total_amount, status: o.status,
        date: new Date(o.created_at).toLocaleDateString('mn-MN'),
        customerName: (o.customers as any)?.name || 'Тодорхойгүй',
        customerPhone: (o.customers as any)?.phone || '',
    })) || [];
}

export async function fetchProductStats(shopId: string, type: string = 'all', limit: number = 10) {
    if (type === 'low_stock') {
        const { data } = await supabaseAdmin.from('products').select('id, name, stock, price').eq('shop_id', shopId).lt('stock', 10).order('stock', { ascending: true }).limit(limit);
        return data || [];
    } else if (type === 'top_selling') {
        const { data } = await supabaseAdmin.from('products').select('id, name, stock, price').eq('shop_id', shopId).order('stock', { ascending: true }).limit(limit);
        return data || [];
    } else {
        const { data } = await supabaseAdmin.from('products').select('id, name, stock, price, description, type').eq('shop_id', shopId).limit(limit);
        return data || [];
    }
}

export async function fetchProperties(shopId: string, args: any) {
    const limit = args.limit || 10;
    let query = supabaseAdmin.from('properties')
        .select('id, name, type, price, price_per_sqm, size_sqm, rooms, bedrooms, bathrooms, floor, district, city, status, is_featured, features, amenities, views_count, inquiries_count, created_at')
        .eq('shop_id', shopId).eq('is_active', true).order('created_at', { ascending: false }).limit(limit);

    if (args.status) query = query.eq('status', args.status);
    if (args.type) query = query.eq('type', args.type);
    if (args.min_price) query = query.gte('price', args.min_price);
    if (args.max_price) query = query.lte('price', args.max_price);
    if (args.rooms) query = query.eq('rooms', args.rooms);
    if (args.district) query = query.ilike('district', `%${args.district}%`);
    if (args.name_search) query = query.ilike('name', `%${args.name_search}%`);

    const { data, error } = await query;
    if (error) { logger.error('Property fetch error:', { error }); return []; }

    return data?.map(p => ({
        id: p.id, name: p.name, type: p.type, price: p.price,
        priceFormatted: `${Number(p.price).toLocaleString()}₮`,
        size_sqm: p.size_sqm, rooms: p.rooms, bedrooms: p.bedrooms, bathrooms: p.bathrooms,
        floor: p.floor, district: p.district, city: p.city, status: p.status,
        is_featured: p.is_featured, views_count: p.views_count, inquiries_count: p.inquiries_count,
    })) || [];
}

export async function fetchLeads(shopId: string, args: any) {
    const limit = args.limit || 10;
    let query = supabaseAdmin.from('leads')
        .select('id, customer_name, customer_phone, customer_email, status, source, budget_min, budget_max, preferred_type, preferred_district, preferred_rooms, urgency, notes, internal_notes, last_contact_at, next_followup_at, viewing_scheduled_at, created_at, updated_at')
        .eq('shop_id', shopId).is('deleted_at', null).order('created_at', { ascending: false }).limit(limit);

    if (args.status) query = query.eq('status', args.status);
    if (args.source) query = query.eq('source', args.source);
    if (args.urgency) query = query.eq('urgency', args.urgency);

    const { data, error } = await query;
    if (error) { logger.error('Lead fetch error:', { error }); return []; }

    return data?.map(l => ({
        id: l.id, name: l.customer_name || 'Тодорхойгүй', phone: l.customer_phone, email: l.customer_email,
        status: l.status, source: l.source,
        budget: l.budget_min && l.budget_max ? `${Number(l.budget_min).toLocaleString()}₮ - ${Number(l.budget_max).toLocaleString()}₮` : l.budget_min ? `${Number(l.budget_min).toLocaleString()}₮+` : 'Тодорхойгүй',
        preferred_type: l.preferred_type, preferred_district: l.preferred_district, preferred_rooms: l.preferred_rooms,
        urgency: l.urgency, notes: l.notes,
        last_contact: l.last_contact_at ? new Date(l.last_contact_at).toLocaleDateString('mn-MN') : null,
        next_followup: l.next_followup_at ? new Date(l.next_followup_at).toLocaleDateString('mn-MN') : null,
        viewing: l.viewing_scheduled_at ? new Date(l.viewing_scheduled_at).toLocaleDateString('mn-MN') : null,
        created: new Date(l.created_at).toLocaleDateString('mn-MN'),
    })) || [];
}

export async function fetchLeadDetails(shopId: string, args: any) {
    let query = supabaseAdmin.from('leads').select('*, properties(id, name, price, type, size_sqm, rooms, district, status)').eq('shop_id', shopId);
    if (args.lead_id) query = query.eq('id', args.lead_id);
    else if (args.customer_name) query = query.ilike('customer_name', `%${args.customer_name}%`);
    else return { error: 'lead_id эсвэл customer_name шаардлагатай' };

    const { data, error } = await query.single();
    if (error || !data) return { error: 'Лийд олдсонгүй' };

    let matchingProperties: any[] = [];
    if (data.preferred_type || data.budget_min || data.budget_max) {
        let propQuery = supabaseAdmin.from('properties').select('id, name, price, type, size_sqm, rooms, district, status')
            .eq('shop_id', shopId).eq('is_active', true).eq('status', 'available').limit(5);
        if (data.preferred_type) propQuery = propQuery.eq('type', data.preferred_type);
        if (data.budget_min) propQuery = propQuery.gte('price', data.budget_min);
        if (data.budget_max) propQuery = propQuery.lte('price', data.budget_max);
        if (data.preferred_rooms) propQuery = propQuery.eq('rooms', data.preferred_rooms);
        const { data: props } = await propQuery;
        matchingProperties = props || [];
    }

    const { data: viewings } = await supabaseAdmin.from('property_viewings')
        .select('id, scheduled_at, status, property_id, customer_feedback, agent_notes')
        .eq('lead_id', data.id).order('scheduled_at', { ascending: false }).limit(5);

    return {
        lead: {
            id: data.id, name: data.customer_name, phone: data.customer_phone, email: data.customer_email,
            status: data.status, source: data.source, budget_min: data.budget_min, budget_max: data.budget_max,
            preferred_type: data.preferred_type, preferred_district: data.preferred_district,
            preferred_rooms: data.preferred_rooms, urgency: data.urgency, notes: data.notes,
            internal_notes: data.internal_notes, created_at: data.created_at,
            last_contact_at: data.last_contact_at, next_followup_at: data.next_followup_at,
        },
        linkedProperty: data.properties || null,
        matchingProperties,
        viewings: viewings || [],
    };
}

export async function fetchCustomerInsights(shopId: string, args: any) {
    const limit = args.limit || 10;
    const customerSelect = 'id, name, phone, email, address, tags, notes, message_count, last_contact_at, created_at, facebook_id, instagram_id';

    // ---- Single-customer details ----
    if (args.customer_id) {
        const { data: customer } = await supabaseAdmin.from('customers')
            .select(customerSelect)
            .eq('id', args.customer_id).single();
        if (!customer) return { error: 'Харилцагч олдсонгүй' };

        const { data: leads } = await supabaseAdmin.from('leads')
            .select('id, status, source, preferred_type, preferred_district, preferred_rooms, budget_min, budget_max, urgency, created_at, last_contact_at')
            .eq('customer_id', args.customer_id).eq('shop_id', shopId)
            .order('created_at', { ascending: false });

        // Contracts are denormalized — join by phone (no FK).
        const { data: contracts } = customer.phone ? await supabaseAdmin.from('property_contracts')
            .select('id, contract_number, contract_status, unit_label, block_name, total_price, paid_amount, balance, paid_percent, overdue_days, sales_manager, sales_channel, contract_date')
            .eq('shop_id', shopId).eq('customer_phone', customer.phone)
            .order('contract_date', { ascending: false }) : { data: [] };

        return { customer, leads: leads || [], contracts: contracts || [] };
    }

    // ---- Customer list ----
    const { data } = await runExcludingDeleted((excludeDeleted) => {
        let query = supabaseAdmin.from('customers')
            .select(customerSelect)
            .eq('shop_id', shopId)
            .order('created_at', { ascending: false }).limit(limit);
        if (excludeDeleted) query = query.is('deleted_at', null);
        if (args.customer_name) query = query.ilike('name', `%${args.customer_name}%`);
        if (args.phone) query = query.ilike('phone', `%${args.phone}%`);
        if (args.tag) query = query.contains('tags', [args.tag]);
        return query;
    });
    return { customers: data || [] };
}

// ============================================
// PROPERTY CONTRACTS
// ============================================

const CONTRACT_LIST_FIELDS = 'id, contract_number, contract_status, unit_label, block_name, floor, model, customer_name, customer_phone, total_price, paid_amount, balance, paid_percent, overdue_days, sales_manager, sales_channel, contract_date';
const CONTRACT_DETAIL_FIELDS = `${CONTRACT_LIST_FIELDS}, customer_first_name, customer_last_name, customer_registration, customer_mobile, product_type, unit_number, unit_type, rooms, contracted_area, price_per_sqm, first_price, payment_condition, prepayment_condition, prepayment_percent, prepayment_due, prepayment_paid, prepayment_paid_cash, prepayment_paid_barter, balance_payment_method, bank_status, barter_status, barter_type, order_date, commissioning_date, hubspot_contact_id, created_at, updated_at`;

export async function fetchContracts(shopId: string, args: any) {
    const limit = Math.min(Math.max(Number(args.limit) || 20, 1), 100);
    const { data, error } = await runExcludingDeleted((excludeDeleted) => {
        let query = supabaseAdmin.from('property_contracts')
            .select(CONTRACT_LIST_FIELDS)
            .eq('shop_id', shopId)
            .order('contract_date', { ascending: false, nullsFirst: false })
            .limit(limit);
        if (excludeDeleted) query = query.is('deleted_at', null);
        if (args.status) query = query.eq('contract_status', args.status);
        if (args.customer_search) query = query.or(`customer_name.ilike.%${args.customer_search}%,customer_phone.ilike.%${args.customer_search}%,customer_registration.ilike.%${args.customer_search}%`);
        if (args.sales_manager) query = query.ilike('sales_manager', `%${args.sales_manager}%`);
        if (args.sales_channel) query = query.eq('sales_channel', args.sales_channel);
        if (args.block_name) query = query.ilike('block_name', `%${args.block_name}%`);
        if (args.contract_number) query = query.ilike('contract_number', `%${args.contract_number}%`);
        if (args.overdue_only) query = query.gt('overdue_days', 0);
        if (args.has_balance) query = query.gt('balance', 0);
        return query;
    });
    if (error) return { error: `Алдаа: ${error.message}` };

    return {
        contracts: (data || []).map((c: any) => ({
            ...c,
            total_price_fmt: c.total_price != null ? `${Number(c.total_price).toLocaleString()}₮` : '-',
            paid_amount_fmt: c.paid_amount != null ? `${Number(c.paid_amount).toLocaleString()}₮` : '-',
            balance_fmt: c.balance != null ? `${Number(c.balance).toLocaleString()}₮` : '-',
        })),
        count: data?.length || 0,
    };
}

export async function fetchContractDetails(shopId: string, args: any) {
    let query = supabaseAdmin.from('property_contracts')
        .select(CONTRACT_DETAIL_FIELDS)
        .eq('shop_id', shopId)
        .limit(1);

    if (args.contract_id) query = query.eq('id', args.contract_id);
    else if (args.contract_number) query = query.eq('contract_number', args.contract_number);
    else if (args.customer_phone) query = query.eq('customer_phone', args.customer_phone);
    else return { error: 'contract_id, contract_number эсвэл customer_phone шаардлагатай' };

    const { data, error } = await query.maybeSingle();
    if (error) return { error: `Алдаа: ${error.message}` };
    if (!data) return { error: 'Гэрээ олдсонгүй' };

    return {
        contract: {
            ...data,
            total_price_fmt: data.total_price != null ? `${Number(data.total_price).toLocaleString()}₮` : '-',
            paid_amount_fmt: data.paid_amount != null ? `${Number(data.paid_amount).toLocaleString()}₮` : '-',
            balance_fmt: data.balance != null ? `${Number(data.balance).toLocaleString()}₮` : '-',
            first_price_fmt: data.first_price != null ? `${Number(data.first_price).toLocaleString()}₮` : '-',
            prepayment_due_fmt: data.prepayment_due != null ? `${Number(data.prepayment_due).toLocaleString()}₮` : '-',
            prepayment_paid_fmt: data.prepayment_paid != null ? `${Number(data.prepayment_paid).toLocaleString()}₮` : '-',
        },
    };
}

export async function fetchContractsSummary(shopId: string, args: any) {
    let query = supabaseAdmin.from('property_contracts')
        .select('contract_status, total_price, paid_amount, balance, overdue_days, sales_manager, sales_channel, block_name, product_type')
        .eq('shop_id', shopId);

    if (args.block_name) query = query.ilike('block_name', `%${args.block_name}%`);
    if (args.sales_channel) query = query.eq('sales_channel', args.sales_channel);

    const { data, error } = await query;
    if (error) return { error: `Алдаа: ${error.message}` };
    if (!data || data.length === 0) return { error: 'Гэрээ олдсонгүй' };

    const totals = data.reduce((acc, c) => {
        acc.total_price += Number(c.total_price) || 0;
        acc.paid_amount += Number(c.paid_amount) || 0;
        acc.balance += Number(c.balance) || 0;
        if ((Number(c.overdue_days) || 0) > 0) acc.overdue_count++;
        if (c.contract_status === 'active') acc.active++;
        if (c.contract_status === 'closed') acc.closed++;
        return acc;
    }, { total_price: 0, paid_amount: 0, balance: 0, overdue_count: 0, active: 0, closed: 0 });

    const byManager: Record<string, { count: number; total: number; balance: number }> = {};
    const byChannel: Record<string, number> = {};
    const byBlock: Record<string, number> = {};
    for (const c of data) {
        if (c.sales_manager) {
            if (!byManager[c.sales_manager]) byManager[c.sales_manager] = { count: 0, total: 0, balance: 0 };
            byManager[c.sales_manager].count++;
            byManager[c.sales_manager].total += Number(c.total_price) || 0;
            byManager[c.sales_manager].balance += Number(c.balance) || 0;
        }
        if (c.sales_channel) byChannel[c.sales_channel] = (byChannel[c.sales_channel] || 0) + 1;
        if (c.block_name) byBlock[c.block_name] = (byBlock[c.block_name] || 0) + 1;
    }

    return {
        count: data.length,
        active: totals.active,
        closed: totals.closed,
        overdue_count: totals.overdue_count,
        total_contract_value: `${Math.round(totals.total_price).toLocaleString()}₮`,
        total_collected: `${Math.round(totals.paid_amount).toLocaleString()}₮`,
        total_outstanding: `${Math.round(totals.balance).toLocaleString()}₮`,
        collection_rate_pct: totals.total_price > 0 ? Math.round((totals.paid_amount / totals.total_price) * 1000) / 10 : 0,
        topManagers: Object.entries(byManager)
            .sort((a, b) => b[1].total - a[1].total)
            .slice(0, 5)
            .map(([name, v]) => ({ name, contracts: v.count, total: `${Math.round(v.total).toLocaleString()}₮`, balance: `${Math.round(v.balance).toLocaleString()}₮` })),
        byChannel,
        byBlock,
    };
}

// ============================================
// INSIGHT FUNCTIONS (AI Sales Insights)
// ============================================

export async function fetchSalesSummary(shopId: string, args: any) {
    const period = args.period || 'month';
    const dateFrom = getDateFilter(period);

    // All properties
    let propQuery = supabaseAdmin.from('properties')
        .select('id, name, type, price, status, size_sqm, rooms, district, created_at, updated_at')
        .eq('shop_id', shopId).eq('is_active', true);
    if (args.project_name) propQuery = propQuery.ilike('name', `%${args.project_name}%`);

    const { data: properties } = await propQuery;
    if (!properties || properties.length === 0) return { error: 'Байр олдсонгүй' };

    // Status breakdown
    const byStatus: Record<string, number> = {};
    const byType: Record<string, number> = {};
    let totalRevenue = 0;
    let soldCount = 0;

    properties.forEach(p => {
        byStatus[p.status] = (byStatus[p.status] || 0) + 1;
        byType[p.type] = (byType[p.type] || 0) + 1;
        if (p.status === 'sold' || p.status === 'reserved') {
            totalRevenue += Number(p.price) || 0;
            if (p.status === 'sold') soldCount++;
        }
    });

    const avgPrice = properties.reduce((s, p) => s + Number(p.price), 0) / properties.length;
    const availableCount = properties.filter(p => p.status === 'available').length;

    return {
        period,
        totalProperties: properties.length,
        byStatus,
        byType,
        soldCount,
        availableCount,
        barterCount: properties.filter(p => p.status === 'barter').length,
        reservedCount: properties.filter(p => p.status === 'reserved').length,
        totalRevenue: `${totalRevenue.toLocaleString()}₮`,
        avgPrice: `${Math.round(avgPrice).toLocaleString()}₮`,
        topDistricts: Object.entries(
            properties.reduce((acc: Record<string, number>, p) => {
                if (p.district) acc[p.district] = (acc[p.district] || 0) + 1;
                return acc;
            }, {})
        ).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([d, c]) => `${d}: ${c}`),
    };
}

export async function fetchSalesForecast(shopId: string, args: any) {
    let propQuery = supabaseAdmin.from('properties')
        .select('id, name, status, price, created_at, updated_at')
        .eq('shop_id', shopId).eq('is_active', true);
    if (args.project_name) propQuery = propQuery.ilike('name', `%${args.project_name}%`);

    const { data: properties } = await propQuery;
    if (!properties || properties.length === 0) return { error: 'Байр олдсонгүй' };

    const total = properties.length;
    const sold = properties.filter(p => p.status === 'sold').length;
    const reserved = properties.filter(p => p.status === 'reserved').length;
    const available = properties.filter(p => p.status === 'available').length;
    const barter = properties.filter(p => p.status === 'barter').length;

    // Simple linear trend: sold per month
    const oldestDate = new Date(Math.min(...properties.map(p => new Date(p.created_at).getTime())));
    const monthsActive = Math.max(1, (Date.now() - oldestDate.getTime()) / (30 * 24 * 60 * 60 * 1000));
    const soldPerMonth = sold / monthsActive;
    const monthsToSellOut = available > 0 && soldPerMonth > 0 ? Math.ceil(available / soldPerMonth) : null;

    return {
        total,
        sold,
        reserved,
        available,
        barter,
        soldPercentage: `${Math.round((sold / total) * 100)}%`,
        soldPerMonth: soldPerMonth.toFixed(1),
        monthsToSellOut,
        forecast: monthsToSellOut
            ? `Одоогийн хурдаар ${monthsToSellOut} сарын дараа бүгд зарагдана`
            : 'Хангалттай өгөгдөл байхгүй',
        recommendation: available > sold
            ? 'Борлуулалтыг идэвхжүүлэх хэрэгтэй — маркетинг кампанит ажил эхлүүлэх'
            : 'Борлуулалт сайн байна — шинэ төсөл бэлтгэх цаг боллоо',
    };
}

export async function compareProperties(shopId: string, args: any) {
    let ids: string[] = [];
    let names: string[] = [];

    if (args.property_ids) ids = args.property_ids.split(',').map((s: string) => s.trim());
    if (args.property_names) names = args.property_names.split(',').map((s: string) => s.trim());

    let query = supabaseAdmin.from('properties')
        .select('id, name, type, price, price_per_sqm, size_sqm, rooms, bedrooms, bathrooms, floor, district, status, features, amenities, views_count')
        .eq('shop_id', shopId).eq('is_active', true);

    if (ids.length > 0) {
        query = query.in('id', ids);
    } else if (names.length > 0) {
        // Use OR filter for multiple names
        const nameFilters = names.map(n => `name.ilike.%${n}%`).join(',');
        query = query.or(nameFilters);
    } else {
        return { error: 'property_names эсвэл property_ids шаардлагатай' };
    }

    const { data, error } = await query;
    if (error || !data || data.length === 0) return { error: 'Байр олдсонгүй' };

    const comparison = data.map(p => ({
        name: p.name,
        type: p.type,
        price: `${Number(p.price).toLocaleString()}₮`,
        pricePerSqm: p.price_per_sqm ? `${Number(p.price_per_sqm).toLocaleString()}₮/м²` : '-',
        size: p.size_sqm ? `${p.size_sqm}м²` : '-',
        rooms: p.rooms || '-',
        bedrooms: p.bedrooms || '-',
        bathrooms: p.bathrooms || '-',
        floor: p.floor || '-',
        district: p.district || '-',
        status: p.status,
        views: p.views_count || 0,
    }));

    // Find best value
    const withPricePerSqm = data.filter(p => p.price_per_sqm);
    const bestValue = withPricePerSqm.length > 0
        ? withPricePerSqm.reduce((min, p) => Number(p.price_per_sqm) < Number(min.price_per_sqm) ? p : min)
        : null;

    return {
        properties: comparison,
        bestValue: bestValue ? `${bestValue.name} — хамгийн бага м²-ийн үнэтэй` : null,
        count: comparison.length,
    };
}

// ============================================
// WRITE FUNCTIONS (Super Admin Only)
// ============================================

export async function updatePropertyStatus(shopId: string, args: any) {
    let query = supabaseAdmin.from('properties').select('id, name, status').eq('shop_id', shopId);
    if (args.property_id) query = query.eq('id', args.property_id);
    else if (args.property_name) query = query.ilike('name', `%${args.property_name}%`);
    else return { error: 'property_id эсвэл property_name шаардлагатай' };

    const { data: properties } = await query;
    if (!properties || properties.length === 0) return { error: 'Байр олдсонгүй' };
    if (properties.length > 1) return { error: `${properties.length} байр олдлоо, ID-г тодруулна уу`, options: properties.map(p => ({ id: p.id, name: p.name, status: p.status })) };

    const prop = properties[0];
    const oldStatus = prop.status;
    const { error } = await supabaseAdmin.from('properties').update({ status: args.new_status }).eq('id', prop.id);
    if (error) return { error: `Алдаа: ${error.message}` };
    return { success: true, property: prop.name, oldStatus, newStatus: args.new_status };
}

export async function updatePropertyPrice(shopId: string, args: any) {
    let query = supabaseAdmin.from('properties').select('id, name, price').eq('shop_id', shopId);
    if (args.property_id) query = query.eq('id', args.property_id);
    else if (args.property_name) query = query.ilike('name', `%${args.property_name}%`);
    else return { error: 'property_id эсвэл property_name шаардлагатай' };

    const { data: properties } = await query;
    if (!properties || properties.length === 0) return { error: 'Байр олдсонгүй' };
    if (properties.length > 1) return { error: `${properties.length} байр олдлоо, ID-г тодруулна уу`, options: properties.map(p => ({ id: p.id, name: p.name, price: p.price })) };

    const prop = properties[0];
    const oldPrice = prop.price;
    const { error } = await supabaseAdmin.from('properties').update({ price: args.new_price }).eq('id', prop.id);
    if (error) return { error: `Алдаа: ${error.message}` };
    return { success: true, property: prop.name, oldPrice: `${Number(oldPrice).toLocaleString()}₮`, newPrice: `${Number(args.new_price).toLocaleString()}₮` };
}

export async function updateLeadStatus(shopId: string, args: any) {
    let query = supabaseAdmin.from('leads').select('id, customer_name, status').eq('shop_id', shopId);
    if (args.lead_id) query = query.eq('id', args.lead_id);
    else if (args.customer_name) query = query.ilike('customer_name', `%${args.customer_name}%`);
    else return { error: 'lead_id эсвэл customer_name шаардлагатай' };

    const { data: leads } = await query;
    if (!leads || leads.length === 0) return { error: 'Лийд олдсонгүй' };
    if (leads.length > 1) return { error: `${leads.length} лийд олдлоо, тодруулна уу`, options: leads.map(l => ({ id: l.id, name: l.customer_name, status: l.status })) };

    const lead = leads[0];
    const oldStatus = lead.status;
    const { error } = await supabaseAdmin.from('leads').update({ status: args.new_status, updated_at: new Date().toISOString() }).eq('id', lead.id);
    if (error) return { error: `Алдаа: ${error.message}` };
    return { success: true, lead: lead.customer_name, oldStatus, newStatus: args.new_status };
}

export async function addLeadNote(shopId: string, args: any) {
    let query = supabaseAdmin.from('leads').select('id, customer_name, notes').eq('shop_id', shopId);
    if (args.lead_id) query = query.eq('id', args.lead_id);
    else if (args.customer_name) query = query.ilike('customer_name', `%${args.customer_name}%`);
    else return { error: 'lead_id эсвэл customer_name шаардлагатай' };

    const { data: leads } = await query;
    if (!leads || leads.length === 0) return { error: 'Лийд олдсонгүй' };

    const lead = leads[0];
    const timestamp = new Date().toLocaleString('mn-MN');
    const existingNotes = lead.notes || '';
    const updatedNotes = existingNotes ? `${existingNotes}\n[${timestamp}] ${args.note}` : `[${timestamp}] ${args.note}`;

    const { error } = await supabaseAdmin.from('leads').update({ notes: updatedNotes, updated_at: new Date().toISOString() }).eq('id', lead.id);
    if (error) return { error: `Алдаа: ${error.message}` };
    return { success: true, lead: lead.customer_name, note: args.note };
}

export async function processContractAction(shopId: string, args: any) {
    const statusMap: Record<string, { property: string; lead: string }> = {
        sign: { property: 'reserved', lead: 'negotiating' },
        paid: { property: 'sold', lead: 'closed_won' },
        cancel: { property: 'available', lead: 'closed_lost' },
    };

    const mapping = statusMap[args.action];
    if (!mapping) return { error: 'action буруу: sign, paid, cancel байх ёстой' };

    const results: any = { action: args.action, changes: [] };

    if (args.property_id || args.property_name) {
        const propResult = await updatePropertyStatus(shopId, { property_id: args.property_id, property_name: args.property_name, new_status: mapping.property });
        results.property = propResult;
        results.changes.push(`Байр → ${mapping.property}`);
    }

    if (args.lead_id || args.customer_name) {
        const leadResult = await updateLeadStatus(shopId, { lead_id: args.lead_id, customer_name: args.customer_name, new_status: mapping.lead });
        results.lead = leadResult;
        results.changes.push(`Лийд → ${mapping.lead}`);
    }

    return results;
}

// ============================================
// MUTATING FUNCTIONS — CREATE / DELETE (confirm-gated)
// ============================================
// confirm=false → preview буцаана (хэрэглэгчээс зөвшөөрөл хүснэ).
// confirm=true  → бодит үйлдлийг гүйцэтгэнэ (action endpoint-оос дуудна).

function confirmNeeded(tool: string, args: any, label: string, preview: Record<string, unknown>) {
    return { requiresConfirmation: true, action: { tool, args }, label, preview };
}

/** Нэвтэрсэн хэрэглэгчийн (борлуулалтын менежер) харагдах нэрийг тодорхойлно. */
export async function resolveSalesManagerName(userId?: string, fallback?: string): Promise<string> {
    if (!userId) return fallback || '';
    const { data } = await supabaseAdmin.from('user_profiles').select('full_name, email').eq('id', userId).maybeSingle();
    return data?.full_name || data?.email || fallback || '';
}

/** Best-effort: sales_manager_name баганад нэр бичнэ. Багана байхгүй (миграци ороогүй) бол алгасна. */
async function stampSalesManager(table: string, id: string | undefined, name?: string) {
    if (!id || !name) return;
    const { error } = await supabaseAdmin.from(table).update({ sales_manager_name: name }).eq('id', id);
    if (error) logger.warn(`[stampSalesManager] skipped (${table}): ${error.message}`);
}

/**
 * Soft-delete-ийг харгалзан query гүйцэтгэнэ. deleted_at багана байхгүй (миграци
 * ороогүй) бол шүүлтгүйгээр дахин оролдоно — read regression-аас сэргийлнэ.
 */
async function runExcludingDeleted(build: (excludeDeleted: boolean) => any) {
    const res = await build(true);
    if (res.error && /deleted_at/i.test(res.error.message || '')) {
        return await build(false);
    }
    return res;
}

export async function createProperty(shopId: string, args: any, confirm = false) {
    if (!args.name || !args.type || args.price == null) {
        return { error: 'name, type, price талбарууд заавал шаардлагатай' };
    }
    const validTypes = ['apartment', 'house', 'office', 'land', 'commercial'];
    if (!validTypes.includes(args.type)) return { error: `type буруу байна. Зөвшөөрөгдсөн: ${validTypes.join(', ')}` };

    const preview = {
        Нэр: args.name, Төрөл: args.type,
        Үнэ: `${Number(args.price).toLocaleString()}₮`,
        Дүүрэг: args.district || '-', 'Өрөө': args.rooms ?? '-', 'м²': args.size_sqm ?? '-',
        Статус: args.status || 'available',
    };
    if (!confirm) return confirmNeeded('create_property', args, `Шинэ байр нэмэх: ${args.name}`, preview);

    const insert = {
        shop_id: shopId,
        name: args.name, type: args.type, price: args.price,
        description: args.description || null,
        price_per_sqm: args.price_per_sqm ?? null,
        currency: args.currency || 'MNT',
        size_sqm: args.size_sqm ?? null,
        rooms: args.rooms ?? null,
        district: args.district || null,
        address: args.address || null,
        city: args.city || 'Ulaanbaatar',
        status: args.status || 'available',
        is_active: true,
    };
    const { data, error } = await supabaseAdmin.from('properties').insert(insert).select('id, name').single();
    if (error) return { error: `Алдаа: ${error.message}` };
    return { success: true, message: `"${data.name}" байр амжилттай нэмэгдлээ.`, propertyId: data.id };
}

export async function deleteProperty(shopId: string, args: any, confirm = false) {
    let query = supabaseAdmin.from('properties').select('id, name, status').eq('shop_id', shopId).is('deleted_at', null);
    if (args.property_id) query = query.eq('id', args.property_id);
    else if (args.property_name) query = query.ilike('name', `%${args.property_name}%`);
    else return { error: 'property_id эсвэл property_name шаардлагатай' };

    const { data: properties } = await query;
    if (!properties || properties.length === 0) return { error: 'Байр олдсонгүй' };
    if (properties.length > 1) return { error: `${properties.length} байр олдлоо, ID-г тодруулна уу`, options: properties.map(p => ({ id: p.id, name: p.name })) };

    const prop = properties[0];
    if (!confirm) {
        return confirmNeeded('delete_property',
            { property_id: prop.id, reason: args.reason, document_url: args.document_url },
            `Байр устгах: ${prop.name}`,
            { Нэр: prop.name, Статус: prop.status, Шалтгаан: args.reason || '-', 'Баримт/гэрээ': args.document_url || '-' });
    }

    const { error } = await supabaseAdmin.from('properties')
        .update({ deleted_at: new Date().toISOString(), is_active: false })
        .eq('id', prop.id);
    if (error) return { error: `Алдаа: ${error.message}` };
    return { success: true, message: `"${prop.name}" байрыг устгалаа (сэргээх боломжтой).`, propertyId: prop.id };
}

export async function createLead(shopId: string, args: any, confirm = false, salesManagerName = '') {
    if (!args.customer_name) return { error: 'customer_name шаардлагатай' };
    const validStatus = ['new', 'contacted', 'viewing_scheduled', 'offered', 'negotiating', 'closed_won', 'closed_lost'];
    const status = args.status && validStatus.includes(args.status) ? args.status : 'new';
    const validSource = ['messenger', 'instagram', 'website', 'referral', 'phone', 'facebook_ads', 'google_ads', 'other'];
    const source = args.source && validSource.includes(args.source) ? args.source : 'other';

    const preview = {
        Нэр: args.customer_name, Утас: args.customer_phone || '-', Статус: status, 'Эх сурвалж': source,
        Төсөв: args.budget_max ? `${Number(args.budget_max).toLocaleString()}₮` : '-',
        Менежер: salesManagerName || '-',
    };
    if (!confirm) return confirmNeeded('create_lead', { ...args, status, source }, `Шинэ лийд: ${args.customer_name}`, preview);

    const insert = {
        shop_id: shopId,
        customer_name: args.customer_name,
        customer_phone: args.customer_phone || null,
        customer_email: args.customer_email || null,
        status, source,
        notes: args.notes || null,
        budget_min: args.budget_min ?? null,
        budget_max: args.budget_max ?? null,
        preferred_district: args.preferred_district || null,
        preferred_rooms: args.preferred_rooms ?? null,
    };
    const { data, error } = await supabaseAdmin.from('leads').insert(insert).select('id, customer_name').single();
    if (error) return { error: `Алдаа: ${error.message}` };
    await stampSalesManager('leads', data.id, salesManagerName);
    return { success: true, message: `"${data.customer_name}" лийд амжилттай үүсгэлээ${salesManagerName ? ` (менежер: ${salesManagerName})` : ''}.`, leadId: data.id };
}

export async function deleteLead(shopId: string, args: any, confirm = false) {
    let query = supabaseAdmin.from('leads').select('id, customer_name, status').eq('shop_id', shopId).is('deleted_at', null);
    if (args.lead_id) query = query.eq('id', args.lead_id);
    else if (args.customer_name) query = query.ilike('customer_name', `%${args.customer_name}%`);
    else return { error: 'lead_id эсвэл customer_name шаардлагатай' };

    const { data: leads } = await query;
    if (!leads || leads.length === 0) return { error: 'Лийд олдсонгүй' };
    if (leads.length > 1) return { error: `${leads.length} лийд олдлоо, тодруулна уу`, options: leads.map(l => ({ id: l.id, name: l.customer_name })) };

    const lead = leads[0];
    if (!confirm) {
        return confirmNeeded('delete_lead',
            { lead_id: lead.id, reason: args.reason },
            `Лийд устгах: ${lead.customer_name}`,
            { Нэр: lead.customer_name, Статус: lead.status, Шалтгаан: args.reason || '-' });
    }

    const { error } = await supabaseAdmin.from('leads')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', lead.id);
    if (error) return { error: `Алдаа: ${error.message}` };
    return { success: true, message: `"${lead.customer_name}" лийдийг устгалаа (сэргээх боломжтой).`, leadId: lead.id };
}

export async function createCustomer(shopId: string, args: any, confirm = false, salesManagerName = '') {
    if (!args.name) return { error: 'name шаардлагатай' };
    const phoneNorm = args.phone ? String(args.phone).replace(/\D/g, '') : null;

    // Давхардал шалгах (утас/имэйлээр)
    if (phoneNorm || args.email) {
        const ors: string[] = [];
        if (phoneNorm) ors.push(`phone_normalized.eq.${phoneNorm}`);
        if (args.email) ors.push(`email.eq.${args.email}`);
        const { data: dupes } = await supabaseAdmin.from('customers')
            .select('id, name').eq('shop_id', shopId).or(ors.join(','));
        if (dupes && dupes.length > 0) {
            return { error: `Ийм харилцагч аль хэдийн бүртгэлтэй: ${dupes[0].name}`, existing: dupes };
        }
    }

    const preview = { Нэр: args.name, Утас: args.phone || '-', Имэйл: args.email || '-', Менежер: salesManagerName || '-' };
    if (!confirm) return confirmNeeded('create_customer', args, `Шинэ харилцагч: ${args.name}`, preview);

    const insert = {
        shop_id: shopId, name: args.name,
        phone: args.phone || null, phone_normalized: phoneNorm,
        email: args.email || null, address: args.address || null,
        notes: args.notes || null, tags: ['source:ai'],
    };
    const { data, error } = await supabaseAdmin.from('customers').insert(insert).select('id, name').single();
    if (error) return { error: `Алдаа: ${error.message}` };
    await stampSalesManager('customers', data.id, salesManagerName);
    return { success: true, message: `"${data.name}" харилцагч амжилттай үүсгэлээ${salesManagerName ? ` (менежер: ${salesManagerName})` : ''}.`, customerId: data.id };
}

// ---- Viewings (үзлэг) ----

export async function scheduleViewing(shopId: string, args: any, confirm = false, salesManagerName = '') {
    if (!args.scheduled_at) return { error: 'scheduled_at (огноо/цаг) шаардлагатай' };
    if (!args.property_id && !args.property_name) return { error: 'property_id эсвэл property_name шаардлагатай' };

    // Байр шийдвэрлэх
    let propQuery = supabaseAdmin.from('properties').select('id, name').eq('shop_id', shopId).is('deleted_at', null);
    propQuery = args.property_id ? propQuery.eq('id', args.property_id) : propQuery.ilike('name', `%${args.property_name}%`);
    const { data: props } = await propQuery;
    if (!props || props.length === 0) return { error: 'Байр олдсонгүй' };
    if (props.length > 1) return { error: `${props.length} байр олдлоо, тодруулна уу`, options: props.map(p => ({ id: p.id, name: p.name })) };
    const prop = props[0];

    // Лийд шийдвэрлэх (заавал биш)
    let leadId: string | null = args.lead_id || null;
    if (!leadId && args.customer_name) {
        const { data: leads } = await supabaseAdmin.from('leads').select('id').eq('shop_id', shopId).is('deleted_at', null).ilike('customer_name', `%${args.customer_name}%`).limit(1);
        if (leads && leads.length) leadId = leads[0].id;
    }

    const scheduledAt = new Date(args.scheduled_at);
    if (isNaN(scheduledAt.getTime())) return { error: 'scheduled_at буруу огноо' };

    const preview = {
        Байр: prop.name, Огноо: scheduledAt.toLocaleString('mn-MN'),
        Харилцагч: args.customer_name || '-', Менежер: salesManagerName || '-',
    };
    if (!confirm) return confirmNeeded('schedule_viewing', { ...args, property_id: prop.id, lead_id: leadId }, `Үзлэг товлох: ${prop.name}`, preview);

    const { data, error } = await supabaseAdmin.from('property_viewings').insert({
        shop_id: shopId, property_id: prop.id, lead_id: leadId,
        scheduled_at: scheduledAt.toISOString(), status: 'scheduled',
        agent_notes: args.notes || null,
    }).select('id').single();
    if (error) return { error: `Алдаа: ${error.message}` };
    await stampSalesManager('property_viewings', data.id, salesManagerName);
    return { success: true, message: `"${prop.name}" байрны үзлэгийг ${scheduledAt.toLocaleString('mn-MN')}-д товлолоо${salesManagerName ? ` (менежер: ${salesManagerName})` : ''}.`, viewingId: data.id };
}

export async function deleteViewing(shopId: string, args: any, confirm = false) {
    let query = supabaseAdmin.from('property_viewings')
        .select('id, scheduled_at, status, properties(name)')
        .eq('shop_id', shopId).is('deleted_at', null);
    if (args.viewing_id) {
        query = query.eq('id', args.viewing_id);
    } else if (args.property_name) {
        // тухайн байрны товлогдсон үзлэгийг хайна
        const { data: props } = await supabaseAdmin.from('properties').select('id').eq('shop_id', shopId).ilike('name', `%${args.property_name}%`).limit(1);
        if (!props || !props.length) return { error: 'Байр олдсонгүй' };
        query = query.eq('property_id', props[0].id).eq('status', 'scheduled').order('scheduled_at', { ascending: true });
    } else {
        return { error: 'viewing_id эсвэл property_name шаардлагатай' };
    }

    const { data: viewings } = await query;
    if (!viewings || viewings.length === 0) return { error: 'Үзлэг олдсонгүй' };
    if (viewings.length > 1) return { error: `${viewings.length} үзлэг олдлоо, viewing_id-г тодруулна уу`, options: viewings.map((v: any) => ({ id: v.id, scheduled_at: v.scheduled_at })) };
    const v: any = viewings[0];
    const propName = v.properties?.name || 'байр';

    if (!confirm) {
        return confirmNeeded('delete_viewing', { viewing_id: v.id, reason: args.reason }, `Үзлэг устгах: ${propName}`,
            { Байр: propName, Огноо: v.scheduled_at ? new Date(v.scheduled_at).toLocaleString('mn-MN') : '-', Шалтгаан: args.reason || '-' });
    }

    const { error } = await supabaseAdmin.from('property_viewings').update({ deleted_at: new Date().toISOString(), status: 'cancelled' }).eq('id', v.id);
    if (error) return { error: `Алдаа: ${error.message}` };
    return { success: true, message: `"${propName}" байрны үзлэгийг устгалаа (сэргээх боломжтой).`, viewingId: v.id };
}

// ---- Contracts (гэрээ) ----

export async function createContract(shopId: string, args: any, confirm = false, salesManagerName = '') {
    if (!args.customer_name) return { error: 'customer_name шаардлагатай' };

    const preview = {
        Харилцагч: args.customer_name, Утас: args.customer_phone || '-',
        'Нийт үнэ': args.total_price ? `${Number(args.total_price).toLocaleString()}₮` : '-',
        'Төсөл/блок': args.block_name || '-', 'Байр': args.unit_number || '-',
        Менежер: salesManagerName || '-',
    };
    if (!confirm) return confirmNeeded('create_contract', args, `Шинэ гэрээ: ${args.customer_name}`, preview);

    const insert: Record<string, unknown> = {
        shop_id: shopId,
        product_type: args.product_type || 'residential',
        contract_status: 'active',
        customer_name: args.customer_name,
        customer_phone: args.customer_phone || null,
        total_price: args.total_price ?? null,
        balance: args.total_price ?? null,
        block_name: args.block_name || null,
        unit_number: args.unit_number || null,
        contract_number: args.contract_number || null,
        sales_channel: args.sales_channel || 'ПРОПЕРТИС',
        sales_manager: salesManagerName || null,
        contract_date: new Date().toISOString().slice(0, 10),
        lead_id: args.lead_id || null,
        customer_id: args.customer_id || null,
    };
    const { data, error } = await supabaseAdmin.from('property_contracts').insert(insert).select('id, customer_name').single();
    if (error) return { error: `Алдаа: ${error.message}` };
    return { success: true, message: `"${data.customer_name}"-ийн гэрээ үүсгэлээ${salesManagerName ? ` (менежер: ${salesManagerName})` : ''}.`, contractId: data.id };
}

export async function deleteContract(shopId: string, args: any, confirm = false) {
    let query = supabaseAdmin.from('property_contracts')
        .select('id, contract_number, customer_name, contract_status')
        .eq('shop_id', shopId).is('deleted_at', null);
    if (args.contract_id) query = query.eq('id', args.contract_id);
    else if (args.contract_number) query = query.ilike('contract_number', `%${args.contract_number}%`);
    else if (args.customer_name) query = query.ilike('customer_name', `%${args.customer_name}%`);
    else return { error: 'contract_id, contract_number эсвэл customer_name шаардлагатай' };

    const { data: contracts } = await query;
    if (!contracts || contracts.length === 0) return { error: 'Гэрээ олдсонгүй' };
    if (contracts.length > 1) return { error: `${contracts.length} гэрээ олдлоо, тодруулна уу`, options: contracts.map(c => ({ id: c.id, number: c.contract_number, name: c.customer_name })) };
    const c = contracts[0];

    if (!confirm) {
        return confirmNeeded('delete_contract', { contract_id: c.id, reason: args.reason }, `Гэрээ устгах: ${c.customer_name || c.contract_number || ''}`,
            { Харилцагч: c.customer_name || '-', 'Гэрээ №': c.contract_number || '-', Шалтгаан: args.reason || '-' });
    }

    const { error } = await supabaseAdmin.from('property_contracts').update({ deleted_at: new Date().toISOString(), contract_status: 'cancelled' }).eq('id', c.id);
    if (error) return { error: `Алдаа: ${error.message}` };
    return { success: true, message: `"${c.customer_name || c.contract_number}" гэрээг устгалаа (сэргээх боломжтой).`, contractId: c.id };
}

// ---- Customer delete (харилцагч хасах) ----

export async function deleteCustomer(shopId: string, args: any, confirm = false) {
    let query = supabaseAdmin.from('customers').select('id, name, phone').eq('shop_id', shopId).is('deleted_at', null);
    if (args.customer_id) query = query.eq('id', args.customer_id);
    else if (args.phone) query = query.ilike('phone', `%${args.phone}%`);
    else if (args.name) query = query.ilike('name', `%${args.name}%`);
    else return { error: 'customer_id, name эсвэл phone шаардлагатай' };

    const { data: customers } = await query;
    if (!customers || customers.length === 0) return { error: 'Харилцагч олдсонгүй' };
    if (customers.length > 1) return { error: `${customers.length} харилцагч олдлоо, тодруулна уу`, options: customers.map(c => ({ id: c.id, name: c.name, phone: c.phone })) };
    const c = customers[0];

    if (!confirm) {
        return confirmNeeded('delete_customer', { customer_id: c.id, reason: args.reason }, `Харилцагч устгах: ${c.name}`,
            { Нэр: c.name, Утас: c.phone || '-', Шалтгаан: args.reason || '-' });
    }

    const { error } = await supabaseAdmin.from('customers').update({ deleted_at: new Date().toISOString() }).eq('id', c.id);
    if (error) return { error: `Алдаа: ${error.message}` };
    return { success: true, message: `"${c.name}" харилцагчийг устгалаа (сэргээх боломжтой).`, customerId: c.id };
}

// ---- Bulk үйлдэл ----

export async function bulkUpdateLeads(shopId: string, args: any, confirm = false) {
    const valid = ['new', 'contacted', 'viewing_scheduled', 'offered', 'negotiating', 'closed_won', 'closed_lost'];
    if (!args.new_status || !valid.includes(args.new_status)) return { error: 'new_status шаардлагатай ба зөв төлөв байх ёстой' };

    let q = supabaseAdmin.from('leads').select('id, customer_name, status').eq('shop_id', shopId).is('deleted_at', null);
    if (args.from_status) q = q.eq('status', args.from_status);
    else if (args.lead_ids) {
        const ids = String(args.lead_ids).split(',').map((s) => s.trim()).filter(Boolean);
        if (!ids.length) return { error: 'lead_ids хоосон байна' };
        q = q.in('id', ids);
    } else {
        return { error: 'from_status эсвэл lead_ids шаардлагатай' };
    }

    const { data: leads } = await q;
    if (!leads || leads.length === 0) return { error: 'Тохирох лийд олдсонгүй' };

    if (!confirm) {
        return confirmNeeded('bulk_update_leads', args, `${leads.length} лийдийн статус → ${args.new_status}`,
            { 'Лийд тоо': leads.length, 'Шинэ статус': args.new_status, 'Жишээ': leads.slice(0, 5).map((l) => l.customer_name).join(', ') || '-' });
    }

    const ids = leads.map((l) => l.id);
    const { error } = await supabaseAdmin.from('leads').update({ status: args.new_status, updated_at: new Date().toISOString() }).in('id', ids);
    if (error) return { error: `Алдаа: ${error.message}` };
    return { success: true, message: `${ids.length} лийдийн статусыг "${args.new_status}" болгож шинэчиллээ.`, count: ids.length };
}

// ---- Marketing ----

export async function fetchMarketingSummary(shopId: string, args: any) {
    const [{ data: campaigns }, { data: posts }] = await Promise.all([
        supabaseAdmin.from('ad_campaigns').select('name, platform, status, budget, spend, impressions, clicks, conversions, reach').eq('shop_id', shopId),
        supabaseAdmin.from('social_posts').select('platform, status, likes, comments, shares, reach, engagement_rate, published_at').eq('shop_id', shopId).order('published_at', { ascending: false, nullsFirst: false }).limit(10),
    ]);
    const camps = campaigns || [];
    const totals = camps.reduce((a, c: any) => ({
        spend: a.spend + Number(c.spend || 0),
        impressions: a.impressions + Number(c.impressions || 0),
        clicks: a.clicks + Number(c.clicks || 0),
        conversions: a.conversions + Number(c.conversions || 0),
    }), { spend: 0, impressions: 0, clicks: 0, conversions: 0 });
    return {
        campaignCount: camps.length,
        activeCampaigns: camps.filter((c: any) => c.status === 'active').length,
        totals: {
            spend: `${totals.spend.toLocaleString()}₮`,
            impressions: totals.impressions,
            clicks: totals.clicks,
            conversions: totals.conversions,
            ctr: totals.impressions ? `${((totals.clicks / totals.impressions) * 100).toFixed(2)}%` : '0%',
            cpa: totals.conversions ? `${Math.round(totals.spend / totals.conversions).toLocaleString()}₮` : '-',
        },
        campaigns: camps.slice(0, 10),
        recentPosts: (posts || []).map((p: any) => ({ platform: p.platform, status: p.status, likes: p.likes, comments: p.comments, reach: p.reach, engagement_rate: p.engagement_rate })),
    };
}

export async function createSocialPost(shopId: string, args: any, confirm = false, salesManagerName = '') {
    if (!args.content) return { error: 'content (постын текст) шаардлагатай' };
    const platforms = ['facebook', 'instagram', 'twitter', 'linkedin', 'tiktok'];
    const platform = platforms.includes(args.platform) ? args.platform : 'facebook';
    const status = args.scheduled_at ? 'scheduled' : 'draft';

    const preview = {
        Суваг: platform,
        Төлөв: status === 'scheduled' ? 'Товлосон' : 'Ноорог',
        Хуваарь: args.scheduled_at || '-',
        Текст: String(args.content).slice(0, 120) + (String(args.content).length > 120 ? '…' : ''),
    };
    if (!confirm) return confirmNeeded('create_social_post', { ...args, platform, status }, `Сошиал пост (${status === 'scheduled' ? 'товлосон' : 'ноорог'})`, preview);

    const insert: Record<string, unknown> = {
        shop_id: shopId, platform, content: args.content, status,
        media_urls: args.media_url ? [args.media_url] : null,
    };
    if (args.scheduled_at) insert.published_at = args.scheduled_at;
    const { data, error } = await supabaseAdmin.from('social_posts').insert(insert).select('id').single();
    if (error) return { error: `Алдаа: ${error.message}` };
    return { success: true, message: `Сошиал пост ${status === 'scheduled' ? 'товлолоо' : 'ноорог болгож хадгаллаа'} (${platform})${salesManagerName ? ` — ${salesManagerName}` : ''}.`, postId: data.id };
}

// ---- Long-term shop memory ----

/** Shop-ийн урт хугацааны санах ойг (key-value баримтууд) уншина. */
export async function getShopMemory(shopId: string): Promise<{ key: string; value: string }[]> {
    const { data } = await supabaseAdmin.from('ai_shop_memory')
        .select('key, value').eq('shop_id', shopId).order('updated_at', { ascending: false }).limit(30);
    return data || [];
}

/** Орчестраторын системд оруулах memory мэдээллийг текст болгоно. */
export function formatShopMemory(rows: { key: string; value: string }[]): string {
    if (!rows.length) return '';
    const list = rows.map((r) => `- ${r.key}: ${r.value}`).join('\n');
    return `ДЭЛГҮҮРИЙН УРТ ХУГАЦААНЫ САНАХ ОЙ (өмнө сурсан баримтууд):\n${list}`;
}

/** Баримт сануулах — шууд гүйцэтгэнэ (баталгаажуулалтгүй, эргүүлж засах боломжтой). */
export async function rememberFact(shopId: string, args: any, _confirm = false, salesManagerName = '') {
    if (!args.key || !args.value) return { error: 'key ба value шаардлагатай' };
    const key = String(args.key).slice(0, 80).trim();
    const value = String(args.value).slice(0, 500).trim();
    const { error } = await supabaseAdmin.from('ai_shop_memory')
        .upsert({ shop_id: shopId, key, value, created_by: salesManagerName || null, updated_at: new Date().toISOString() }, { onConflict: 'shop_id,key' });
    if (error) return { error: `Алдаа: ${error.message}` };
    return { success: true, message: `Санаж авлаа: "${key}".` };
}

// ---- File attach (файл хавсаргах) ----

/** Хавсаргах entity-г төрөл + id/нэрээр шийдвэрлэнэ. */
async function resolveEntity(shopId: string, entityType: string, args: any): Promise<{ id: string; label: string } | { error: string; options?: any[] }> {
    const byId = args.entity_id;
    if (entityType === 'property') {
        let q = supabaseAdmin.from('properties').select('id, name').eq('shop_id', shopId).is('deleted_at', null);
        q = byId ? q.eq('id', byId) : q.ilike('name', `%${args.entity_name || ''}%`);
        const { data } = await q;
        if (!data || !data.length) return { error: 'Байр олдсонгүй' };
        if (data.length > 1) return { error: `${data.length} байр олдлоо, тодруулна уу`, options: data.map(d => ({ id: d.id, name: d.name })) };
        return { id: data[0].id, label: data[0].name };
    }
    if (entityType === 'lead') {
        let q = supabaseAdmin.from('leads').select('id, customer_name').eq('shop_id', shopId).is('deleted_at', null);
        q = byId ? q.eq('id', byId) : q.ilike('customer_name', `%${args.entity_name || ''}%`);
        const { data } = await q;
        if (!data || !data.length) return { error: 'Лийд олдсонгүй' };
        if (data.length > 1) return { error: `${data.length} лийд олдлоо, тодруулна уу`, options: data.map(d => ({ id: d.id, name: d.customer_name })) };
        return { id: data[0].id, label: data[0].customer_name };
    }
    if (entityType === 'customer') {
        let q = supabaseAdmin.from('customers').select('id, name').eq('shop_id', shopId).is('deleted_at', null);
        q = byId ? q.eq('id', byId) : q.ilike('name', `%${args.entity_name || ''}%`);
        const { data } = await q;
        if (!data || !data.length) return { error: 'Харилцагч олдсонгүй' };
        if (data.length > 1) return { error: `${data.length} харилцагч олдлоо, тодруулна уу`, options: data.map(d => ({ id: d.id, name: d.name })) };
        return { id: data[0].id, label: data[0].name };
    }
    // contract
    let q = supabaseAdmin.from('property_contracts').select('id, contract_number, customer_name').eq('shop_id', shopId);
    if (byId) q = q.eq('id', byId);
    else if (args.contract_number) q = q.ilike('contract_number', `%${args.contract_number}%`);
    else q = q.ilike('customer_name', `%${args.entity_name || ''}%`);
    const { data } = await q;
    if (!data || !data.length) return { error: 'Гэрээ олдсонгүй' };
    if (data.length > 1) return { error: `${data.length} гэрээ олдлоо, тодруулна уу`, options: data.map(d => ({ id: d.id, name: d.customer_name || d.contract_number })) };
    return { id: data[0].id, label: data[0].customer_name || data[0].contract_number || 'гэрээ' };
}

export async function attachFile(shopId: string, args: any, confirm = false, salesManagerName = '') {
    const types = ['property', 'lead', 'customer', 'contract'];
    if (!args.entity_type || !types.includes(args.entity_type)) return { error: 'entity_type буруу (property/lead/customer/contract)' };
    if (!args.file_url) return { error: 'file_url шаардлагатай' };

    const resolved = await resolveEntity(shopId, args.entity_type, args);
    if ('error' in resolved) return resolved;

    const typeLabel: Record<string, string> = { property: 'Байр', lead: 'Лийд', customer: 'Харилцагч', contract: 'Гэрээ' };
    if (!confirm) {
        return confirmNeeded('attach_file',
            { ...args, entity_id: resolved.id },
            `Файл хавсаргах: ${resolved.label}`,
            { Төрөл: typeLabel[args.entity_type], Бичлэг: resolved.label, Файл: args.file_name || args.file_url, Менежер: salesManagerName || '-' });
    }

    // Generic attachment бичлэг
    const { error: insErr } = await supabaseAdmin.from('ai_attachments').insert({
        shop_id: shopId,
        entity_type: args.entity_type,
        entity_id: resolved.id,
        url: args.file_url,
        file_name: args.file_name || null,
        mime_type: args.mime_type || null,
        uploaded_by: salesManagerName || null,
    });
    if (insErr) return { error: `Алдаа: ${insErr.message}` };

    // Байрны зураг бол properties.images[]-д давхар нэмнэ
    const isImage = (args.mime_type || '').startsWith('image/') || /\.(png|jpe?g|webp|gif)$/i.test(args.file_url);
    if (args.entity_type === 'property' && isImage) {
        const { data: prop } = await supabaseAdmin.from('properties').select('images').eq('id', resolved.id).single();
        const images = Array.isArray(prop?.images) ? prop!.images : [];
        if (!images.includes(args.file_url)) {
            await supabaseAdmin.from('properties').update({ images: [...images, args.file_url] }).eq('id', resolved.id);
        }
    }

    return { success: true, message: `Файлыг "${resolved.label}" ${typeLabel[args.entity_type].toLowerCase()}-д хавсаргалаа.`, entityId: resolved.id };
}

// ============================================
// CHART CONFIG GENERATOR
// ============================================

export function generateChartConfig(toolName: string, args: any, data: any): any {
    if (!data || (Array.isArray(data) && data.length === 0)) return null;

    switch (toolName) {
        case 'get_dashboard_stats':
            return {
                type: 'bar', data: [
                    { name: 'Захиалга', value: data.totalOrders || 0 },
                    { name: 'Харилцагч', value: data.totalCustomers || 0 },
                    { name: 'Лийд', value: data.totalLeads || 0 },
                    { name: 'Байр', value: data.totalProperties || 0 },
                ]
            };
        case 'list_properties':
            if (Array.isArray(data) && data.length > 0) {
                return { type: 'bar', data: data.slice(0, 8).map((p: any) => ({ name: p.name?.substring(0, 15) || 'Байр', value: Number(p.price) || 0 })) };
            }
            return null;
        case 'list_leads':
            if (Array.isArray(data) && data.length > 0) {
                const statusCounts: Record<string, number> = {};
                data.forEach((l: any) => { statusCounts[l.status] = (statusCounts[l.status] || 0) + 1; });
                const statusLabels: Record<string, string> = { new: 'Шинэ', contacted: 'Холбогдсон', viewing_scheduled: 'Үзлэг', offered: 'Санал', negotiating: 'Хэлэлцээр', closed_won: 'Амжилттай', closed_lost: 'Алдсан' };
                return { type: 'bar', data: Object.entries(statusCounts).map(([status, count]) => ({ name: statusLabels[status] || status, value: count })) };
            }
            return null;
        case 'list_orders':
            if (Array.isArray(data) && data.length > 0) {
                return { type: 'bar', data: data.slice(0, 8).map((o: any) => ({ name: o.customerName?.substring(0, 10) || o.id, value: Number(o.amount) || 0 })) };
            }
            return null;
        case 'get_product_stats':
            if (Array.isArray(data) && data.length > 0) {
                return { type: 'bar', data: data.slice(0, 8).map((p: any) => ({ name: p.name?.substring(0, 15) || 'Бүтээгдэхүүн', value: args.type === 'low_stock' ? (p.stock || 0) : (p.price || 0) })) };
            }
            return null;
        default: return null;
    }
}
