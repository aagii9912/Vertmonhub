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
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
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
        .eq('shop_id', shopId).order('created_at', { ascending: false }).limit(limit);

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
    if (args.customer_id) {
        const { data: customer } = await supabaseAdmin.from('customers').select('id, name, phone, email, facebook_id, instagram_id, created_at').eq('id', args.customer_id).single();
        if (!customer) return { error: 'Харилцагч олдсонгүй' };
        const { data: orders } = await supabaseAdmin.from('orders').select('id, total_amount, status, created_at').eq('customer_id', args.customer_id).eq('shop_id', shopId).order('created_at', { ascending: false }).limit(10);
        const { data: leads } = await supabaseAdmin.from('leads').select('id, status, preferred_type, budget_min, budget_max, urgency').eq('customer_id', args.customer_id).eq('shop_id', shopId);
        return { customer, orders: orders || [], leads: leads || [], totalSpent: orders?.reduce((sum, o) => sum + (Number(o.total_amount) || 0), 0) || 0 };
    }
    let query = supabaseAdmin.from('customers').select('id, name, phone, email, created_at').eq('shop_id', shopId).order('created_at', { ascending: false }).limit(limit);
    if (args.customer_name) query = query.ilike('name', `%${args.customer_name}%`);
    const { data } = await query;
    return { customers: data || [] };
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
