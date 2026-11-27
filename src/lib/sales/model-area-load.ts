import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchAllRows } from '@/lib/utils/pagination';
import { inventoryArea } from './pricing';
import { buildModelAreas, type ModelAreaRow } from './model-area';

/** The column arrives with migration 20261127150000; until then no project shows «загвар + м²». */
const missingColumn = (error: { code?: string; message?: string }) => error.code === '42703' || error.code === 'PGRST204'
    || /model_with_area/.test(error.message ?? '') && /does not exist|could not find/i.test(error.message ?? '');

/**
 * Whether the project names a model together with its area (`projects.model_with_area`, Admin → Төслүүд).
 * Without `projectId` it is the shop's single project; a shop with several rows has no switch.
 */
export async function projectShowsModelArea(db: SupabaseClient, shopId: string, projectId?: string | null): Promise<boolean> {
    let query = db.from('projects').select('id,model_with_area').eq('shop_id', shopId);
    if (projectId) query = query.eq('id', projectId);
    const { data, error } = await query.order('id').limit(2);
    if (error) {
        if (missingColumn(error)) return false;
        throw error;
    }
    return data?.length === 1 && data[0].model_with_area === true;
}

/** Block × model × area of the register's apartments; empty when the project's switch is off. */
export async function loadModelAreas(db: SupabaseClient, shopId: string): Promise<ModelAreaRow[]> {
    if (!await projectShowsModelArea(db, shopId)) return [];
    type Row = { block: string | null; model: string | null; floor: string | null; sale_area: number | string | null; updated_sale_area: number | string | null; contracted_area: number | string | null };
    const rows = await fetchAllRows<Row>((from, to) => db.from('property_units').select('block,model,floor,sale_area,updated_sale_area,contracted_area')
        .eq('shop_id', shopId).eq('category', 'residential').order('id').range(from, to));
    return buildModelAreas(rows.map(row => {
        const floor = row.floor?.match(/^\s*(\d+)\s*$/);
        return { block: row.block, model: row.model, floor: floor ? Number(floor[1]) : null, area_sqm: inventoryArea(row) };
    }));
}
