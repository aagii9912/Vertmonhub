import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchAllRows } from '@/lib/utils/pagination';
import { ubDateStr } from '@/lib/utils/date';
import { PricingSelectionError } from './pricing-store';
import {
    UNIT_PRICE_CATEGORIES, UnitPriceDraftSchema, UnitPriceRetireSchema, UnitPriceSaveSchema, unitPriceConflict, unitPriceValidity,
    type UnitPriceCategory, type UnitPriceList, type UnitPriceListOverview, type UnitPriceRetireInput, type UnitPriceSaveInput, type UnitPriceSheet,
} from './unit-pricing';
import type { UnitPriceRegisterUnit } from './unit-pricing-import';

const COLUMNS = 'id,shop_id,list_key,list_name,category,version,status,config';
/** The table arrives with migration 20261127140000; until then the project simply has no per-unit prices. */
const notInstalled = (error: { code?: string; message?: string } | null) => error?.code === '42P01' || error?.code === 'PGRST205'
    || /project_unit_price_lists/.test(error?.message ?? '') && /does not exist|could not find/i.test(error?.message ?? '');

function listRow(row: Record<string, unknown>): UnitPriceList {
    const parsed = UnitPriceDraftSchema.safeParse(row.config);
    if (!parsed.success || typeof row.id !== 'string' || typeof row.shop_id !== 'string' || typeof row.list_key !== 'string' || typeof row.list_name !== 'string'
        || !UNIT_PRICE_CATEGORIES.includes(row.category as UnitPriceCategory) || !Number.isInteger(row.version) || !['draft', 'active', 'archived'].includes(String(row.status))) {
        throw new PricingSelectionError('Тоотын үнийн тохиргооны бүтэц буруу байна', 503);
    }
    return { ...parsed.data, id: row.id, shop_id: row.shop_id, list_key: row.list_key, list_name: row.list_name,
        category: row.category as UnitPriceCategory, version: Number(row.version), status: row.status as UnitPriceList['status'] };
}

/** The active version of every per-unit price list of the project. */
export async function loadActiveUnitPriceLists(db: SupabaseClient, shopId: string): Promise<UnitPriceList[]> {
    const { data, error } = await db.from('project_unit_price_lists').select(COLUMNS).eq('shop_id', shopId).eq('status', 'active').order('list_key').limit(100);
    if (error) {
        if (notInstalled(error)) return [];
        throw new PricingSelectionError('Тоотын үнийг уншиж чадсангүй. Дахин оролдоно уу', 503);
    }
    return (data ?? []).map(row => listRow(row as Record<string, unknown>));
}

/** Active lists as the price page shows them, with who activated each (names only, never account ids). */
export async function loadUnitPriceSheets(db: SupabaseClient, shopId: string, asOf = ubDateStr()): Promise<UnitPriceSheet[]> {
    const { data, error } = await db.from('project_unit_price_lists').select(`${COLUMNS},created_at,created_by`).eq('shop_id', shopId).eq('status', 'active').order('list_key').limit(100);
    if (error) {
        if (notInstalled(error)) return [];
        throw new PricingSelectionError('Тоотын үнийг уншиж чадсангүй. Дахин оролдоно уу', 503);
    }
    const rows = (data ?? []) as Array<Record<string, unknown> & { created_at: string; created_by: string }>;
    const names = new Map<string, string>();
    const actors = [...new Set(rows.map(row => row.created_by))];
    if (actors.length) {
        const profiles = await db.from('user_profiles').select('id,full_name').in('id', actors);
        if (profiles.error) throw new PricingSelectionError('Тоотын үнийг уншиж чадсангүй. Дахин оролдоно уу', 503);
        for (const profile of profiles.data ?? []) if (profile.full_name) names.set(profile.id, profile.full_name);
    }
    return rows.map(row => {
        const list = listRow(row);
        return { id: list.id, list_key: list.list_key, list_name: list.list_name, category: list.category, version: list.version,
            source: list.source, note: list.note, valid_from: list.valid_from, valid_until: list.valid_until, validity: unitPriceValidity(list, asOf),
            activated_at: row.created_at, activated_by: names.get(row.created_by) ?? null, conditions: list.conditions, rows: list.rows };
    });
}

/** Editor state: every list with its latest version (any status) and its active version. */
export async function loadUnitPriceOverview(db: SupabaseClient, shopId: string): Promise<{ installed: boolean; lists: UnitPriceListOverview[] }> {
    type Row = { id: string; list_key: string; list_name: string; category: UnitPriceCategory; version: number; status: string };
    const light = await db.from('project_unit_price_lists').select('id,list_key,list_name,category,version,status').eq('shop_id', shopId).order('version', { ascending: false }).limit(1000);
    if (light.error) {
        if (notInstalled(light.error)) return { installed: false, lists: [] };
        throw new PricingSelectionError('Тоотын үнийн тохиргоо уншиж чадсангүй', 503);
    }
    const lists = new Map<string, { key: string; name: string; category: UnitPriceCategory; latest: string; active: string | null }>();
    for (const row of (light.data ?? []) as Row[]) {
        const list = lists.get(row.list_key) ?? { key: row.list_key, name: row.list_name, category: row.category, latest: row.id, active: null };
        if (row.status === 'active') list.active = row.id;
        lists.set(row.list_key, list);
    }
    const ids = [...new Set([...lists.values()].flatMap(list => list.active ? [list.latest, list.active] : [list.latest]))];
    const configs = new Map<string, UnitPriceList>();
    if (ids.length) {
        const { data, error } = await db.from('project_unit_price_lists').select(COLUMNS).eq('shop_id', shopId).in('id', ids);
        if (error) throw new PricingSelectionError('Тоотын үнийн тохиргоо уншиж чадсангүй', 503);
        for (const row of data ?? []) { const list = listRow(row as Record<string, unknown>); configs.set(list.id, list); }
    }
    return { installed: true, lists: [...lists.values()].map((list): UnitPriceListOverview => ({
        key: list.key, name: list.name, category: list.category, latest: configs.get(list.latest) ?? null, active: list.active ? configs.get(list.active) ?? null : null,
    })).sort((a, b) => a.name.localeCompare(b.name, 'mn', { numeric: true })) };
}

function saveError(error: { code?: string; message?: string } | null, fallback: string): PricingSelectionError {
    if (notInstalled(error)) return new PricingSelectionError('Тоотын үнийн хүснэгт хараахан суулгагдаагүй байна (migration 20261127140000)', 503);
    if (error?.code === '40001') return new PricingSelectionError('Өөр хэрэглэгч үнийн тохиргоог өөрчилсөн байна. Дахин ачаална уу', 409);
    if (error?.code === '42501') return new PricingSelectionError('Үнийн тохиргоо засах эрх алга', 403);
    if (error?.code === '23505') return new PricingSelectionError('Ийм нэртэй үнийн жагсаалт байна. Өөр нэр өгнө үү');
    if (error?.code === '23P01') return new PricingSelectionError('Өөр идэвхтэй үнийн жагсаалттай давхцаж байна. Тоот эсвэл хүчинтэй хугацааг ялгана уу');
    if (error?.code === 'P0002') return new PricingSelectionError('Энэ жагсаалтад идэвхтэй үнэ алга', 404);
    if (error?.code === '22023') return new PricingSelectionError('Үнийн тохиргоо эсвэл идэвхжүүлэх нөхцөл буруу байна');
    return new PricingSelectionError(fallback, 503);
}

export async function saveUnitPriceList(db: SupabaseClient, shopId: string, actorId: string, input: UnitPriceSaveInput): Promise<UnitPriceList> {
    const parsed = UnitPriceSaveSchema.safeParse(input);
    if (!parsed.success) throw new PricingSelectionError(parsed.error.issues[0]?.message ?? 'Үнийн тохиргоо буруу байна');
    if (parsed.data.status === 'active') {
        // The RPC refuses the same overlap; this names the list and the unit for the admin.
        const others = (await loadActiveUnitPriceLists(db, shopId)).filter(list => list.list_key !== parsed.data.list_key);
        const conflict = unitPriceConflict(parsed.data.config, parsed.data.category, others);
        if (conflict) throw new PricingSelectionError(conflict);
    }
    const { data, error } = await db.rpc('save_project_unit_price_list', {
        p_shop_id: shopId, p_actor: actorId, p_list_key: parsed.data.list_key, p_list_name: parsed.data.list_name, p_category: parsed.data.category,
        p_expected_version: parsed.data.expected_version, p_status: parsed.data.status, p_config: parsed.data.config,
    });
    if (error || !data) throw saveError(error, 'Үнийн тохиргоо хадгалагдсангүй');
    return listRow(data as Record<string, unknown>);
}

/** Withdraws the list's active price without a replacement; the version stays archived. */
export async function retireUnitPriceList(db: SupabaseClient, shopId: string, actorId: string, input: UnitPriceRetireInput): Promise<UnitPriceList> {
    const parsed = UnitPriceRetireSchema.safeParse(input);
    if (!parsed.success) throw new PricingSelectionError(parsed.error.issues[0]?.message ?? 'Үнийн жагсаалт буруу байна');
    const { data, error } = await db.rpc('retire_project_unit_price_list', {
        p_shop_id: shopId, p_actor: actorId, p_list_key: parsed.data.list_key, p_expected_version: parsed.data.expected_version,
    });
    if (error || !data) throw saveError(error, 'Үнийг идэвхгүй болгож чадсангүй');
    return listRow(data as Record<string, unknown>);
}

/** The register's units of one kind, for checking an imported file's codes. */
export async function loadRegisterUnits(db: SupabaseClient, shopId: string, category: UnitPriceCategory): Promise<UnitPriceRegisterUnit[]> {
    type Row = { code: string | null; block: string | null; model: string | null; sale_area: number | string | null; updated_sale_area: number | string | null };
    let rows: Row[];
    try {
        rows = await fetchAllRows<Row>((from, to) => db.from('property_units').select('code,block,model,sale_area,updated_sale_area')
            .eq('shop_id', shopId).eq('category', category).order('id').range(from, to));
    } catch { throw new PricingSelectionError('Тоотын бүртгэлийг уншиж чадсангүй. Дахин оролдоно уу', 503); }
    return rows.flatMap(row => {
        const area = Number(row.updated_sale_area) > 0 ? Number(row.updated_sale_area) : Number(row.sale_area);
        return row.code ? [{ code: row.code.trim(), block: row.block, model: row.model, area_sqm: Number.isFinite(area) && area > 0 ? Math.round(area * 100) / 100 : null }] : [];
    });
}
