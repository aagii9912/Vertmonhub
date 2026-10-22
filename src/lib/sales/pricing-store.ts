import type { SupabaseClient } from '@supabase/supabase-js';
import { ProjectScopeError, applyProjectScope, canAccessProject, type SalesProjectScope } from './project-scope';
import { fetchAllRows } from '@/lib/utils/pagination';
import { ubDateStr } from '@/lib/utils/date';
import { soleShopProjectId } from '@/lib/projects/shop-project';
import { loadViewingOptions } from '@/lib/viewings/options';
import type { ViewingUnitOption } from '@/lib/viewings/interests';
import { elysiumViewingConditions } from './viewing-conditions';
import {
    PricingDraftSchema, PricingSaveSchema, PricingSelectionSchema, calculatePricing, inventoryArea, inventoryFloor, pricingKey,
    type PricingConfig, type PricingSaveInput, type PricingSelection, type PricingResult,
} from './pricing';
import { diffPricingRules, pricingValidity, withArchiveTimes, type PricingSheet, type PricingVersionSummary } from './pricing-history';

export class PricingSelectionError extends ProjectScopeError {
    constructor(message: string, status = 400) { super(status, message); }
}

function configRow(row: Record<string, unknown>): PricingConfig {
    const parsed = PricingDraftSchema.safeParse(row.config);
    if (!parsed.success || typeof row.id !== 'string' || typeof row.shop_id !== 'string'
        || !Number.isInteger(row.version) || !['draft', 'active', 'archived'].includes(String(row.status))) {
        throw new PricingSelectionError('Үнийн тохиргооны бүтэц буруу байна', 503);
    }
    return { ...parsed.data, id: row.id, shop_id: row.shop_id, version: Number(row.version), status: row.status as PricingConfig['status'] };
}

export async function loadActivePricing(db: SupabaseClient, shopId: string): Promise<PricingConfig | null> {
    const { data, error } = await db.from('project_pricing_configs').select('id,shop_id,version,status,config')
        .eq('shop_id', shopId).eq('status', 'active').order('version', { ascending: false }).limit(1).maybeSingle();
    if (error) throw new PricingSelectionError('Үнийн тохиргоо уншиж чадсангүй. Дахин оролдоно уу', 503);
    return data ? configRow(data) : null;
}

export async function loadViewingPricingConditions(db: SupabaseClient, shopId: string, scope: SalesProjectScope, asOf = ubDateStr(),
    options: { projectId?: string | null; units?: readonly ViewingUnitOption[] } = {}) {
    if (scope.projectIds !== null && !scope.projectIds.length) return { conditions: [], reason: 'Төсөлд бүртгэлгүй байна' };
    const projectId = options.projectId ?? await soleShopProjectId(db, shopId);
    if (!projectId || !canAccessProject(scope, projectId)) return { conditions: [], reason: 'Төслийн эрхгүй байна' };
    const { data: project, error } = await db.from('projects').select('id,name').eq('shop_id', shopId).eq('id', projectId).maybeSingle();
    if (error) throw new PricingSelectionError('Төслийн төлбөрийн нөхцөл уншиж чадсангүй. Дахин оролдоно уу', 503);
    if (!project) return { conditions: [], reason: 'Төсөл олдсонгүй' };
    const config = await loadActivePricing(db, shopId);
    if (config?.inventory_area_confirmed && config.valid_from && config.valid_until && asOf >= config.valid_from && asOf <= config.valid_until) {
        return { conditions: config.rules.map(({ block, model, floor_min, floor_max, payment_condition }) => ({ block, model, floor_min, floor_max, payment_condition })), reason: null };
    }
    // Interest terms can be selected without a monetary offer. Never derive a rate or an advance from their labels.
    const units = options.units ?? await loadViewingOptions(db, shopId, scope, projectId);
    const conditions = elysiumViewingConditions(project.name, units.filter(unit => unit.project_id === projectId));
    return { conditions, reason: conditions.length ? 'Нөхцөлөө сонгож хадгалж болно. Үнэ, урьдчилгааны дүн батлагдаагүй.' : 'Одоогийн баталсан үнэ, нөхцөл байхгүй' };
}

export async function loadPricingOverview(db: SupabaseClient, shopId: string) {
    const [{ data, error }, active] = await Promise.all([
        db.from('project_pricing_configs').select('id,shop_id,version,status,config').eq('shop_id', shopId)
            .order('version', { ascending: false }).limit(1).maybeSingle(),
        loadActivePricing(db, shopId),
    ]);
    if (error) throw new PricingSelectionError('Үнийн тохиргоо уншиж чадсангүй', 503);
    return { latest: data ? configRow(data) : null, active };
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
    id: string; version: number; status: 'active' | 'archived'; created_at: string; created_by: string;
    source: string | null; valid_from: string | null; valid_until: string | null;
};

/** Activated versions only, newest first. Archive time = the next activation, which archived it in the same RPC. */
export async function loadPricingHistory(db: SupabaseClient, shopId: string): Promise<PricingVersionSummary[]> {
    let rows: HistoryRow[];
    try {
        rows = await fetchAllRows<HistoryRow>((from, to) => db.from('project_pricing_configs')
            .select('id,version,status,created_at,created_by,source:config->>source,valid_from:config->>valid_from,valid_until:config->>valid_until')
            .eq('shop_id', shopId).in('status', ['active', 'archived']).order('version', { ascending: false }).range(from, to));
    } catch { throw new PricingSelectionError('Үнийн түүх уншиж чадсангүй. Дахин оролдоно уу', 503); }
    const actorIds = [...new Set(rows.map(row => row.created_by))];
    const names = new Map<string, string>();
    if (actorIds.length) {
        const { data, error } = await db.from('user_profiles').select('id,full_name').in('id', actorIds);
        if (error) throw new PricingSelectionError('Үнийн түүх уншиж чадсангүй. Дахин оролдоно уу', 503);
        for (const profile of data ?? []) if (profile.full_name) names.set(profile.id, profile.full_name);
    }
    return withArchiveTimes(rows).map(row => ({
        id: row.id, version: row.version, status: row.status,
        source: row.source ?? '', valid_from: row.valid_from, valid_until: row.valid_until,
        activated_at: row.created_at, activated_by: names.get(row.created_by) ?? null, archived_at: row.archived_at,
    }));
}

async function loadActivatedVersion(db: SupabaseClient, shopId: string, version: number): Promise<PricingConfig> {
    const { data, error } = await db.from('project_pricing_configs').select('id,shop_id,version,status,config')
        .eq('shop_id', shopId).eq('version', version).in('status', ['active', 'archived']).maybeSingle();
    if (error) throw new PricingSelectionError('Үнийн хувилбар уншиж чадсангүй. Дахин оролдоно уу', 503);
    if (!data) throw new PricingSelectionError('Үнийн хувилбар олдсонгүй', 404);
    return configRow(data);
}

/** Read only. Without a version the active one is shown; each version is compared with the one it replaced. */
export async function loadPricingSheet(db: SupabaseClient, shopId: string, options: { version?: number | null; asOf?: string } = {}): Promise<PricingSheet> {
    const asOf = options.asOf ?? ubDateStr();
    const history = await loadPricingHistory(db, shopId);
    const index = options.version ? history.findIndex(row => row.version === options.version) : history.findIndex(row => row.status === 'active');
    if (options.version && index < 0) throw new PricingSelectionError('Үнийн хувилбар олдсонгүй', 404);
    if (index < 0) return { as_of: asOf, history, selected: null };
    const summary = history[index], earlier = history[index + 1] ?? null;
    const [config, previous] = await Promise.all([
        loadActivatedVersion(db, shopId, summary.version),
        earlier ? loadActivatedVersion(db, shopId, earlier.version) : Promise.resolve(null),
    ]);
    const diff = diffPricingRules(config.rules, previous?.rules ?? null);
    return { as_of: asOf, history, selected: {
        ...summary, source: config.source, valid_from: config.valid_from, valid_until: config.valid_until,
        validity: pricingValidity(config, asOf), previous_version: earlier?.version ?? null, ...diff,
    } };
}

export async function savePricingConfig(db: SupabaseClient, shopId: string, actorId: string, input: PricingSaveInput): Promise<PricingConfig> {
    const parsed = PricingSaveSchema.safeParse(input);
    if (!parsed.success) throw new PricingSelectionError(parsed.error.issues[0]?.message ?? 'Үнийн тохиргоо буруу байна');
    const { data, error } = await db.rpc('save_project_pricing', {
        p_shop_id: shopId, p_actor: actorId, p_expected_version: parsed.data.expected_version,
        p_status: parsed.data.status, p_config: parsed.data.config,
    });
    if (error || !data) {
        if (error?.code === '40001') throw new PricingSelectionError('Өөр хэрэглэгч үнийн тохиргоог өөрчилсөн байна. Нооргоо хадгалаад дахин ачаална уу', 409);
        if (error?.code === '42501') throw new PricingSelectionError('Үнийн тохиргоо засах эрх алга', 403);
        if (error?.code === '22023') throw new PricingSelectionError('Үнийн тохиргоо эсвэл идэвхжүүлэх нөхцөл буруу байна');
        throw new PricingSelectionError('Үнийн тохиргоо хадгалагдсангүй', 503);
    }
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
    const config = await loadActivePricing(db, shopId);
    if (normalized.floor === null && config) return { available: false, reason: 'Үнэ бодохын өмнө давхар эсвэл тоотоо сонгоно уу', quote: null };
    return calculatePricing(config, normalized, asOf);
}
