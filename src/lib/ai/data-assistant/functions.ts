/**
 * Data Assistant Functions — Read, Write, and Chart generation
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseAdmin as createServiceClient } from '@/lib/supabase';
import { formatShortDate, formatTime, ubDateStr, ubStartOfDay } from '@/lib/utils/date';
import { logger } from '@/lib/utils/logger';
import { fetchAllRows } from '@/lib/utils/pagination';
import { normalizePhone, phoneIlikePattern } from '@/lib/utils/phone';
import { softDeleteCustomer } from '@/lib/services/CustomerOps';
import { insertLeadOnce, resolveLeadIdentity, resolveStaffLead, type StaffLeadActor } from '@/lib/services/LeadService';
import { buildBudgetOverview, monthlySpendSeries, spendByChannel, SPEND_CHANNELS } from '@/lib/marketing/budget';
import { loadMarketingSpend } from '@/lib/marketing/spend-load';
import { spendQuality, SPEND_BASIS } from '@/lib/marketing/performance';
import { isLeadWorkQueue, workQueueFilter } from '@/lib/leads/work-queue';
import { hasRealContractFields } from '@/lib/leads/contracts';
import { resolveActiveManagerName, resolveManagerIdentity } from '@/lib/sales/manager-identity';
import { createViewing, resolveViewingInput, updateViewing } from '@/lib/services/ViewingService';
import { applyLeadScope, assertProjectManager, canAccessProject, UNRESTRICTED_SALES_SCOPE, type SalesProjectScope } from '@/lib/sales/project-scope';
import { z } from 'zod';
import { canReadPrivateAttachment, isLegacyPublicAttachmentUrl, parsePrivateAttachmentUrl } from '@/lib/ai/private-attachments';
import { logLeadActivity, recordLeadContact } from '@/lib/leads/activities';
import { loadLeadTimeline } from '@/lib/leads/timeline-load';
import { compactLeadTimelineWithin } from '@/lib/leads/timeline';
import { LEAD_NAME_OR_ANONYMOUS, STATUS_META, UNCATEGORIZED_LABEL, isAnonymousLead, isUncategorizedInput, leadCategoryLabel, leadDisplayName, normalizeLeadName, statusLabel, toLeadSource } from '@/lib/leads/labels';
import { leadCategoryName, listLeadCategories, resolveLeadCategory, type LeadCategory } from '@/lib/services/LeadCategoryService';
import type { LeadStatus } from '@/types/property';
import { accountCurrencyLabel, formatAccountMoney, formatMNT } from '@/lib/utils/currency';
import { loadAdAccountCurrency } from '@/lib/marketing/meta-spend';
import { contractIdsByPreviousHolder, listContractTransfers } from '@/lib/services/ContractService';
import { propertyStatusLabel, unitStatusLabel, type InventoryStatus } from '@/lib/inventory/labels';
import { contractStatusLabel } from '@/lib/contracts/labels';

/** Timeline-д «хэн өөрчилсөн»-ийг тэмдэглэх (UI-ийн PATCH /leads/[id]-тэй ижил). */
export interface LeadActor { userId?: string | null; userName?: string | null }

function logStatusChange(shopId: string, leadId: string, from: string, to: string, lostReason: string | null, actor?: LeadActor) {
    return logLeadActivity(supabaseAdmin, {
        shopId, leadId, type: 'status', createdBy: actor?.userId ?? null, createdByName: actor?.userName || null,
        content: `${statusLabel(from)} → ${statusLabel(to)}${lostReason ? ` · ${lostReason}` : ''}`,
        meta: { from, to, lost_reason: lostReason },
    });
}

// Lazy service-role client (`@/lib/supabase`) — эхний хандалтад үүснэ, тиймээс модуль
// ачаалах үед env дутуу байсан ч (Next page-data цуглуулалт) унахгүй.
let _adminClient: SupabaseClient | null = null;
const supabaseAdmin: SupabaseClient = new Proxy({} as SupabaseClient, {
    get(_target, prop) {
        _adminClient ??= createServiceClient();
        const value = Reflect.get(_adminClient, prop, _adminClient);
        return typeof value === 'function' ? value.bind(_adminClient) : value;
    },
}) as SupabaseClient;

// ============================================
// HELPERS
// ============================================

function getDateFilter(timeRange: string): string {
    // УБ-ийн өдрийн хилээр (сервер UTC)
    const start = ubStartOfDay();
    switch (timeRange) {
        case 'today': return start.toISOString();
        case 'week': return new Date(start.getTime() - 7 * 86_400_000).toISOString();
        case 'month': return new Date(start.getTime() - 30 * 86_400_000).toISOString();
        case 'year': return new Date(start.getTime() - 365 * 86_400_000).toISOString();
        default: return new Date(Date.UTC(2000, 0, 1)).toISOString();
    }
}

// ============================================
// READ FUNCTIONS
// ============================================

export async function fetchDashboardStats(shopId: string, timeRange: string = 'month', scope: SalesProjectScope = UNRESTRICTED_SALES_SCOPE) {
    const isoDate = getDateFilter(timeRange);
    const dateOnly = ubDateStr(new Date(isoDate));
    const [contracts, customersRes, leadsAll, units] = await Promise.all([
        fetchAllRows<{ total_price: number | string | null }>((from, to) => supabaseAdmin
            .from('property_contracts').select('total_price').eq('shop_id', shopId)
            .is('deleted_at', null).gte('contract_date', dateOnly).order('id').range(from, to)),
        supabaseAdmin.from('customers').select('id', { count: 'exact', head: true }).eq('shop_id', shopId).is('deleted_at', null),
        fetchAllRows<{ status: string | null }>((from, to) => applyLeadScope(supabaseAdmin
            .from('leads').select('status').eq('shop_id', shopId)
            .is('deleted_at', null).gte('created_at', isoDate).order('id').range(from, to), scope)),
        // Dashboard /stats-тай ижил орон сууцны нэгжийн сан; `properties` нь зарын сан.
        fetchAllRows<{ status: string | null }>((from, to) => supabaseAdmin
            .from('property_units').select('status').eq('shop_id', shopId)
            .eq('category', 'residential').order('id').range(from, to)),
    ]);
    if (customersRes.error) throw new Error(customersRes.error.message);

    // Гэрээний нийт үнэ нь кассад бодитоор орсон мөнгө биш.
    const totalContractValue = contracts.reduce((sum, c) => sum + (Number(c.total_price) || 0), 0);
    const leadsByStatus = {
        new: leadsAll.filter(l => l.status === 'new').length,
        contacted: leadsAll.filter(l => l.status === 'contacted').length,
        viewing_scheduled: leadsAll.filter(l => l.status === 'viewing_scheduled').length,
        offered: leadsAll.filter(l => l.status === 'offered').length,
        negotiating: leadsAll.filter(l => l.status === 'negotiating').length,
        closed_won: leadsAll.filter(l => l.status === 'closed_won').length,
        closed_lost: leadsAll.filter(l => l.status === 'closed_lost').length,
    };

    const statusCounts: Record<string, number> = { available: 0, reserved: 0, ordered: 0, sold: 0, handed_over: 0 };
    for (const unit of units) {
        const status = unit.status || 'unknown';
        statusCounts[status] = (statusCounts[status] || 0) + 1;
    }
    return {
        timeRange, totalContracts: contracts.length, totalContractValue,
        contractValueBasis: 'Гэрээний нийт үнийн нийлбэр (MNT); бодитоор хүлээн авсан мөнгөн орлого биш.',
        totalCustomers: customersRes.count || 0, totalLeads: leadsAll.length, leadsByStatus,
        totalProperties: units.length,
        inventory: {
            source: 'property_units', category: 'residential', total: units.length,
            available: statusCounts.available,
            sold: statusCounts.sold + statusCounts.handed_over,
            pending: statusCounts.reserved + statusCounts.ordered,
            statusCounts,
        },
    };
}

// (Хуучин e-commerce fetchOrders / fetchProductStats — 2026-09 Wave 2-т устгав; CLAUDE.md «буцааж оруулахгүй»)

export async function fetchProperties(shopId: string, args: any) {
    const limit = Number.isFinite(Number(args.limit)) ? Math.min(100, Math.max(1, Math.floor(Number(args.limit)))) : 10;
    const status = args.status || 'available';
    const listingStatuses = ['available', 'reserved', 'sold', 'rented', 'barter'];
    const unitStatuses = ['available', 'reserved', 'ordered', 'sold', 'handed_over'];
    const types = ['apartment', 'house', 'office', 'land', 'commercial'];
    const categories = ['residential', 'commercial', 'parking', 'industry'];
    if (![...listingStatuses, ...unitStatuses, 'all'].includes(status)
        || (args.type && !types.includes(args.type)) || (args.category && !categories.includes(args.category))) {
        return { error: 'Байрны төрөл, ангилал эсвэл төлөв буруу байна.' };
    }
    const typeCategory = args.type === 'apartment' ? 'residential'
        : ['office', 'commercial'].includes(args.type) ? 'commercial' : null;
    if (args.category && args.type && args.category !== typeCategory) {
        return { error: 'Байрны төрөл болон нэгжийн ангилал зөрж байна.' };
    }
    const category = args.category || typeCategory || 'residential';
    const hasPriceFilter = args.min_price != null || args.max_price != null;
    for (const key of ['min_price', 'max_price', 'rooms']) {
        if (args[key] != null && (!Number.isFinite(Number(args[key])) || Number(args[key]) < 0)) {
            return { error: 'Үнэ, өрөөний тоо эерэг тоо байх ёстой.' };
        }
    }
    if (args.rooms != null && (Number(args.rooms) < 1 || !Number.isInteger(Number(args.rooms)))) {
        return { error: 'Өрөөний тоо эерэг бүхэл тоо байх ёстой.' };
    }
    if (args.min_price != null && args.max_price != null && Number(args.min_price) > Number(args.max_price)) {
        return { error: 'Үнийн доод хязгаар дээд хязгаараас их байна.' };
    }
    // PostgREST-ийн OR илэрхийлэлд хэрэглэгчийн текстийг шүүлтийн синтакс болгохгүй.
    const search = args.name_search ? String(args.name_search).replace(/[%_*,()"'\\]/g, ' ').trim() : '';
    if (args.name_search && !search) return { error: 'Хайх нэрээ тодорхой оруулна уу.' };

    try {
        // Нэгжид байршил/төслийн нэр байхгүй; зөвхөн тухайн shop-ийн төслөөр холбоно.
        const projects = search || args.district || args.project_id
            ? await fetchAllRows<{ id: string; name: string; district: string | null }>((from, to) => supabaseAdmin
                .from('projects').select('id, name, district').eq('shop_id', shopId).order('id').range(from, to)) : [];
        const projectById = new Map(projects.map(p => [p.id, p]));
        const matchingProjectIds = projects.filter(p => p.name.toLowerCase().includes(search.toLowerCase())).map(p => p.id);
        const districtProjectIds = projects.filter(p => p.district?.toLowerCase().includes(String(args.district).toLowerCase())).map(p => p.id);

        const readListings = !args.phase && !args.block && !args.code
            && !['parking', 'industry'].includes(category) && (status === 'all' || listingStatuses.includes(status));
        const readUnits = !['house', 'land'].includes(args.type)
            && (status === 'all' || unitStatuses.includes(status)) && (!args.district || districtProjectIds.length > 0);
        let listingQuery = supabaseAdmin.from('properties')
            .select('id, project_id, name, type, price, price_per_sqm, size_sqm, rooms, bedrooms, bathrooms, floor, district, city, status, is_featured, views_count, inquiries_count')
            .eq('shop_id', shopId).eq('is_active', true).is('deleted_at', null)
            .order('created_at', { ascending: false }).limit(limit);
        if (status !== 'all' && listingStatuses.includes(status)) listingQuery = listingQuery.eq('status', status);
        if (args.type) listingQuery = listingQuery.eq('type', args.type);
        else if (args.category === 'commercial') listingQuery = listingQuery.in('type', ['office', 'commercial']);
        else if (args.category === 'residential' || args.rooms != null) listingQuery = listingQuery.eq('type', 'apartment');
        if (args.min_price != null) listingQuery = listingQuery.gte('price', Number(args.min_price));
        if (args.max_price != null) listingQuery = listingQuery.lte('price', Number(args.max_price));
        if (args.rooms != null) listingQuery = listingQuery.eq('rooms', Number(args.rooms));
        if (args.project_id) listingQuery = listingQuery.eq('project_id', args.project_id);
        if (args.district) listingQuery = listingQuery.ilike('district', `%${args.district}%`);
        if (search) listingQuery = listingQuery.or(`name.ilike.%${search}%${matchingProjectIds.length ? `,project_id.in.(${matchingProjectIds.join(',')})` : ''}`);

        let unitQuery = supabaseAdmin.from('property_units')
            .select('id, project_id, phase, block, floor, code, unit_number, category, unit_type, rooms, sale_area, window_view, status')
            .eq('shop_id', shopId).eq('category', category)
            .order('phase', { ascending: true }).order('block', { ascending: true }).order('code', { ascending: true }).limit(limit);
        if (status === 'sold') unitQuery = unitQuery.in('status', ['sold', 'handed_over']);
        else if (status !== 'all' && unitStatuses.includes(status)) unitQuery = unitQuery.eq('status', status);
        if (args.rooms != null) unitQuery = unitQuery.eq('rooms', Number(args.rooms));
        for (const field of ['phase', 'block', 'code', 'project_id']) {
            if (args[field]) unitQuery = unitQuery.eq(field, args[field]);
        }
        if (args.district && districtProjectIds.length) unitQuery = unitQuery.in('project_id', districtProjectIds);
        if (search) unitQuery = unitQuery.or(`phase.ilike.%${search}%,block.ilike.%${search}%,code.ilike.%${search}%${matchingProjectIds.length ? `,project_id.in.(${matchingProjectIds.join(',')})` : ''}`);

        const [listingResult, unitResult] = await Promise.all([
            readListings ? listingQuery : Promise.resolve({ data: [], error: null }),
            readUnits ? unitQuery : Promise.resolve({ data: [], error: null }),
        ]);
        if (listingResult.error) throw new Error(listingResult.error.message);
        if (unitResult.error) throw new Error(unitResult.error.message);
        const listings = (listingResult.data || []).map(p => ({
            source: 'properties', id: p.id, project_id: p.project_id, name: p.name, type: p.type, price: p.price,
            priceFormatted: p.price == null ? 'Үнэ бүртгэгдээгүй' : formatMNT(p.price),
            size_sqm: p.size_sqm, rooms: p.rooms, bedrooms: p.bedrooms, bathrooms: p.bathrooms,
            floor: p.floor, district: p.district, city: p.city, status: p.status,
            is_featured: p.is_featured, views_count: p.views_count, inquiries_count: p.inquiries_count,
        }));
        const units = (unitResult.data || []).map(u => ({
            source: 'property_units', id: u.id, project_id: u.project_id,
            name: [projectById.get(u.project_id)?.name, u.phase, u.block, u.unit_number || u.code].filter(Boolean).join(' · '),
            type: u.category === 'residential' ? 'apartment' : u.category, category: u.category,
            phase: u.phase, block: u.block, code: u.code, unit_number: u.unit_number, unit_type: u.unit_type,
            rooms: u.rooms, size_sqm: u.sale_area, floor: u.floor, window_view: u.window_view, status: u.status,
            district: projectById.get(u.project_id)?.district ?? null, price: null, priceFormatted: 'Үнэ бүртгэгдээгүй',
        }));
        // Үнэ байхгүй нэгжийг төсөвт багтсан гэж үзэхгүй, тусад нь тодорхойгүй хувилбараар өгнө.
        if (hasPriceFilter && units.length) {
            const unverifiedUnits = units.slice(0, Math.max(0, limit - listings.length));
            return { properties: listings, unverifiedUnits,
                message: `Үнийн шалгуурт тохирох ${listings.length} зар олдлоо; үнэ нь бүртгэгдээгүй ${unverifiedUnits.length} нэгжийн үнийг тодруулах шаардлагатай.`,
                warning: 'Нэгжийн үнэ бүртгэгдээгүй тул unverifiedUnits нь үнийн шалгуур хангасныг батлахгүй. Үнэ тодруулах шаардлагатай. Жагсаалт хязгаартай, нийт нөөцийн тоо биш.', limit };
        }
        // Нөөцийг listing байгаа үед ч уншина. Хоёр хүснэгтийн ID-г source-оор ялгана.
        return [...units, ...listings].slice(0, limit);
    } catch (error) {
        logger.error('Property inventory fetch error:', { error });
        return { error: 'Байрны нөөцийн мэдээлэл уншиж чадсангүй. Энэ нь тохирох байр байхгүй гэсэн үг биш. Дахин оролдоно уу.' };
    }
}

export async function fetchLeads(shopId: string, args: any, scope: SalesProjectScope = UNRESTRICTED_SALES_SCOPE) {
    const limit = Number.isFinite(Number(args.limit)) ? Math.min(100, Math.max(1, Math.floor(Number(args.limit)))) : 10;
    if (args.queue && !isLeadWorkQueue(args.queue)) return { error: 'Буруу ажлын жагсаалт: unassigned, uncontacted, no_followup, overdue' };
    let query = supabaseAdmin.from('leads')
        .select('id, project_id, customer_name, customer_phone, customer_email, status, source, sales_manager_name, category_id, budget_min, budget_max, preferred_type, preferred_district, preferred_rooms, urgency, notes, internal_notes, last_contact_at, next_followup_at, viewing_scheduled_at, created_at, updated_at')
        .eq('shop_id', shopId).is('deleted_at', null)
        .order(args.queue === 'overdue' ? 'next_followup_at' : 'created_at', { ascending: !!args.queue, nullsFirst: false }).limit(limit);
    query = applyLeadScope(query, scope);

    if (isLeadWorkQueue(args.queue)) query = query.or(workQueueFilter(args.queue));
    if (args.manager_name) query = query.eq('sales_manager_name', args.manager_name);
    if (args.status) query = query.eq('status', args.status);
    if (args.source) query = query.eq('source', args.source);
    if (args.urgency) query = query.eq('urgency', args.urgency);
    // Ангилал: яг нэрээр (архивласан ч болно) эсвэл «Ангилалгүй»; таарахгүй бол сонголтуудыг буцаана.
    if (typeof args.category === 'string' && args.category.trim()) {
        if (isUncategorizedInput(args.category)) query = query.is('category_id', null);
        else {
            const category = await resolveLeadCategory(supabaseAdmin, shopId, { name: args.category }, { allowArchived: true });
            if (!category.ok) return { error: category.error };
            query = query.eq('category_id', category.categoryId);
        }
    }

    const [{ data, error }, categories] = await Promise.all([
        query,
        listLeadCategories(supabaseAdmin, shopId, { includeArchived: true }).catch((): LeadCategory[] => []),
    ]);
    if (error) { logger.error('Lead fetch error:', { error }); return { error: 'Лидийн жагсаалт уншиж чадсангүй. Дахин оролдоно уу.' }; }

    return data?.map(l => ({
        // Нэргүй лидэд шошго + anonymous: true — загвар нэр зохиож харилцагчийг нэрээр дуудахгүй.
        id: l.id, project_id: l.project_id, name: leadDisplayName(l), anonymous: isAnonymousLead(l), phone: l.customer_phone, email: l.customer_email,
        status: l.status, source: l.source, sales_manager_name: l.sales_manager_name ?? null,
        category: leadCategoryLabel(categories, l.category_id),
        budget: l.budget_min && l.budget_max ? `${formatMNT(l.budget_min)} - ${formatMNT(l.budget_max)}` : l.budget_min ? `${formatMNT(l.budget_min)}+` : 'Тодорхойгүй',
        preferred_type: l.preferred_type, preferred_district: l.preferred_district, preferred_rooms: l.preferred_rooms,
        urgency: l.urgency, notes: l.notes,
        last_contact_at: l.last_contact_at, next_followup_at: l.next_followup_at, viewing_scheduled_at: l.viewing_scheduled_at,
        last_contact: l.last_contact_at ? `${formatShortDate(l.last_contact_at)} ${formatTime(l.last_contact_at)}` : null,
        next_followup: l.next_followup_at ? `${formatShortDate(l.next_followup_at)} ${formatTime(l.next_followup_at)}` : null,
        viewing: l.viewing_scheduled_at ? `${formatShortDate(l.viewing_scheduled_at)} ${formatTime(l.viewing_scheduled_at)}` : null,
        created: formatShortDate(l.created_at),
    })) || [];
}

/** Харж буй лид/гэрээний урьдчилсан уншилтыг (orchestrator/http.ts `prefetchContext`) энэ уртаар (JSON) таслана. */
export const AI_PREFETCH_MAX_CHARS = 6000;

export async function fetchLeadDetails(shopId: string, args: any, scope: SalesProjectScope = UNRESTRICTED_SALES_SCOPE) {
    let query = supabaseAdmin.from('leads').select('*, properties(id, name, price, type, size_sqm, rooms, district, status)').eq('shop_id', shopId).is('deleted_at', null);
    query = applyLeadScope(query, scope);
    if (args.lead_id) query = query.eq('id', args.lead_id);
    else if (args.customer_name) query = query.ilike('customer_name', `%${args.customer_name}%`);
    else return { error: 'lead_id эсвэл customer_name шаардлагатай' };

    const { data, error } = await query.limit(1).maybeSingle();
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

    const [{ data: viewings }, timeline] = await Promise.all([
        runExcludingDeleted((excludeDeleted) => {
            let q = supabaseAdmin.from('property_viewings')
                .select('id, scheduled_at, status, property_id, customer_feedback, agent_notes')
                .eq('lead_id', data.id).order('scheduled_at', { ascending: false }).limit(5);
            if (excludeDeleted) q = q.is('deleted_at', null);
            return q;
        }),
        // Менежерүүдийн Time-line (хэн хэзээ холбогдсон, үнийн санал, зөрчил) — UI-тай ижил loader.
        loadLeadTimeline(supabaseAdmin, shopId, data, scope)
            .then(({ timeline }) => timeline)
            .catch((error: unknown) => {
                logger.warn('[AI get_lead_details] manager history failed', { error });
                return null;
            }),
    ]);

    const details = {
        lead: {
            id: data.id, project_id: data.project_id, name: leadDisplayName(data), anonymous: isAnonymousLead(data), phone: data.customer_phone, email: data.customer_email,
            status: data.status, source: data.source, budget_min: data.budget_min, budget_max: data.budget_max,
            category: data.category_id ? (await leadCategoryName(supabaseAdmin, shopId, data.category_id)) ?? '—' : UNCATEGORIZED_LABEL,
            preferred_type: data.preferred_type, preferred_district: data.preferred_district,
            preferred_rooms: data.preferred_rooms, urgency: data.urgency, notes: data.notes,
            internal_notes: data.internal_notes, created_at: data.created_at,
            last_contact_at: data.last_contact_at, next_followup_at: data.next_followup_at,
            sales_manager_name: data.sales_manager_name ?? null,
        },
        linkedProperty: data.properties || null,
        matchingProperties,
        viewings: viewings || [],
    };
    // Менежерийн түүх ХАМГИЙН СҮҮЛД, үлдсэн зайд багтахаар (prefetch таслахад уулзалт, байр хадгалагдана).
    const room = AI_PREFETCH_MAX_CHARS - JSON.stringify(details).length - ',"manager_history":'.length;
    return {
        ...details,
        manager_history: timeline
            ? compactLeadTimelineWithin(timeline, room)
            : { error: 'Менежерийн түүх уншигдсангүй. Холбоо бариагүй гэж бүү дүгнэ.' },
    };
}

export async function fetchCustomerInsights(shopId: string, args: any, scope: SalesProjectScope = UNRESTRICTED_SALES_SCOPE) {
    const limit = args.limit || 10;
    const customerSelect = 'id, name, phone, email, address, tags, notes, message_count, last_contact_at, created_at, facebook_id, instagram_id';

    // ---- Single-customer details ----
    if (args.customer_id) {
        // shop_id шүүлт заавал — өмнө нь ID мэдэж байвал өөр shop-ийн харилцагчийг уншдаг байв.
        const { data: customer } = await runExcludingDeleted((excludeDeleted) => {
            let q = supabaseAdmin.from('customers')
                .select(customerSelect)
                .eq('id', args.customer_id)
                .eq('shop_id', shopId);
            if (excludeDeleted) q = q.is('deleted_at', null);
            return q.maybeSingle();
        });
        if (!customer) return { error: 'Харилцагч олдсонгүй' };

        const { data: leads } = await applyLeadScope(supabaseAdmin.from('leads')
            .select('id, status, source, preferred_type, preferred_district, preferred_rooms, budget_min, budget_max, urgency, created_at, last_contact_at')
            .eq('customer_id', args.customer_id).eq('shop_id', shopId).is('deleted_at', null)
            .order('created_at', { ascending: false }), scope);

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
    // Шилжүүлсэн гэрээ өмнөх эзэмшигчийн нэр/утас/регистрээр ч олдоно.
    let previousHolderIds: string[] = [];
    if (args.customer_search) {
        try { previousHolderIds = await contractIdsByPreviousHolder(supabaseAdmin, shopId, String(args.customer_search)); }
        catch (e: any) { return { error: `Алдаа: ${e?.message || e}` }; }
    }
    const { data, error } = await runExcludingDeleted((excludeDeleted) => {
        let query = supabaseAdmin.from('property_contracts')
            .select(CONTRACT_LIST_FIELDS)
            .eq('shop_id', shopId)
            .order('contract_date', { ascending: false, nullsFirst: false })
            .limit(limit);
        if (excludeDeleted) query = query.is('deleted_at', null);
        if (args.status) query = query.eq('contract_status', args.status);
        if (args.customer_search) query = query.or(`customer_name.ilike.%${args.customer_search}%,customer_phone.ilike.%${args.customer_search}%,customer_registration.ilike.%${args.customer_search}%${previousHolderIds.length ? `,id.in.(${previousHolderIds.join(',')})` : ''}`);
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
            total_price_fmt: c.total_price != null ? formatMNT(c.total_price) : '-',
            paid_amount_fmt: c.paid_amount != null ? formatMNT(c.paid_amount) : '-',
            balance_fmt: c.balance != null ? formatMNT(c.balance) : '-',
        })),
        count: data?.length || 0,
    };
}

export async function fetchContractDetails(shopId: string, args: any) {
    if (!args.contract_id && !args.contract_number && !args.customer_phone) {
        return { error: 'contract_id, contract_number эсвэл customer_phone шаардлагатай' };
    }
    const { data, error } = await runExcludingDeleted((excludeDeleted) => {
        let query = supabaseAdmin.from('property_contracts')
            .select(CONTRACT_DETAIL_FIELDS)
            .eq('shop_id', shopId)
            .limit(1);
        if (excludeDeleted) query = query.is('deleted_at', null);
        if (args.contract_id) query = query.eq('id', args.contract_id);
        else if (args.contract_number) query = query.eq('contract_number', args.contract_number);
        else query = query.eq('customer_phone', args.customer_phone);
        return query.maybeSingle();
    });
    if (error) return { error: `Алдаа: ${error.message}` };
    let contract: any = data;
    let matchedPreviousHolder = false;
    if (!contract && !args.contract_id && !args.contract_number && args.customer_phone) {
        // Утас нь өмнөх эзэмшигчийнх байж болно (гэрээ өөр хүнд шилжсэн).
        let ids: string[];
        try { ids = await contractIdsByPreviousHolder(supabaseAdmin, shopId, String(args.customer_phone)); }
        catch (e: any) { return { error: `Алдаа: ${e?.message || e}` }; }
        if (ids.length) {
            const previous = await supabaseAdmin.from('property_contracts').select(CONTRACT_DETAIL_FIELDS)
                .eq('shop_id', shopId).is('deleted_at', null).in('id', ids).limit(1).maybeSingle();
            if (previous.error) return { error: `Алдаа: ${previous.error.message}` };
            contract = previous.data;
            matchedPreviousHolder = !!contract;
        }
    }
    if (!contract) return { error: 'Гэрээ олдсонгүй' };
    // Эзэмшигчийн сүүлийн 10 өөрчлөлт (хураангуй, регистргүй).
    const history = await listContractTransfers(supabaseAdmin, shopId, contract.id, 10);

    return {
        contract: {
            ...contract,
            total_price_fmt: contract.total_price != null ? formatMNT(contract.total_price) : '-',
            paid_amount_fmt: contract.paid_amount != null ? formatMNT(contract.paid_amount) : '-',
            balance_fmt: contract.balance != null ? formatMNT(contract.balance) : '-',
            first_price_fmt: contract.first_price != null ? formatMNT(contract.first_price) : '-',
            prepayment_due_fmt: contract.prepayment_due != null ? formatMNT(contract.prepayment_due) : '-',
            prepayment_paid_fmt: contract.prepayment_paid != null ? formatMNT(contract.prepayment_paid) : '-',
        },
        ...(matchedPreviousHolder ? { note: 'Утас нь гэрээний өмнөх эзэмшигчийнх. Гэрээ одоо өөр хүний нэр дээр байна.' } : {}),
        ...('error' in history ? { transfers_error: history.error } : {
            transfers: history.transfers.map(t => ({
                kind: t.kind, effective_date: t.effective_date, from: t.from_customer_name, to: t.to_customer_name,
                reason: t.reason, recorded_by: t.created_by_name,
            })),
        }),
    };
}

export async function fetchContractsSummary(shopId: string, args: any) {
    // Бүх гэрээг татна — энгийн .select() нь ~1000 мөрөнд тасардаг тул AI
    // нэгтгэсэн тоо (нийт борлуулалт/үлдэгдэл)-г бодитоос бага мэдээлж байсан.
    let data: Array<{
        contract_status: string | null; total_price: number | null; paid_amount: number | null;
        balance: number | null; overdue_days: number | null; sales_manager: string | null;
        sales_channel: string | null; block_name: string | null; product_type: string | null;
    }>;
    try {
        data = await fetchAllRows((from, to) => {
            let query = supabaseAdmin.from('property_contracts')
                .select('contract_status, total_price, paid_amount, balance, overdue_days, sales_manager, sales_channel, block_name, product_type')
                .eq('shop_id', shopId)
                .is('deleted_at', null); // устгасан гэрээ нийт дүнд орохгүй (dashboards-тай нэг тоо)
            if (args.block_name) query = query.ilike('block_name', `%${args.block_name}%`);
            if (args.sales_channel) query = query.eq('sales_channel', args.sales_channel);
            return query.range(from, to);
        });
    } catch (e: any) {
        return { error: `Алдаа: ${e?.message || e}` };
    }
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
        total_contract_value: formatMNT(totals.total_price),
        total_collected: formatMNT(totals.paid_amount),
        total_outstanding: formatMNT(totals.balance),
        collection_rate_pct: totals.total_price > 0 ? Math.round((totals.paid_amount / totals.total_price) * 1000) / 10 : 0,
        topManagers: Object.entries(byManager)
            .sort((a, b) => b[1].total - a[1].total)
            .slice(0, 5)
            .map(([name, v]) => ({ name, contracts: v.count, total: formatMNT(v.total), balance: formatMNT(v.balance) })),
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
        totalRevenue: formatMNT(totalRevenue),
        avgPrice: formatMNT(avgPrice),
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
        price: formatMNT(p.price),
        pricePerSqm: p.price_per_sqm ? `${formatMNT(p.price_per_sqm)}/м²` : '-',
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
// WRITE FUNCTIONS — UPDATE (confirm-gated)
// ============================================
// Бүх өөрчлөлт хийх tool confirm=false үед зөвхөн preview буцаана; confirm=true үед
// (action endpoint-оос, RBAC дахин шалгасны дараа) л бодит update хийнэ. Өмнө нь эдгээр
// 6 tool confirm-гүй шууд ажиллаж, audit-д ч бүртгэгддэггүй байсан (2026-09 review H1).

const PROPERTY_STATUSES = ['available', 'reserved', 'sold', 'rented', 'barter'];
const LEAD_STATUSES_FOR_AI = ['new', 'contacted', 'viewing_scheduled', 'offered', 'negotiating', 'closed_won', 'closed_lost'];
const CONTRACT_STATUSES = ['active', 'closed', 'cancelled'];

interface PropertyRow { id: string; name: string | null; status: string | null }

/** Listing байрыг (properties) ID эсвэл нэрээр нэг утгатай олно. */
async function findProperty(shopId: string, args: any): Promise<{ property: PropertyRow } | { error: string; options?: unknown[] }> {
    let query = supabaseAdmin.from('properties').select('id, name, status').eq('shop_id', shopId).is('deleted_at', null);
    if (args.property_id) query = query.eq('id', args.property_id);
    else if (args.property_name) query = query.ilike('name', `%${args.property_name}%`);
    else return { error: 'property_id эсвэл property_name шаардлагатай' };

    const { data: properties, error } = await query.limit(20);
    if (error) return { error: 'Байр шалгахад алдаа гарлаа' };
    if (!properties || properties.length === 0) return { error: 'Байр олдсонгүй' };
    if (properties.length > 1) return { error: `${properties.length} байр олдлоо, ID-г тодруулна уу`, options: properties.map(p => ({ id: p.id, name: p.name, status: p.status })) };
    return { property: properties[0] as PropertyRow };
}

export async function updatePropertyStatus(shopId: string, args: any, confirm = false) {
    if (!PROPERTY_STATUSES.includes(args.new_status)) {
        return { error: `Төлөв буруу. Боломжтой: ${PROPERTY_STATUSES.join(', ')}` };
    }
    const found = await findProperty(shopId, args);
    if ('error' in found) return found;
    const prop = found.property;
    const oldStatus = prop.status;
    if (!confirm) {
        return confirmNeeded('update_property_status',
            { property_id: prop.id, new_status: args.new_status },
            `Байрны төлөв өөрчлөх: ${prop.name}`,
            { Байр: prop.name, 'Одоогийн төлөв': oldStatus, 'Шинэ төлөв': args.new_status });
    }
    const { error } = await supabaseAdmin.from('properties').update({ status: args.new_status }).eq('id', prop.id).eq('shop_id', shopId);
    if (error) return { error: `Алдаа: ${error.message}` };
    return { success: true, property: prop.name, oldStatus, newStatus: args.new_status };
}

export async function updatePropertyPrice(shopId: string, args: any, confirm = false) {
    const newPrice = Number(args.new_price);
    if (!Number.isFinite(newPrice) || newPrice <= 0) return { error: 'new_price эерэг тоо байх ёстой' };
    let query = supabaseAdmin.from('properties').select('id, name, price').eq('shop_id', shopId).is('deleted_at', null);
    if (args.property_id) query = query.eq('id', args.property_id);
    else if (args.property_name) query = query.ilike('name', `%${args.property_name}%`);
    else return { error: 'property_id эсвэл property_name шаардлагатай' };

    const { data: properties } = await query.limit(20);
    if (!properties || properties.length === 0) return { error: 'Байр олдсонгүй' };
    if (properties.length > 1) return { error: `${properties.length} байр олдлоо, ID-г тодруулна уу`, options: properties.map(p => ({ id: p.id, name: p.name, price: p.price })) };

    const prop = properties[0];
    const oldPrice = prop.price;
    if (!confirm) {
        return confirmNeeded('update_property_price',
            { property_id: prop.id, new_price: newPrice },
            `Байрны үнэ өөрчлөх: ${prop.name}`,
            { Байр: prop.name, 'Одоогийн үнэ': formatMNT(oldPrice), 'Шинэ үнэ': formatMNT(newPrice) });
    }
    const { error } = await supabaseAdmin.from('properties').update({ price: newPrice }).eq('id', prop.id).eq('shop_id', shopId);
    if (error) return { error: `Алдаа: ${error.message}` };
    return { success: true, property: prop.name, oldPrice: formatMNT(oldPrice), newPrice: formatMNT(newPrice) };
}

// property_units.status enum (Мандала Гарден маягийн бодит нөөцийн грид)
const UNIT_STATUSES: readonly string[] = ['available', 'reserved', 'ordered', 'sold', 'handed_over'] satisfies InventoryStatus[];
/** «Хүлээлгэсэн» = зарагдаад худалдан авагчид хүлээлгэн өгсөн (эзэмшигч 2026-10-05): зарагдсанд тооцно, хэзээ ч худалдаанд биш. */
const SOLD_UNIT_STATUSES: readonly string[] = ['sold', 'handed_over'];

interface UnitRow { id: string; code: string | null; unit_number: string | null; block: string | null; phase: string | null; status: string | null }

const unitLabelOf = (unit: UnitRow) => unit.code || unit.unit_number || unit.id;

/** Нэгжийг ID/код/тоотоор (блок, ээлжээр нарийсгаж) нэг утгатай олно. */
async function findUnit(shopId: string, args: any): Promise<{ unit: UnitRow } | { error: string; options?: unknown[] }> {
    let query = supabaseAdmin
        .from('property_units')
        .select('id, code, unit_number, block, phase, status')
        .eq('shop_id', shopId);

    if (args.unit_id) query = query.eq('id', args.unit_id);
    else if (args.code) query = query.ilike('code', `%${args.code}%`);
    else if (args.unit_number) query = query.ilike('unit_number', `%${args.unit_number}%`);
    else return { error: 'code, unit_number эсвэл unit_id шаардлагатай' };

    if (args.block) query = query.eq('block', args.block);
    if (args.phase) query = query.ilike('phase', `%${args.phase}%`);

    const { data: units, error } = await query.limit(50);
    if (error) return { error: 'Нэгж шалгахад алдаа гарлаа' };
    if (!units || units.length === 0) return { error: 'Нэгж олдсонгүй' };
    if (units.length > 1) {
        return {
            error: `${units.length} нэгж олдлоо, код/блокоор тодруулна уу`,
            options: units.slice(0, 10).map(u => ({ id: u.id, code: u.code, unit_number: u.unit_number, block: u.block, phase: u.phase, status: u.status, statusLabel: unitStatusLabel(u.status) })),
        };
    }
    return { unit: units[0] as UnitRow };
}

/** Preview-ээс хойш төлөв өөрчлөгдсөн: хэрэглэгчийн батлаагүй шилжилтийг хийхгүй. */
function statusChanged(subject: string, change = ''): { error: string } {
    return { error: `${subject}: төлөв энэ хооронд өөрчлөгдсөн байна${change}. Дахин шалгаад үйлдлийг шинээр хүснэ үү.` };
}

/**
 * Баталгаажуулалт (confirm) preview-д харуулсан төлөвтэй (args[key]) тулгана: preview-ийн
 * args нь тэр төлөвийг агуулдаг. Өөр бол (жишээ нь энэ хооронд зарагдсан) алдаа буцаана —
 * хэрэглэгч хараагүй төлөвөөс шилжүүлэхгүй. Төлөвгүй (хуучин) preview-г ч хүлээж авахгүй.
 */
function previewStatusDrift(args: any, key: string, subject: string, current: string | null, label: (status: string | null) => string): { error: string } | null {
    const expected = args && Object.hasOwn(args, key) ? args[key] : undefined;
    if (expected !== null && typeof expected !== 'string') {
        return { error: 'Баталгаажуулалтад урьдчилан харсан төлөв алга байна. Үйлдлийг дахин хүснэ үү.' };
    }
    return expected === current ? null : statusChanged(subject, ` («${label(expected)}» → «${label(current)}»)`);
}

/** Баталсан (preview-д харуулсан) төлөв хэвээр байвал л бичнэ (compare-and-set): уншсаны дараах өөрчлөлтийг дарж бичихгүй. */
async function writeUnitStatus(shopId: string, unit: UnitRow, expected: string | null, newStatus: string): Promise<{ error: string } | null> {
    let query = supabaseAdmin
        .from('property_units')
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq('id', unit.id)
        .eq('shop_id', shopId);
    query = expected === null ? query.is('status', null) : query.eq('status', expected);
    const { data, error } = await query.select('id');
    if (error) return { error: `Алдаа: ${error.message}` };
    return data?.length ? null : statusChanged(`Нэгж ${unitLabelOf(unit)}`);
}

/** Listing байрны төлөвийг баталсан төлөв хэвээр байвал л бичнэ (compare-and-set). */
async function writePropertyStatus(shopId: string, property: PropertyRow, expected: string | null, newStatus: string): Promise<{ error: string } | null> {
    let query = supabaseAdmin
        .from('properties')
        .update({ status: newStatus })
        .eq('id', property.id)
        .eq('shop_id', shopId)
        .is('deleted_at', null);
    query = expected === null ? query.is('status', null) : query.eq('status', expected);
    const { data, error } = await query.select('id');
    if (error) return { error: `Алдаа: ${error.message}` };
    return data?.length ? null : statusChanged(`Байр ${property.name || property.id}`);
}

/**
 * Нэгжийн (property_units) төлөвийг өөрчилнө — "байр зарагдсан" гэх мэт.
 * property_units бол Мандала Гарден маягийн ээлж→блок→нэгж бүтэцтэй бодит нөөц;
 * `properties` (зурагтай listing) хүснэгтээс тусдаа тул энэ tool-оор шинэчилнэ.
 * Гэрээний үйлдэл зарагдсан нэгжийг ухраадаггүй тул тийм засварыг ЭНЭ tool-оор ил хийнэ.
 */
export async function updateUnitStatus(shopId: string, args: any, confirm = false) {
    const newStatus = args.new_status;
    if (!UNIT_STATUSES.includes(newStatus)) {
        return { error: `Төлөв буруу. Боломжтой: ${UNIT_STATUSES.join(', ')}` };
    }

    const found = await findUnit(shopId, args);
    if ('error' in found) return found;
    const { unit } = found;
    const oldStatus = unit.status;
    const label = unitLabelOf(unit);
    if (!confirm) {
        const preview: Record<string, unknown> = { Нэгж: label, Блок: unit.block || '-', 'Одоогийн төлөв': unitStatusLabel(oldStatus), 'Шинэ төлөв': unitStatusLabel(newStatus) };
        // Картын мөр нэг мөрөнд таслагддаг тул товч.
        if (oldStatus && SOLD_UNIT_STATUSES.includes(oldStatus) && !SOLD_UNIT_STATUSES.includes(newStatus)) {
            preview['Анхааруулга'] = 'Зарагдсаныг буцаана, гэрээг шалгана уу';
        }
        return confirmNeeded('update_unit_status', { unit_id: unit.id, new_status: newStatus, expected_status: oldStatus }, `Нэгжийн төлөв өөрчлөх: ${label}`, preview);
    }
    // Preview-д харуулснаас өөр төлөвтэй бол (жишээ нь энэ хооронд зарагдсан) анхааруулгагүйгээр дарж бичихгүй.
    const drift = previewStatusDrift(args, 'expected_status', `Нэгж ${label}`, oldStatus, unitStatusLabel);
    if (drift) return drift;
    const failed = await writeUnitStatus(shopId, unit, oldStatus, newStatus);
    if (failed) return failed;

    return { success: true, unit: label, block: unit.block, oldStatus, newStatus };
}

/** Гэрээний үйлдлийн нэгж/байрны алхам: дараагийн төлөв, эсвэл өөрчлөхгүй шалтгаан (skip — бүтэн, note — картад товч). */
export type ContractInventoryStep = { next: string } | { skip: string; note: string };

interface ContractStepRules {
    /** Үр дүн, баталгаажуулалтын args-ийн түлхүүр (`unit_id`, `unit_status` …). */
    entity: 'unit' | 'property';
    /** «Нэгж» / «Байр» ба харьяалахын тийн ялгал (өгүүлбэрийн эхэнд, дунд). */
    subject: string;
    Of: string;
    of: string;
    steps: Record<string, { from: readonly string[]; to: string }>;
    known: readonly string[];
    /** Цуцлалт худалдаанд буцаахгүй (зарагдсан гэх мэт) төлөвүүд. */
    keepOnCancel: readonly string[];
    label: (status: string | null) => string;
    gloss?: Record<string, string>;
}

/**
 * Гэрээний үйлдэл нэгжийг зөвхөн урагш шилжүүлнэ: зарагдсан/хүлээлгэсэн нэгж хэзээ ч ухрахгүй.
 * sign: Чөлөөтэй → Хадгалсан; paid: Чөлөөтэй/Хадгалсан/Захиалсан → Зарагдсан;
 * cancel: Хадгалсан/Захиалсан → Чөлөөтэй (зарагдсан/хүлээлгэсэнийг өөрчлөхгүй).
 */
const UNIT_CONTRACT_RULES: ContractStepRules = {
    entity: 'unit', subject: 'Нэгж', Of: 'Нэгжийн', of: 'нэгжийн', known: UNIT_STATUSES, keepOnCancel: SOLD_UNIT_STATUSES, label: unitStatusLabel,
    gloss: { handed_over: 'зарагдаад хүлээлгэн өгсөн' },
    steps: {
        sign: { from: ['available'], to: 'reserved' },
        paid: { from: ['available', 'reserved', 'ordered'], to: 'sold' },
        cancel: { from: ['reserved', 'ordered'], to: 'available' },
    },
};

/** Listing байр (properties) ч мөн адил: зарагдсан, түрээслэсэн, бартер байрыг гэрээний үйлдэл буцаахгүй. */
const LISTING_CONTRACT_RULES: ContractStepRules = {
    entity: 'property', subject: 'Байр', Of: 'Байрны', of: 'байрны', known: PROPERTY_STATUSES, keepOnCancel: ['sold', 'rented', 'barter'], label: propertyStatusLabel,
    steps: {
        sign: { from: ['available'], to: 'reserved' },
        paid: { from: ['available', 'reserved'], to: 'sold' },
        cancel: { from: ['reserved'], to: 'available' },
    },
};

function contractStep(rules: ContractStepRules, action: string, current: string | null): ContractInventoryStep {
    const step = rules.steps[action];
    if (step && current && step.from.includes(current)) return { next: step.to };
    const now = `«${rules.label(current)}»`;
    if (!current || !rules.known.includes(current)) {
        return {
            skip: `${rules.Of} төлөв ${now} тодорхойгүй тул автоматаар өөрчлөхгүй. Шалгаад ${rules.of} төлөвийг тусад нь өөрчилнө үү.`,
            note: 'Тодорхойгүй төлөв — тусад нь засна уу',
        };
    }
    if (action === 'cancel' && rules.keepOnCancel.includes(current)) {
        const gloss = rules.gloss?.[current];
        return {
            skip: `${rules.subject} ${now}${gloss ? ` (${gloss})` : ''} тул цуцлалтаар худалдаанд буцаахгүй. Гэрээ, төлбөрийг шалгаад шаардлагатай бол ${rules.of} төлөвийг тусад нь өөрчилнө үү.`,
            note: 'Буцаахгүй — шалгаад тусад нь засна уу',
        };
    }
    return { skip: `${rules.subject} аль хэдийн ${now} төлөвтэй тул өөрчлөхгүй.`, note: 'Аль хэдийн энэ төлөвтэй' };
}

/** Нэгжийн одоогийн төлөвөөс гэрээний үйлдлийн дараах төлөв, эсвэл өөрчлөхгүй шалтгаан. */
export const contractUnitStep = (action: string, current: string | null) => contractStep(UNIT_CONTRACT_RULES, action, current);
/** Listing байрны одоогийн төлөвөөс гэрээний үйлдлийн дараах төлөв, эсвэл өөрчлөхгүй шалтгаан. */
export const contractListingStep = (action: string, current: string | null) => contractStep(LISTING_CONTRACT_RULES, action, current);

export async function updateLeadStatus(shopId: string, args: any, confirm = false, scope: SalesProjectScope = UNRESTRICTED_SALES_SCOPE, actor?: LeadActor) {
    if (!LEAD_STATUSES_FOR_AI.includes(args.new_status)) {
        return { error: `Төлөв буруу. Боломжтой: ${LEAD_STATUSES_FOR_AI.join(', ')}` };
    }
    let query = supabaseAdmin.from('leads').select('id, customer_name, status, lost_reason').eq('shop_id', shopId).is('deleted_at', null);
    query = applyLeadScope(query, scope);
    if (args.lead_id) query = query.eq('id', args.lead_id);
    else if (args.customer_name) query = query.ilike('customer_name', `%${args.customer_name}%`);
    else return { error: 'lead_id эсвэл customer_name шаардлагатай' };

    const { data: leads, error: readError } = await query.limit(20);
    if (readError) return { error: 'Лид шалгахад алдаа гарлаа' };
    if (!leads || leads.length === 0) return { error: 'Лийд олдсонгүй' };
    if (leads.length > 1) return { error: `${leads.length} лийд олдлоо, тодруулна уу`, options: leads.map(l => ({ id: l.id, name: leadDisplayName(l), status: l.status })) };

    const lead = leads[0];
    const oldStatus = lead.status;
    const lostReason = args.lost_reason === undefined ? lead.lost_reason : typeof args.lost_reason === 'string' ? args.lost_reason.trim().slice(0, 300) : null;
    if (args.new_status === 'closed_lost' && !lostReason) return { error: 'Алдсан шалтгааныг (lost_reason) хэрэглэгчээс тодруулна уу' };
    // Хоосон stub / цуцалсан гэрээг бодит борлуулалтад тооцохгүй.
    if (args.new_status === 'closed_won' && oldStatus !== 'closed_won') {
        const { data: contracts, error: contractError } = await supabaseAdmin.from('property_contracts')
            .select('contract_number, total_price, contract_status')
            .eq('lead_id', lead.id).eq('shop_id', shopId).is('deleted_at', null);
        if (contractError) return { error: 'Лидийн гэрээ шалгахад алдаа гарлаа' };
        if (!contracts?.some(hasRealContractFields)) return { error: `"${leadDisplayName(lead)}" лидэд хүчинтэй, дугаартай, дүнтэй гэрээ бүртгэгдээгүй байна. Эхлээд гэрээг бүртгээд дараа нь статусыг closed_won болго.` };
    }
    if (!confirm) {
        return confirmNeeded('update_lead_status',
            { lead_id: lead.id, new_status: args.new_status, lost_reason: args.new_status === 'closed_lost' ? lostReason : null },
            `Лийдийн төлөв өөрчлөх: ${leadDisplayName(lead)}`,
            { Лийд: leadDisplayName(lead), 'Одоогийн төлөв': oldStatus, 'Шинэ төлөв': args.new_status, ...(args.new_status === 'closed_lost' ? { 'Алдсан шалтгаан': lostReason } : {}) });
    }
    const { data, error } = await applyLeadScope(supabaseAdmin.from('leads')
        .update({ status: args.new_status, lost_reason: args.new_status === 'closed_lost' ? lostReason : null, updated_at: new Date().toISOString() })
        .eq('id', lead.id)
        .eq('shop_id', shopId).is('deleted_at', null).select('id').maybeSingle(), scope);
    if (error) return { error: `Алдаа: ${error.message}` };
    if (!data) return { error: 'Лид олдсонгүй. Төлөв өөрчлөгдөөгүй.' };
    if (oldStatus !== args.new_status) {
        await logStatusChange(shopId, lead.id, oldStatus, args.new_status, args.new_status === 'closed_lost' ? lostReason : null, actor);
    }
    return { success: true, lead: leadDisplayName(lead), oldStatus, newStatus: args.new_status };
}

/**
 * Лидэд тэмдэглэл — UI-тай ижил үйл ажиллагааны түүхэнд (lead_activities 'note') нэвтэрсэн
 * хэрэглэгчийн нэрээр бичнэ (менежерийн Time-line-д харагдана). leads.notes-ийг өөрчлөхгүй.
 */
export async function addLeadNote(shopId: string, args: any, confirm = false, scope: SalesProjectScope = UNRESTRICTED_SALES_SCOPE, actor?: LeadActor) {
    const note = typeof args.note === 'string' ? args.note.trim().slice(0, 4000) : '';
    if (!note) return { error: 'note (тэмдэглэлийн текст) шаардлагатай' };
    let query = supabaseAdmin.from('leads').select('id, project_id, customer_name').eq('shop_id', shopId).is('deleted_at', null);
    query = applyLeadScope(query, scope);
    if (args.lead_id) query = query.eq('id', args.lead_id);
    else if (args.customer_name) query = query.ilike('customer_name', `%${args.customer_name}%`);
    else return { error: 'lead_id эсвэл customer_name шаардлагатай' };

    const { data: leads, error: readError } = await query.limit(20);
    if (readError) return { error: 'Лид шалгахад алдаа гарлаа' };
    if (!leads || leads.length === 0) return { error: 'Лийд олдсонгүй' };
    // Өмнө нь нэр давхцвал чимээгүй эхний лийдэд бичдэг байсан — одоо тодруулна.
    if (leads.length > 1) return { error: `${leads.length} лийд олдлоо, тодруулна уу`, options: leads.map(l => ({ id: l.id, project_id: l.project_id, name: leadDisplayName(l) })) };

    const lead = leads[0];
    if (!confirm) {
        return confirmNeeded('add_lead_note',
            { lead_id: lead.id, note },
            `Лийдэд тэмдэглэл нэмэх: ${leadDisplayName(lead)}`,
            { Лийд: leadDisplayName(lead), Тэмдэглэл: note.slice(0, 200) });
    }
    const result = await recordLeadContact(supabaseAdmin, {
        shopId, leadId: lead.id, type: 'note', content: note, scope,
        userId: actor?.userId ?? null, managerName: actor?.userName || null,
    });
    if (!result.ok) return { error: result.error };
    return { success: true, lead: leadDisplayName(lead), note };
}

/** Гэрээний (property_contracts) статусыг код/дугаараар өөрчилнө (confirm-gated). */
export async function updateContractStatus(shopId: string, args: any, confirm = false) {
    if (!CONTRACT_STATUSES.includes(args.new_status)) {
        return { error: `Төлөв буруу. Боломжтой: ${CONTRACT_STATUSES.join(', ')}` };
    }
    let query = supabaseAdmin
        .from('property_contracts')
        .select('id, contract_number, contract_status, customer_name')
        .eq('shop_id', shopId)
        .is('deleted_at', null);
    if (args.contract_id) query = query.eq('id', args.contract_id);
    else if (args.contract_number) query = query.ilike('contract_number', `%${args.contract_number}%`);
    else return { error: 'contract_id эсвэл contract_number шаардлагатай' };

    const { data: rows } = await query.limit(20);
    if (!rows || rows.length === 0) return { error: 'Гэрээ олдсонгүй' };
    if (rows.length > 1) {
        return {
            error: `${rows.length} гэрээ олдлоо, дугаараар тодруулна уу`,
            options: rows.slice(0, 10).map(r => ({ id: r.id, contract_number: r.contract_number, status: r.contract_status })),
        };
    }
    const c = rows[0];
    if (!confirm) {
        return confirmNeeded('update_contract_status',
            { contract_id: c.id, new_status: args.new_status },
            `Гэрээний төлөв өөрчлөх: ${c.contract_number || c.customer_name}`,
            { Гэрээ: c.contract_number || '-', Харилцагч: c.customer_name || '-', 'Одоогийн төлөв': c.contract_status, 'Шинэ төлөв': args.new_status });
    }
    const { error } = await supabaseAdmin
        .from('property_contracts')
        .update({ contract_status: args.new_status, updated_at: new Date().toISOString() })
        .eq('id', c.id)
        .eq('shop_id', shopId);
    if (error) return { error: `Алдаа: ${error.message}` };
    return { success: true, contract: c.contract_number, oldStatus: c.contract_status, newStatus: args.new_status };
}

/**
 * Мандала маягийн нэгж (property_units), listing байр (properties), лийд, гэрээний
 * статусыг action-оор нэгтгэж шинэчилнэ. confirm=false үед бүх зорилтыг олж НЭГ
 * нэгдсэн preview буцаана; confirm=true үед preview-д тогтсон ID-уудаар бодитоор шинэчилнэ.
 * Нэгж/байрны preview-д харуулсан төлөв args-д дамжина; баталгаажуулахад өөрчлөгдсөн бол юу ч бичихгүй.
 */
export async function processContractAction(shopId: string, args: any, confirm = false, scope: SalesProjectScope = UNRESTRICTED_SALES_SCOPE, actor?: LeadActor): Promise<any> {
    // Баталгаажуулалтын хооронд өгөгдөл өөрчлөгдөж болно; бүх зорилтын дүрмийг бичихээс өмнө дахин шалгана.
    if (confirm) {
        const checked = await processContractAction(shopId, args, false, scope);
        if (checked.error) return checked;
    }
    // Нэгж/байрны шилжилт одоогийн төлөвөөс хамаарна (UNIT_/LISTING_CONTRACT_RULES).
    const statusMap: Record<string, { label: string; lead: string; contract: string }> = {
        sign:   { label: 'Гарын үсэг',    lead: 'negotiating', contract: 'active' },
        paid:   { label: 'Бүрэн төлбөр',  lead: 'closed_won',  contract: 'closed' },
        cancel: { label: 'Цуцлалт',       lead: 'closed_lost', contract: 'cancelled' },
    };

    const mapping = statusMap[args.action];
    if (!mapping) return { error: 'action буруу: sign, paid, cancel байх ёстой' };

    const results: any = { action: args.action, changes: [] };
    const resolvedArgs: Record<string, unknown> = { action: args.action };
    const preview: Record<string, unknown> = { Үйлдэл: mapping.label };
    const labels: string[] = [];
    const notFound = 'Нэгж/гэрээ/лийд олдсонгүй. Нэгжийн код, гэрээний дугаар эсвэл харилцагчийн нэрийг тодорхой өгнө үү.';

    /**
     * Нэгж эсвэл listing байрны алхам: одоогийн төлөвийг уншаад зөвхөн урагш шилжүүлнэ (contractStep),
     * өөрчлөхгүй бол шалтгааныг preview-д хэлнэ. Preview-д харуулсан төлөв args-д (unit_status /
     * property_status) дамжиж, баталгаажуулахад тулгагдана: өөрчлөгдсөн бол юу ч бичихгүй.
     */
    const inventoryStep = async (
        rules: ContractStepRules,
        target: { id: string; status: string | null; label: string },
        write: (expected: string | null, next: string) => Promise<{ error: string } | null>,
    ) => {
        const { entity, subject, Of, label } = rules;
        const drift = confirm ? previewStatusDrift(args, `${entity}_status`, `${subject} ${target.label}`, target.status, label) : null;
        if (drift) return drift;
        resolvedArgs[`${entity}_id`] = target.id;
        resolvedArgs[`${entity}_status`] = target.status;
        preview[subject] = target.label;
        const step = contractStep(rules, args.action, target.status);
        if ('skip' in step) {
            preview[`${Of} төлөв`] = `${label(target.status)} (өөрчлөхгүй)`;
            preview[`${Of} тайлбар`] = step.note;
            return { skipped: true, [entity]: target.label, status: target.status, reason: step.skip };
        }
        preview[`${Of} төлөв`] = `${label(target.status)} → ${label(step.next)}`;
        labels.push(target.label);
        if (!confirm) return null;
        const failed = await write(target.status, step.next);
        if (failed) return failed;
        results.changes.push(`${subject} ${target.label} → ${label(step.next)}`);
        return { success: true, [entity]: target.label, oldStatus: target.status, newStatus: step.next };
    };

    // Нэгж (property_units) → байхгүй бол listing property руу шилжинэ.
    if (args.code || args.unit_number || args.unit_id) {
        const found = await findUnit(shopId, { unit_id: args.unit_id, code: args.code, unit_number: args.unit_number, block: args.block, phase: args.phase });
        if ('error' in found) results.unit = found;
        else {
            const { unit } = found;
            results.unit = await inventoryStep(UNIT_CONTRACT_RULES, { id: unit.id, status: unit.status, label: unitLabelOf(unit) },
                (expected, next) => writeUnitStatus(shopId, unit, expected, next));
        }
    } else if (args.property_id || args.property_name) {
        const found = await findProperty(shopId, { property_id: args.property_id, property_name: args.property_name });
        if ('error' in found) results.property = found;
        else {
            const { property } = found;
            results.property = await inventoryStep(LISTING_CONTRACT_RULES, { id: property.id, status: property.status, label: property.name || property.id },
                (expected, next) => writePropertyStatus(shopId, property, expected, next));
        }
    }

    // Нэгж/байр эхэлж бичигдэнэ: төлөв нь preview-оос хойш өөрчлөгдсөн эсвэл бичилт бүтэлгүйтвэл гэрээ, лидэд хүрэхгүй.
    const inventoryError = [results.unit, results.property].find((r: any) => r?.error);
    if (confirm && inventoryError) return { ...inventoryError, partialSuccess: false, changes: [] };
    const inventorySkip: string | null = [results.unit, results.property].find((r: any) => r?.skipped)?.reason ?? null;

    // Гэрээний статус (property_contracts)
    if (args.contract_id || args.contract_number) {
        const contractResult: any = await updateContractStatus(shopId, { contract_id: args.contract_id, contract_number: args.contract_number, new_status: mapping.contract }, confirm);
        results.contract = contractResult;
        if (contractResult.requiresConfirmation) {
            resolvedArgs.contract_id = contractResult.action.args.contract_id;
            preview['Гэрээ'] = `${contractResult.preview['Гэрээ']} → ${contractStatusLabel(mapping.contract)}`;
            labels.push(`гэрээ ${contractResult.preview['Гэрээ']}`);
        } else if (!contractResult.error) results.changes.push(`Гэрээ → ${contractStatusLabel(mapping.contract)}`);
    }

    // Лийд
    if (args.lead_id || args.customer_name) {
        const leadResult: any = await updateLeadStatus(shopId, { lead_id: args.lead_id, customer_name: args.customer_name, new_status: mapping.lead, lost_reason: args.lost_reason }, confirm, scope, actor);
        results.lead = leadResult;
        if (leadResult.requiresConfirmation) {
            resolvedArgs.lead_id = leadResult.action.args.lead_id;
            resolvedArgs.lost_reason = leadResult.action.args.lost_reason;
            preview['Лийд'] = `${leadResult.preview['Лийд']} → ${statusLabel(mapping.lead)}`;
            if (leadResult.action.args.lost_reason) preview['Алдсан шалтгаан'] = leadResult.action.args.lost_reason;
            labels.push(String(leadResult.preview['Лийд']));
        } else if (!leadResult.error) results.changes.push(`Лийд → ${statusLabel(mapping.lead)}`);
    }

    const firstErr = [results.unit, results.property, results.contract, results.lead].find((r: any) => r?.error);
    if (firstErr) return { ...firstErr, partialSuccess: confirm && results.changes.length > 0, changes: results.changes };
    if (!confirm) {
        // Өөрчлөх зорилтгүй: ганц нэгж өгөгдөөд тэр нь өөрчлөгдөхгүй бол шалтгааныг нь хэлнэ.
        if (labels.length === 0) return { error: inventorySkip ?? notFound };
        return confirmNeeded('process_contract_action', resolvedArgs, `Гэрээний үйлдэл (${mapping.label}): ${labels.join(', ')}`, preview);
    }

    if (results.changes.length === 0) return { error: inventorySkip ?? notFound };
    results.message = `Гүйцэтгэгдлээ: ${results.changes.join(', ')}.${inventorySkip ? ` ${inventorySkip}` : ''}`;
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

/** AI-аас ирсэн мөнгөн дүн: сөрөг биш бодит тоо (preview-д «0₮» гэж буруу харагдахаас сэргийлнэ). */
function isAmount(value: unknown): boolean {
    const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
    return typeof n === 'number' && Number.isFinite(n) && n >= 0;
}

export async function createProperty(shopId: string, args: any, confirm = false) {
    if (!args.name || !args.type || args.price == null) {
        return { error: 'name, type, price талбарууд заавал шаардлагатай' };
    }
    const validTypes = ['apartment', 'house', 'office', 'land', 'commercial'];
    if (!validTypes.includes(args.type)) return { error: `type буруу байна. Зөвшөөрөгдсөн: ${validTypes.join(', ')}` };
    if (!isAmount(args.price)) return { error: 'price-ийг төгрөгөөр, зөвхөн тоогоор өгнө үү' };

    const preview = {
        Нэр: args.name, Төрөл: args.type,
        Үнэ: formatMNT(args.price),
        Дүүрэг: args.district || '-', 'Өрөө': args.rooms ?? '-', 'м²': args.size_sqm ?? '-',
        Статус: args.status || 'available',
    };
    if (!confirm) return confirmNeeded('create_property', args, `Шинэ байр нэмэх: ${args.name}`, preview);

    const insert = {
        shop_id: shopId,
        name: args.name, type: args.type, price: Number(args.price),
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

export async function createLead(shopId: string, args: any, confirm: boolean, actor: StaffLeadActor) {
    if (!z.string().uuid().safeParse(args.project_id).success) return { error: 'Лидийн төслийг project_id-аар сонгоно уу' };
    // Нэр/нэргүй дүрэм dashboard-тай ижил (LeadService): нэргүй лид зөвхөн anonymous=true, утас/и-мэйлтэй.
    const text = (value: unknown) => (value == null ? null : String(value));
    const identity = resolveLeadIdentity({
        customer_name: args.customer_name, customer_phone: text(args.customer_phone), customer_email: text(args.customer_email), anonymous: args.anonymous === true,
    });
    if (!identity.ok) {
        return { error: identity.error === LEAD_NAME_OR_ANONYMOUS ? 'customer_name шаардлагатай. Харилцагч нэрээ хэлээгүй бол нэр зохиохгүй, anonymous=true өгнө.' : identity.error };
    }
    const displayName = leadDisplayName(identity.customer_name);
    const resolved = await resolveStaffLead(supabaseAdmin, shopId, {
        projectId: args.project_id, status: args.status, source: args.source,
        // Ангилал зөвхөн тохиргоонд байгаа яг нэрээр (list_lead_categories); зохиосон нэр алдаа буцаана.
        category: args.category !== undefined && args.category !== null ? { name: args.category } : undefined,
    }, actor);
    if (!resolved.ok) return { error: resolved.error };
    if (![args.budget_min, args.budget_max].every((value) => value == null || isAmount(value))) {
        return { error: 'Төсвийг төгрөгөөр, зөвхөн тоогоор өгнө үү' };
    }
    const { status, source, sales_manager_name: managerName } = resolved;
    const preview = {
        Нэр: displayName, Утас: identity.customer_phone || '-', ...(identity.customer_email ? { Имэйл: identity.customer_email } : {}), Статус: status, 'Эх сурвалж': source,
        Төсөв: args.budget_max ? formatMNT(args.budget_max) : '-',
        Ангилал: resolved.category_name ?? UNCATEGORIZED_LABEL,
        Менежер: managerName || 'Хариуцагчгүй — идэвхтэй менежерт онооно',
    };
    if (!confirm) return confirmNeeded('create_lead', { ...args, status, source }, `Шинэ лийд: ${displayName}`, preview);

    const result = await insertLeadOnce(supabaseAdmin, {
        shop_id: shopId, project_id: resolved.project_id,
        customer_name: identity.customer_name,
        customer_phone: identity.customer_phone,
        customer_email: identity.customer_email,
        status, source, sales_manager_name: managerName,
        ...(resolved.category_id ? { category_id: resolved.category_id } : {}),
        notes: args.notes || null,
        budget_min: args.budget_min ?? null,
        budget_max: args.budget_max ?? null,
        preferred_district: args.preferred_district || null,
        preferred_rooms: args.preferred_rooms ?? null,
    }, { select: 'id, customer_name' });
    if (!result.ok) return { error: 'Лид үүсгэхэд алдаа гарлаа' };
    const owner = managerName ? `менежер: ${managerName}`
        : result.autoAssigned ? `менежер: ${result.autoAssigned} (автоматаар)` : 'хариуцагчгүй — идэвхтэй менежерт онооно';
    return { success: true, message: `"${displayName}" лийд амжилттай үүсгэлээ (${owner}).`, leadId: result.lead.id };
}

export async function deleteLead(shopId: string, args: any, confirm = false, scope: SalesProjectScope = UNRESTRICTED_SALES_SCOPE) {
    let query = supabaseAdmin.from('leads').select('id, project_id, customer_name, status').eq('shop_id', shopId).is('deleted_at', null);
    query = applyLeadScope(query, scope);
    if (args.lead_id) query = query.eq('id', args.lead_id);
    else if (args.customer_name) query = query.ilike('customer_name', `%${args.customer_name}%`);
    else return { error: 'lead_id эсвэл customer_name шаардлагатай' };

    const { data: leads } = await query;
    if (!leads || leads.length === 0) return { error: 'Лийд олдсонгүй' };
    if (leads.length > 1) return { error: `${leads.length} лийд олдлоо, тодруулна уу`, options: leads.map(l => ({ id: l.id, project_id: l.project_id, name: leadDisplayName(l) })) };

    const lead = leads[0];
    if (!confirm) {
        return confirmNeeded('delete_lead',
            { lead_id: lead.id, reason: args.reason },
            `Лийд устгах: ${leadDisplayName(lead)}`,
            { Нэр: leadDisplayName(lead), Статус: lead.status, Шалтгаан: args.reason || '-' });
    }

    const { error } = await applyLeadScope(supabaseAdmin.from('leads')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', lead.id), scope);
    if (error) return { error: `Алдаа: ${error.message}` };
    return { success: true, message: `"${leadDisplayName(lead)}" лийдийг устгалаа (сэргээх боломжтой).`, leadId: lead.id };
}

export const ANONYMOUS_CUSTOMER_NAME_REQUIRED = 'Харилцагчийн жинхэнэ нэрийг хэрэглэгчээс асууна уу (нэргүй лидийн шошгыг нэр болгож ашиглахгүй)';
export const ANONYMOUS_BUYER_NAME_REQUIRED = 'Гэрээний худалдан авагчийн жинхэнэ нэрийг асууна уу (нэргүй лидийн шошгыг ашиглахгүй)';

export async function createCustomer(shopId: string, args: any, confirm = false, salesManagerName = '') {
    if (!args.name) return { error: 'name шаардлагатай' };
    // Нэргүй лидийн шошго («Нэргүй харилцагч», «-» …) харилцагчийн нэр болж хадгалагдахгүй.
    const name = normalizeLeadName(args.name);
    if (!name) return { error: ANONYMOUS_CUSTOMER_NAME_REQUIRED };
    args = { ...args, name };
    const phoneNorm = normalizePhone(args.phone ? String(args.phone) : null);

    // Давхардал шалгах (утас/имэйлээр)
    if (phoneNorm || args.email) {
        const ors: string[] = [];
        if (phoneNorm) ors.push(`phone_normalized.eq.${phoneNorm}`);
        if (args.email) ors.push(`email.eq.${args.email}`);
        const { data: dupes } = await supabaseAdmin.from('customers')
            .select('id, name').eq('shop_id', shopId).is('deleted_at', null).or(ors.join(','));
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

// ---- Viewings (уулзалт) ----

export async function scheduleViewing(shopId: string, args: any, confirm = false, salesManagerName = '', userId?: string, scope: SalesProjectScope = UNRESTRICTED_SALES_SCOPE) {
    let propertyId = args.property_id || null;
    if (!propertyId && args.property_name) {
        const name = String(args.property_name).trim().replace(/[\\%_]/g, '\\$&');
        if (!name) return { error: 'Байрны нэрийг оруулна уу' };
        const { data: props, error } = await supabaseAdmin.from('properties').select('id, name')
            .eq('shop_id', shopId).is('deleted_at', null).ilike('name', `%${name}%`).limit(2);
        if (error) return { error: 'Байр хайхад алдаа гарлаа' };
        if (!props?.length) return { error: 'Байр олдсонгүй' };
        if (props.length > 1) return { error: 'Олон байр таарлаа. Аль байр болохыг тодруулна уу.', options: props };
        propertyId = props[0].id;
    }
    const input = { ...args, property_id: propertyId };
    const resolved = await resolveViewingInput(supabaseAdmin, shopId, input, scope);
    if (!resolved.ok) return { error: resolved.error };
    const { input: p, lead, property } = resolved.data;
    const payload = { ...p, lead_id: lead?.id ?? null };
    const when = p.walk_in ? 'Ирсэн уулзалт' : `${formatShortDate(p.scheduled_at!)} ${formatTime(p.scheduled_at!)}`;
    const customer = lead ? leadDisplayName(lead) : p.customer_name;
    if (!confirm) return confirmNeeded('schedule_viewing', payload, `Уулзалт товлох: ${customer || property?.name || when}`, {
        Байр: property?.name || 'Сонгоогүй', Огноо: when,
        Харилцагч: customer || '-', Менежер: salesManagerName || '-',
    });
    const identity = userId ? await resolveManagerIdentity(supabaseAdmin, shopId, userId) : null;
    const result = await createViewing(supabaseAdmin, shopId, payload, {
        scope, userId: userId ?? null, managerName: identity?.isManager ? identity.managerName : null,
    });
    if (!result.ok) return { error: result.error, partialSuccess: result.partialSuccess, leadId: result.leadId };
    return { success: true, message: result.warning || `Уулзалтыг ${when}-д бүртгэлээ.`, warning: result.warning,
        viewingId: result.data.viewing.id, leadId: result.data.lead_id };
}

export async function deleteViewing(shopId: string, args: any, confirm = false, scope: SalesProjectScope = UNRESTRICTED_SALES_SCOPE, userId?: string) {
    let query = supabaseAdmin.from('property_viewings')
        .select(`id, scheduled_at, status, properties(name), ${scope.projectIds === null ? 'leads' : 'leads!inner'}(project_id,sales_manager_name)`)
        .eq('shop_id', shopId).is('deleted_at', null);
    query = applyLeadScope(query, scope, 'leads.project_id', 'leads.sales_manager_name');
    if (args.viewing_id) {
        query = query.eq('id', args.viewing_id);
    } else if (args.property_name) {
        // тухайн байрны товлогдсон уулзалтыг хайна
        const { data: props } = await supabaseAdmin.from('properties').select('id').eq('shop_id', shopId).ilike('name', `%${args.property_name}%`).limit(1);
        if (!props || !props.length) return { error: 'Байр олдсонгүй' };
        query = query.eq('property_id', props[0].id).eq('status', 'scheduled').order('scheduled_at', { ascending: true });
    } else {
        return { error: 'viewing_id эсвэл property_name шаардлагатай' };
    }

    const { data: viewings } = await query;
    if (!viewings || viewings.length === 0) return { error: 'Уулзалт олдсонгүй' };
    if (viewings.length > 1) return { error: `${viewings.length} уулзалт олдлоо, viewing_id-г тодруулна уу`, options: viewings.map((v: any) => ({ id: v.id, scheduled_at: v.scheduled_at })) };
    const v: any = viewings[0];
    const propName = v.properties?.name || 'байр';

    if (!confirm) {
        return confirmNeeded('delete_viewing', { viewing_id: v.id, reason: args.reason }, `Уулзалт устгах: ${propName}`,
            { Байр: propName, Огноо: v.scheduled_at ? new Date(v.scheduled_at).toLocaleString('mn-MN') : '-', Шалтгаан: args.reason || '-' });
    }

    if (scope.projectIds !== null) {
        const result = await updateViewing(supabaseAdmin, shopId, v.id, { deleted_at: new Date().toISOString(), status: 'cancelled' }, {
            scope, userId: userId || null, managerName: scope.managerName,
        });
        if (!result.ok) return { error: result.error };
    } else {
        const { data, error } = await supabaseAdmin.from('property_viewings')
            .update({ deleted_at: new Date().toISOString(), status: 'cancelled' })
            .eq('id', v.id).eq('shop_id', shopId).is('deleted_at', null).select('id').maybeSingle();
        if (error) return { error: `Алдаа: ${error.message}` };
        if (!data) return { error: 'Уулзалт олдсонгүй' };
    }
    return { success: true, message: `"${propName}" байрны уулзалтыг устгалаа (сэргээх боломжтой).`, viewingId: v.id };
}

// ---- Contracts (гэрээ) ----

export async function createContract(shopId: string, args: any, confirm = false, salesManagerName = '', scope: SalesProjectScope = UNRESTRICTED_SALES_SCOPE) {
    if (!args.customer_name) return { error: 'customer_name шаардлагатай' };
    // get_lead_details нэргүй лидэд шошго буцаадаг — гэрээний худалдан авагч болгож хэзээ ч бичихгүй.
    const buyerName = normalizeLeadName(args.customer_name);
    if (!buyerName) return { error: ANONYMOUS_BUYER_NAME_REQUIRED };
    args = { ...args, customer_name: buyerName };
    let projectId: string | null = null;
    let customerId = args.customer_id || null;
    if (args.lead_id) {
        if (!z.string().uuid().safeParse(args.lead_id).success) return { error: 'Лидийн ID буруу байна' };
        const { data: lead, error } = await applyLeadScope(supabaseAdmin.from('leads')
            .select('id, project_id, customer_id, sales_manager_name').eq('id', args.lead_id)
            .eq('shop_id', shopId).is('deleted_at', null), scope).maybeSingle();
        if (error) return { error: 'Лидийн хандалтыг шалгаж чадсангүй' };
        if (!lead) return { error: 'Лид олдсонгүй' };
        if (customerId && customerId !== lead.customer_id) return { error: 'Харилцагч лидтэй тохирохгүй байна' };
        projectId = lead.project_id;
        customerId = lead.customer_id;
        salesManagerName = scope.projectIds === null ? salesManagerName : scope.managerName || '';
    } else if (customerId) {
        const customer = await supabaseAdmin.from('customers').select('id').eq('id', customerId)
            .eq('shop_id', shopId).is('deleted_at', null).maybeSingle();
        if (customer.error || !customer.data) return { error: 'Харилцагч олдсонгүй' };
    }

    if (args.total_price != null && !isAmount(args.total_price)) return { error: 'total_price-ийг төгрөгөөр, зөвхөн тоогоор өгнө үү' };
    const preview = {
        Харилцагч: args.customer_name, Утас: args.customer_phone || '-',
        'Нийт үнэ': args.total_price ? formatMNT(args.total_price) : '-',
        'Төсөл/блок': args.block_name || '-', 'Байр': args.unit_number || '-',
        Менежер: salesManagerName || '-',
    };
    if (!confirm) return confirmNeeded('create_contract', args, `Шинэ гэрээ: ${args.customer_name}`, preview);

    const insert: Record<string, unknown> = {
        shop_id: shopId,
        project_id: projectId,
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
        contract_date: ubDateStr(),
        lead_id: args.lead_id || null,
        customer_id: customerId,
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
    else if (args.phone) {
        const phonePattern = phoneIlikePattern(String(args.phone), 8);
        if (!phonePattern) return { error: 'Харилцагчийн утасны дугаарыг бүтэн оруулна уу' };
        query = query.ilike('phone', phonePattern);
    } else if (args.name) query = query.ilike('name', `%${args.name}%`);
    else return { error: 'customer_id, name эсвэл phone шаардлагатай' };

    const { data: customers } = await query;
    if (!customers || customers.length === 0) return { error: 'Харилцагч олдсонгүй' };
    if (customers.length > 1) return { error: `${customers.length} харилцагч олдлоо, тодруулна уу`, options: customers.map(c => ({ id: c.id, name: c.name, phone: c.phone })) };
    const c = customers[0];

    if (!confirm) {
        return confirmNeeded('delete_customer', { customer_id: c.id, reason: args.reason }, `Харилцагч устгах: ${c.name}`,
            { Нэр: c.name, Утас: c.phone || '-', Шалтгаан: args.reason || '-' });
    }

    const deleted = await softDeleteCustomer(supabaseAdmin, shopId, c.id);
    if ('error' in deleted) return { error: `Алдаа: ${deleted.error}` };
    return { success: true, message: `"${c.name}" харилцагчийг устгалаа (сэргээх боломжтой).`, customerId: c.id };
}

// ---- Bulk үйлдэл ----

export async function bulkUpdateLeads(shopId: string, args: any, confirm = false, scope: SalesProjectScope = UNRESTRICTED_SALES_SCOPE, actor?: LeadActor) {
    if (args.new_status === 'closed_won' || args.new_status === 'closed_lost') return { error: 'Олон лидийг бөөнөөр хаахгүй. Лид тус бүрт update_lead_status ашиглаж, гэрээ эсвэл алдсан шалтгааныг шалгана уу.' };
    const valid = ['new', 'contacted', 'viewing_scheduled', 'offered', 'negotiating'];
    if (!args.new_status || !valid.includes(args.new_status)) return { error: 'new_status шаардлагатай ба зөв төлөв байх ёстой' };

    let q = supabaseAdmin.from('leads').select('id, customer_name, status').eq('shop_id', shopId).is('deleted_at', null);
    q = applyLeadScope(q, scope);
    if (args.lead_ids) {
        const ids = String(args.lead_ids).split(',').map((s) => s.trim()).filter(Boolean);
        if (!ids.length) return { error: 'lead_ids хоосон байна' };
        q = q.in('id', ids);
    } else if (args.from_status) q = q.eq('status', args.from_status);
    else {
        return { error: 'from_status эсвэл lead_ids шаардлагатай' };
    }

    const { data: leads, error: readError } = await q.limit(101);
    if (readError) return { error: 'Лидийн жагсаалт уншихад алдаа гарлаа' };
    if (!leads || leads.length === 0) return { error: 'Тохирох лийд олдсонгүй' };
    if (leads.length > 100) return { error: 'Нэг удаад 100 хүртэл лид өөрчилнө. lead_ids-ээр жагсаалтаа нарийсгана уу.' };

    if (!confirm) {
        return confirmNeeded('bulk_update_leads', { lead_ids: leads.map(l => l.id).join(','), new_status: args.new_status }, `${leads.length} лийдийн статус → ${args.new_status}`,
            { 'Лийд тоо': leads.length, 'Шинэ статус': args.new_status, 'Жишээ': leads.slice(0, 5).map((l) => leadDisplayName(l)).join(', ') || '-' });
    }

    const ids = leads.map((l) => l.id);
    const { data: updated, error } = await applyLeadScope(supabaseAdmin.from('leads').update({ status: args.new_status, lost_reason: null, updated_at: new Date().toISOString() })
        .in('id', ids).eq('shop_id', shopId).is('deleted_at', null).select('id'), scope);
    if (error) return { error: `Алдаа: ${error.message}` };
    const updatedIds = new Set((updated || []).map((row) => row.id));
    await Promise.all(leads.filter((l) => updatedIds.has(l.id) && l.status !== args.new_status)
        .map((l) => logStatusChange(shopId, l.id, l.status, args.new_status, null, actor)));
    if (updated?.length !== ids.length) return { error: `${ids.length} лидээс ${updated?.length || 0} нь шинэчлэгдлээ. Жагсаалтаа шинэчилж шалгана уу.`, partialSuccess: !!updated?.length };
    return { success: true, message: `${updated.length} лийдийн статусыг "${args.new_status}" болгож шинэчиллээ.`, count: updated.length };
}

// ---- Marketing ----

export async function fetchMarketingSummary(shopId: string, args: any) {
    const [{ data: campaigns }, { data: posts }, currency] = await Promise.all([
        supabaseAdmin.from('ad_campaigns').select('name, platform, status, budget, spend, impressions, clicks, conversions, reach').eq('shop_id', shopId),
        supabaseAdmin.from('social_posts').select('platform, status, likes, comments, shares, reach, engagement_rate, published_at').eq('shop_id', shopId).order('published_at', { ascending: false, nullsFirst: false }).limit(10),
        loadAdAccountCurrency(supabaseAdmin, shopId),
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
        // Зарын зардал Meta зарын дансны валютаар (ханшаар хөрвүүлээгүй) — ₮ гэж таамаглахгүй.
        spendCurrency: accountCurrencyLabel(currency),
        spendBasis: currency === 'MNT'
            ? 'Зарын данс төгрөгөөр.'
            : 'Зарын дансны валютаар, төгрөгт хөрвүүлээгүй; дүнг ₮ гэж бүү хэл.',
        totals: {
            spend: formatAccountMoney(totals.spend, currency),
            impressions: totals.impressions,
            clicks: totals.clicks,
            conversions: totals.conversions,
            ctr: totals.impressions ? `${((totals.clicks / totals.impressions) * 100).toFixed(2)}%` : '0%',
            cpa: totals.conversions ? formatAccountMoney(totals.spend / totals.conversions, currency) : '-',
        },
        campaigns: camps.slice(0, 10),
        recentPosts: (posts || []).map((p: any) => ({ platform: p.platform, status: p.status, likes: p.likes, comments: p.comments, reach: p.reach, engagement_rate: p.engagement_rate })),
    };
}

export async function fetchMarketingBudgetStatus(shopId: string, args: any) {
    const year = Number(args?.year) || new Date().getFullYear();
    const [budgetRes, allEntries, revenueRes] = await Promise.all([
        supabaseAdmin.from('marketing_budgets').select('month, amount').eq('shop_id', shopId).eq('year', year),
        loadMarketingSpend(supabaseAdmin, shopId, `${year}-01-01`, `${year}-12-31`),
        supabaseAdmin.from('manager_monthly_sales').select('month, actual_amount').eq('shop_id', shopId).eq('year', year),
    ]);

    if (budgetRes.error && /42P01|marketing_budgets/i.test(budgetRes.error.message || budgetRes.error.code || '')) {
        return { error: 'Төсвийн хүснэгт үүсээгүй байна (20260721140000 миграци хийгдээгүй)' };
    }

    const budgets = Array(12).fill(0);
    for (const r of budgetRes.data || []) {
        if (r.month >= 1 && r.month <= 12) budgets[r.month - 1] = Number(r.amount) || 0;
    }
    if (budgetRes.error || revenueRes.error) throw new Error('Төсөв эсвэл орлого уншиж чадсангүй');
    const entries = allEntries.filter(e => !e.exclusion);
    const revenue = Array(12).fill(0);
    for (const r of revenueRes.error ? [] : revenueRes.data || []) {
        if (r.month >= 1 && r.month <= 12) revenue[r.month - 1] += Number(r.actual_amount) || 0;
    }

    const overview = buildBudgetOverview(budgets, monthlySpendSeries(entries, year), revenue);
    return {
        year,
        spendQuality: spendQuality(allEntries),
        spendBasis: SPEND_BASIS,
        months: overview.months
            .filter((m) => m.budget > 0 || m.spend > 0 || m.revenue > 0)
            .map((m) => ({
                month: `${m.month}-р сар`,
                budget: formatMNT(m.budget),
                spend: formatMNT(m.spend),
                revenue: formatMNT(m.revenue),
                utilization: m.pct !== null ? `${m.pct}%` : '-',
                status: m.status,
            })),
        totals: {
            budget: formatMNT(overview.totals.budget),
            spend: formatMNT(overview.totals.spend),
            revenue: formatMNT(overview.totals.revenue),
            utilization: overview.totals.pct !== null ? `${overview.totals.pct}%` : '-',
            status: overview.totals.status,
            roi: overview.totals.roi !== null ? `${overview.totals.roi}x` : '-',
        },
        byChannel: spendByChannel(entries).map((c) => ({
            channel: SPEND_CHANNELS[c.channel] || c.channel,
            amount: formatMNT(c.amount),
        })),
        statusLegend: 'ok = хэвийн (<80%), warn = анхаарах (80-100%), over = төсөв хэтэрсэн (>100%), none = төсөвгүй',
    };
}

export async function fetchMarketIndicators(shopId: string) {
    const { data, error } = await supabaseAdmin
        .from('market_indicators')
        .select('category, name, value, note, recorded_at')
        .eq('shop_id', shopId)
        .is('deleted_at', null)
        .order('recorded_at', { ascending: false })
        .limit(100);

    if (error) {
        return { indicators: [], note: 'Зах зээлийн үзүүлэлт бүртгэгдээгүй эсвэл миграци хийгдээгүй байна' };
    }
    const categoryLabels: Record<string, string> = {
        mortgage: 'Ипотекийн зээл',
        bank: 'Банкны нөхцөл',
        macro: 'Макро',
        other: 'Бусад',
    };
    return {
        count: (data || []).length,
        indicators: (data || []).map((r) => ({
            category: categoryLabels[r.category] || r.category,
            name: r.name,
            value: r.value,
            note: r.note || undefined,
            recorded_at: r.recorded_at,
        })),
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
async function resolveEntity(shopId: string, entityType: string, args: any, scope: SalesProjectScope = UNRESTRICTED_SALES_SCOPE): Promise<{ id: string; label: string } | { error: string; options?: any[] }> {
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
    q = applyLeadScope(q, scope);
        q = byId ? q.eq('id', byId) : q.ilike('customer_name', `%${args.entity_name || ''}%`);
        const { data } = await q;
        if (!data || !data.length) return { error: 'Лийд олдсонгүй' };
        if (data.length > 1) return { error: `${data.length} лийд олдлоо, тодруулна уу`, options: data.map(d => ({ id: d.id, name: leadDisplayName(d) })) };
        return { id: data[0].id, label: leadDisplayName(data[0]) };
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
    let q = supabaseAdmin.from('property_contracts').select('id, contract_number, customer_name').eq('shop_id', shopId).is('deleted_at', null);
    if (byId) q = q.eq('id', byId);
    else if (args.contract_number) q = q.ilike('contract_number', `%${args.contract_number}%`);
    else q = q.ilike('customer_name', `%${args.entity_name || ''}%`);
    const { data } = await q;
    if (!data || !data.length) return { error: 'Гэрээ олдсонгүй' };
    if (data.length > 1) return { error: `${data.length} гэрээ олдлоо, тодруулна уу`, options: data.map(d => ({ id: d.id, name: d.customer_name || d.contract_number })) };
    return { id: data[0].id, label: data[0].customer_name || data[0].contract_number || 'гэрээ' };
}

export async function attachFile(shopId: string, args: any, confirm = false, salesManagerName = '', userId?: string, perms?: { role: string; modules?: string[] }, scope: SalesProjectScope = UNRESTRICTED_SALES_SCOPE) {
    const types = ['property', 'lead', 'customer', 'contract'];
    if (!args.entity_type || !types.includes(args.entity_type)) return { error: 'entity_type буруу (property/lead/customer/contract)' };
    if (!args.file_url) return { error: 'file_url шаардлагатай' };
    const privateFile = parsePrivateAttachmentUrl(args.file_url);
    if (privateFile) {
        if (!userId || !perms || !await canReadPrivateAttachment(supabaseAdmin, args.file_url, { shopId, userId, perms })) return { error: 'Энэ файлыг хавсаргах эрх танд алга.' };
    } else if (!isLegacyPublicAttachmentUrl(args.file_url)) {
        return { error: 'Файлын хаяг зөвшөөрөгдөөгүй байна.' };
    }

    const resolved = await resolveEntity(shopId, args.entity_type, args, scope);
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
    if (!privateFile && args.entity_type === 'property' && isImage) {
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
                    { name: 'Гэрээ', value: data.totalContracts || 0 },
                    { name: 'Харилцагч', value: data.totalCustomers || 0 },
                    { name: 'Лийд', value: data.totalLeads || 0 },
                    { name: 'Байр', value: data.totalProperties || 0 },
                ]
            };
        case 'list_properties':
            if (Array.isArray(data)) {
                const priced = data.filter((p: any) => p.price != null && Number.isFinite(Number(p.price)));
                if (priced.length > 0) return { type: 'bar', data: priced.slice(0, 8).map((p: any) => ({ name: p.name?.substring(0, 15) || 'Байр', value: Number(p.price) })) };
            }
            return null;
        case 'list_leads':
            if (Array.isArray(data) && data.length > 0) {
                const statusCounts: Record<string, number> = {};
                data.forEach((l: any) => { statusCounts[l.status] = (statusCounts[l.status] || 0) + 1; });
                return { type: 'bar', data: Object.entries(statusCounts).map(([status, count]) => ({ name: STATUS_META[status as LeadStatus]?.short ?? status, value: count })) };
            }
            return null;
        default: return null;
    }
}
