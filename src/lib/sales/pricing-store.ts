import type { SupabaseClient } from '@supabase/supabase-js';
import { ProjectScopeError, applyProjectScope, canAccessProject, type SalesProjectScope } from './project-scope';
import { fetchAllRows } from '@/lib/utils/pagination';
import { ubDateStr } from '@/lib/utils/date';
import { soleShopProjectId } from '@/lib/projects/shop-project';
import { loadViewingOptions } from '@/lib/viewings/options';
import type { ViewingUnitOption } from '@/lib/viewings/interests';
import { elysiumViewingConditions } from './viewing-conditions';
import {
    MAIN_PRICE_LIST, MAX_PRICE_LISTS, PricingDraftSchema, PricingRetireSchema, PricingSaveSchema, PricingSelectionSchema,
    calculateListPricing, inventoryArea, inventoryFloor, priceListConflict, pricingKey,
    type PriceListOverview, type PricingConfig, type PricingRetireInput, type PricingSaveInput, type PricingSelection, type PricingResult,
} from './pricing';
import { diffPricingRules, pricingValidity, summarizePriceLists, withArchiveTimes, type PricingSheet, type PricingVersionSummary } from './pricing-history';

export class PricingSelectionError extends ProjectScopeError {
    constructor(message: string, status = 400) { super(status, message); }
}

function configRow(row: Record<string, unknown>): PricingConfig {
    const parsed = PricingDraftSchema.safeParse(row.config);
    if (!parsed.success || typeof row.id !== 'string' || typeof row.shop_id !== 'string'
        || !Number.isInteger(row.version) || !['draft', 'active', 'archived'].includes(String(row.status))) {
        throw new PricingSelectionError('Үнийн тохиргооны бүтэц буруу байна', 503);
    }
    return { ...parsed.data, id: row.id, shop_id: row.shop_id, version: Number(row.version), status: row.status as PricingConfig['status'],
        list_key: typeof row.list_key === 'string' && row.list_key ? row.list_key : MAIN_PRICE_LIST.key,
        list_name: typeof row.list_name === 'string' && row.list_name ? row.list_name : MAIN_PRICE_LIST.name };
}

const CONFIG_COLUMNS = 'id,shop_id,list_key,list_name,version,status,config';

/** The active version of every price list of the project (none, one, or one per list). */
export async function loadActivePriceLists(db: SupabaseClient, shopId: string): Promise<PricingConfig[]> {
    const { data, error } = await db.from('project_pricing_configs').select(CONFIG_COLUMNS)
        .eq('shop_id', shopId).eq('status', 'active').order('list_key').limit(MAX_PRICE_LISTS);
    if (error) throw new PricingSelectionError('Үнийн тохиргоо уншиж чадсангүй. Дахин оролдоно уу', 503);
    return (data ?? []).map(row => configRow(row as Record<string, unknown>));
}

export async function loadViewingPricingConditions(db: SupabaseClient, shopId: string, scope: SalesProjectScope, asOf = ubDateStr(),
    options: { projectId?: string | null; units?: readonly ViewingUnitOption[] } = {}) {
    if (scope.projectIds !== null && !scope.projectIds.length) return { conditions: [], reason: 'Төсөлд бүртгэлгүй байна' };
    const projectId = options.projectId ?? await soleShopProjectId(db, shopId);
    if (!projectId || !canAccessProject(scope, projectId)) return { conditions: [], reason: 'Төслийн эрхгүй байна' };
    const { data: project, error } = await db.from('projects').select('id,name').eq('shop_id', shopId).eq('id', projectId).maybeSingle();
    if (error) throw new PricingSelectionError('Төслийн төлбөрийн нөхцөл уншиж чадсангүй. Дахин оролдоно уу', 503);
    if (!project) return { conditions: [], reason: 'Төсөл олдсонгүй' };
    // Every list that prices today: a unit's conditions come from the list that covers its block.
    const lists = (await loadActivePriceLists(db, shopId)).filter(config => config.inventory_area_confirmed && pricingValidity(config, asOf) === 'valid');
    if (lists.length) {
        return { conditions: lists.flatMap(config => config.rules.map(({ block, model, floor_min, floor_max, payment_condition }) => ({ block, model, floor_min, floor_max, payment_condition }))), reason: null };
    }
    // Interest terms can be selected without a monetary offer. Never derive a rate or an advance from their labels.
    const units = options.units ?? await loadViewingOptions(db, shopId, scope, projectId);
    const conditions = elysiumViewingConditions(project.name, units.filter(unit => unit.project_id === projectId));
    return { conditions, reason: conditions.length ? 'Нөхцөлөө сонгож хадгалж болно. Үнэ, урьдчилгааны дүн батлагдаагүй.' : 'Одоогийн баталсан үнэ, нөхцөл байхгүй' };
}

/** Editor state: every list of the project with its latest version (any status) and its active version. */
export async function loadPricingOverview(db: SupabaseClient, shopId: string): Promise<{ lists: PriceListOverview[] }> {
    type Row = { id: string; list_key: string; list_name: string; version: number; status: string };
    let rows: Row[];
    try {
        rows = await fetchAllRows<Row>((from, to) => db.from('project_pricing_configs').select('id,list_key,list_name,version,status')
            .eq('shop_id', shopId).order('version', { ascending: false }).order('id').range(from, to));
    } catch { throw new PricingSelectionError('Үнийн тохиргоо уншиж чадсангүй', 503); }
    const lists = new Map<string, { key: string; name: string; latest: string; active: string | null }>();
    for (const row of rows) {
        // Newest version first: the first row of a list is its latest and gives the list its name.
        const list = lists.get(row.list_key) ?? { key: row.list_key, name: row.list_name, latest: row.id, active: null };
        if (row.status === 'active') list.active = row.id;
        lists.set(row.list_key, list);
    }
    const ids = [...new Set([...lists.values()].flatMap(list => list.active ? [list.latest, list.active] : [list.latest]))];
    const configs = new Map<string, PricingConfig>();
    if (ids.length) {
        const { data, error } = await db.from('project_pricing_configs').select(CONFIG_COLUMNS).eq('shop_id', shopId).in('id', ids);
        if (error) throw new PricingSelectionError('Үнийн тохиргоо уншиж чадсангүй', 503);
        for (const row of data ?? []) { const config = configRow(row as Record<string, unknown>); configs.set(config.id, config); }
    }
    const overview = [...lists.values()].map((list): PriceListOverview => ({
        key: list.key, name: list.name, latest: configs.get(list.latest) ?? null, active: list.active ? configs.get(list.active) ?? null : null,
    }));
    // The default list is always offered, also before its first version.
    if (!lists.has(MAIN_PRICE_LIST.key)) overview.push({ key: MAIN_PRICE_LIST.key, name: MAIN_PRICE_LIST.name, latest: null, active: null });
    return { lists: overview.sort((a, b) => Number(b.key === MAIN_PRICE_LIST.key) - Number(a.key === MAIN_PRICE_LIST.key)
        || Number(!!b.active) - Number(!!a.active) || a.name.localeCompare(b.name, 'mn', { numeric: true })) };
}

/** Same rule as the meeting conditions: a restricted manager sees only a project they are registered for. */
export async function assertPricingProjectAccess(db: SupabaseClient, shopId: string, scope: SalesProjectScope): Promise<void> {
    if (scope.projectIds === null) return;
    if (!scope.projectIds.length) throw new PricingSelectionError('Төсөлд бүртгэлгүй байна', 403);
    let projectId: string | null;
    try { projectId = await soleShopProjectId(db, shopId); }
    catch { throw new PricingSelectionError('Төслийн эрхийг шалгаж чадсангүй. Дахин оролдоно уу', 503); }
    if (!projectId || !canAccessProject(scope, projectId)) throw new PricingSelectionError('Энэ төслийн үнийг харах эрхгүй', 403);
}

type HistoryRow = {
    id: string; list_key: string; list_name: string; version: number; status: 'active' | 'archived';
    created_at: string; created_by: string; archived_at: string | null;
    source: string | null; valid_from: string | null; valid_until: string | null;
};

/** Activated versions of every list, newest activation first. */
export async function loadPricingHistory(db: SupabaseClient, shopId: string): Promise<PricingVersionSummary[]> {
    let rows: HistoryRow[];
    try {
        rows = await fetchAllRows<HistoryRow>((from, to) => db.from('project_pricing_configs')
            .select('id,list_key,list_name,version,status,created_at,created_by,archived_at,source:config->>source,valid_from:config->>valid_from,valid_until:config->>valid_until')
            .eq('shop_id', shopId).in('status', ['active', 'archived']).order('created_at', { ascending: false }).order('id').range(from, to));
    } catch { throw new PricingSelectionError('Үнийн түүх уншиж чадсангүй. Дахин оролдоно уу', 503); }
    const actorIds = [...new Set(rows.map(row => row.created_by))];
    const names = new Map<string, string>();
    if (actorIds.length) {
        const { data, error } = await db.from('user_profiles').select('id,full_name').in('id', actorIds);
        if (error) throw new PricingSelectionError('Үнийн түүх уншиж чадсангүй. Дахин оролдоно уу', 503);
        for (const profile of data ?? []) if (profile.full_name) names.set(profile.id, profile.full_name);
    }
    return withArchiveTimes(rows).map(row => ({
        id: row.id, list_key: row.list_key ?? MAIN_PRICE_LIST.key, list_name: row.list_name ?? MAIN_PRICE_LIST.name, version: row.version, status: row.status,
        source: row.source ?? '', valid_from: row.valid_from, valid_until: row.valid_until,
        activated_at: row.created_at, activated_by: names.get(row.created_by) ?? null, archived_at: row.archived_at,
    }));
}

async function loadActivatedVersion(db: SupabaseClient, shopId: string, id: string): Promise<PricingConfig> {
    const { data, error } = await db.from('project_pricing_configs').select(CONFIG_COLUMNS)
        .eq('shop_id', shopId).eq('id', id).in('status', ['active', 'archived']).maybeSingle();
    if (error) throw new PricingSelectionError('Үнийн хувилбар уншиж чадсангүй. Дахин оролдоно уу', 503);
    if (!data) throw new PricingSelectionError('Үнийн хувилбар олдсонгүй', 404);
    return configRow(data);
}

/**
 * Read only. Shows one list: the requested one, else the first list with an active price. Without a version
 * its active version is shown; each version is compared with the one it replaced in the same list.
 */
export async function loadPricingSheet(db: SupabaseClient, shopId: string, options: { list?: string | null; version?: number | null; asOf?: string } = {}): Promise<PricingSheet> {
    const asOf = options.asOf ?? ubDateStr();
    const history = await loadPricingHistory(db, shopId);
    const lists = summarizePriceLists(history, asOf);
    const list = options.list ? lists.find(item => item.key === options.list) : lists.find(item => item.active_version !== null) ?? lists[0];
    if (!list) {
        if (options.list || options.version) throw new PricingSelectionError(options.list ? 'Үнийн жагсаалт олдсонгүй' : 'Үнийн хувилбар олдсонгүй', 404);
        return { as_of: asOf, lists, history, selected: null };
    }
    const versions = history.filter(row => row.list_key === list.key).sort((a, b) => b.version - a.version);
    const index = options.version ? versions.findIndex(row => row.version === options.version) : versions.findIndex(row => row.status === 'active');
    if (options.version && index < 0) throw new PricingSelectionError('Үнийн хувилбар олдсонгүй', 404);
    if (index < 0) return { as_of: asOf, lists, history, selected: null };
    const summary = versions[index], earlier = versions[index + 1] ?? null;
    const [config, previous] = await Promise.all([
        loadActivatedVersion(db, shopId, summary.id),
        earlier ? loadActivatedVersion(db, shopId, earlier.id) : Promise.resolve(null),
    ]);
    const diff = diffPricingRules(config.rules, previous?.rules ?? null);
    return { as_of: asOf, lists, history, selected: {
        ...summary, source: config.source, valid_from: config.valid_from, valid_until: config.valid_until,
        validity: pricingValidity(config, asOf), previous_version: earlier?.version ?? null, ...diff,
    } };
}

function saveError(error: { code?: string } | null, fallback: string): PricingSelectionError {
    if (error?.code === '40001') return new PricingSelectionError('Өөр хэрэглэгч үнийн тохиргоог өөрчилсөн байна. Нооргоо хадгалаад дахин ачаална уу', 409);
    if (error?.code === '42501') return new PricingSelectionError('Үнийн тохиргоо засах эрх алга', 403);
    if (error?.code === '23505') return new PricingSelectionError('Ийм нэртэй үнийн жагсаалт байна. Өөр нэр өгнө үү');
    if (error?.code === '23P01') return new PricingSelectionError('Өөр идэвхтэй үнийн жагсаалттай давхцаж байна. Блок эсвэл хүчинтэй хугацааг ялгана уу');
    if (error?.code === 'P0002') return new PricingSelectionError('Энэ жагсаалтад идэвхтэй үнэ алга', 404);
    if (error?.code === '22023') return new PricingSelectionError('Үнийн тохиргоо эсвэл идэвхжүүлэх нөхцөл буруу байна');
    return new PricingSelectionError(fallback, 503);
}

export async function savePricingConfig(db: SupabaseClient, shopId: string, actorId: string, input: PricingSaveInput): Promise<PricingConfig> {
    const parsed = PricingSaveSchema.safeParse(input);
    if (!parsed.success) throw new PricingSelectionError(parsed.error.issues[0]?.message ?? 'Үнийн тохиргоо буруу байна');
    if (parsed.data.status === 'active') {
        // The RPC refuses the same overlap; this names the list and the row for the admin.
        const others = (await loadActivePriceLists(db, shopId)).filter(config => config.list_key !== parsed.data.list_key);
        const conflict = priceListConflict(parsed.data.config, others);
        if (conflict) throw new PricingSelectionError(conflict);
    }
    const { data, error } = await db.rpc('save_project_price_list', {
        p_shop_id: shopId, p_actor: actorId, p_list_key: parsed.data.list_key, p_list_name: parsed.data.list_name,
        p_expected_version: parsed.data.expected_version, p_status: parsed.data.status, p_config: parsed.data.config,
    });
    if (error || !data) throw saveError(error, 'Үнийн тохиргоо хадгалагдсангүй');
    return configRow(data as Record<string, unknown>);
}

/** Withdraws the list's active price without a replacement; the version stays in the archive. */
export async function retirePriceList(db: SupabaseClient, shopId: string, actorId: string, input: PricingRetireInput): Promise<PricingConfig> {
    const parsed = PricingRetireSchema.safeParse(input);
    if (!parsed.success) throw new PricingSelectionError(parsed.error.issues[0]?.message ?? 'Үнийн жагсаалт буруу байна');
    const { data, error } = await db.rpc('retire_project_price_list', {
        p_shop_id: shopId, p_actor: actorId, p_list_key: parsed.data.list_key, p_expected_version: parsed.data.expected_version,
    });
    if (error || !data) throw saveError(error, 'Үнийг идэвхгүй болгож чадсангүй');
    return configRow(data as Record<string, unknown>);
}

type InventoryPricingUnit = {
    id: string; project_id: string | null; block: string | null; model: string | null; floor: string | null;
    sale_area: number | string | null; updated_sale_area: number | string | null; contracted_area: number | string | null;
};

/** Reject foreign/impossible selections; valid interest can be saved even when its price is unavailable. */
export async function quoteViewingSelection(
    db: SupabaseClient, shopId: string, selection: PricingSelection, scope: SalesProjectScope, asOf = ubDateStr(),
): Promise<PricingResult> {
    const parsed = PricingSelectionSchema.safeParse(selection);
    if (!parsed.success) throw new PricingSelectionError(parsed.error.issues[0]?.message ?? 'Байрны сонголт буруу байна');
    if (scope.projectIds !== null && !scope.projectIds.length) throw new PricingSelectionError('Байр олдсонгүй', 404);
    let units: InventoryPricingUnit[];
    try {
        units = await fetchAllRows<InventoryPricingUnit>((from, to) => {
            let query = db.from('property_units').select('id,project_id,block,model,floor,sale_area,updated_sale_area,contracted_area')
                .eq('shop_id', shopId).eq('category', 'residential').order('id');
            query = applyProjectScope(query, scope);
            if (parsed.data.unit_id) query = query.eq('id', parsed.data.unit_id);
            return query.range(from, to);
        });
    } catch { throw new PricingSelectionError('Байрны сонголт шалгаж чадсангүй', 503); }
    const valid = units.filter(unit => unit.block && unit.model
        && pricingKey(unit.block) === pricingKey(parsed.data.block) && pricingKey(unit.model) === pricingKey(parsed.data.model)
        && inventoryArea(unit) === parsed.data.area_sqm
        && (parsed.data.floor === null || inventoryFloor(unit.floor) === parsed.data.floor));
    if (!valid.length) throw new PricingSelectionError('Энэ блок, загвар, талбай, давхар, тоотын сонголт олдсонгүй', 404);
    const normalized = { ...parsed.data, block: valid[0].block!, model: valid[0].model!,
        floor: parsed.data.floor ?? (parsed.data.unit_id ? inventoryFloor(valid[0].floor) : null) };
    const lists = await loadActivePriceLists(db, shopId);
    if (normalized.floor === null && lists.length) return { available: false, reason: 'Үнэ бодохын өмнө давхар эсвэл тоотоо сонгоно уу', quote: null };
    return calculateListPricing(lists, normalized, asOf);
}
