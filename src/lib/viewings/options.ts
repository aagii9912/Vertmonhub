import type { SupabaseClient } from '@supabase/supabase-js';
import { applyProjectScope, type SalesProjectScope } from '@/lib/sales/project-scope';
import { fetchAllRows } from '@/lib/utils/pagination';
import type { ViewingUnitOption } from './interests';
import { inventoryArea } from '@/lib/sales/pricing';

export async function loadViewingOptions(db: SupabaseClient, shopId: string, scope: SalesProjectScope, projectId?: string | null): Promise<ViewingUnitOption[]> {
    type Row = { id: string; project_id: string | null; block: string | null; model: string | null; sale_area: number | null; updated_sale_area: number | null; contracted_area: number | null; floor: string | null; unit_number: string | null; code: string; status: string };
    const rows = await fetchAllRows<Row>((from, to) => applyProjectScope(db.from('property_units')
        .select('id,project_id,block,model,sale_area,updated_sale_area,contracted_area,floor,unit_number,code,status')
        .eq('shop_id', shopId).eq('category', 'residential').order('id'), projectId ? { ...scope, projectIds: scope.projectIds === null || scope.projectIds.includes(projectId) ? [projectId] : [] } : scope).range(from, to));
    const units: ViewingUnitOption[] = rows.flatMap(row => {
        const area = inventoryArea(row);
        const floor = row.floor?.match(/^\s*(\d+)\s*$/);
        if (!row.block || !row.model || area == null) return [];
        return [{ id: row.id, project_id: row.project_id, block: row.block, model: row.model, area_sqm: area,
            floor: floor ? Number(floor[1]) : null, unit_number: row.unit_number, code: row.code, status: row.status }];
    });
    return units;
}
