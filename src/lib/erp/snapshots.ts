import type { SupabaseClient } from '@supabase/supabase-js';
import type { ErpDataset, ErpRow } from './import';
import { isProductsDataset, isSalesDataset, parseErpProduct, readErpRecords } from './records';

export type ErpSnapshotKind = 'sales' | 'products';
export interface ErpSnapshotMeta { id: string; source: string; report_date: string; kind: ErpSnapshotKind | null }

/**
 * Тухайн өдөр хүртэлх ERP snapshot-уудын мета (шинээс хуучин руу). Төрлийг эхний sheet-ийн
 * баганаар танина: гэрээ (`property.sale`) эсвэл бүтээгдэхүүн. Бүрэн мөрийг уншихгүй.
 */
export async function listErpSnapshots(db: SupabaseClient, shopId: string, upTo: string, limit = 60): Promise<ErpSnapshotMeta[]> {
    const { data, error } = await db.from('erp_imports')
        .select('id, source, report_date, columns:datasets->0->columns')
        .eq('shop_id', shopId).lte('report_date', upTo)
        .order('report_date', { ascending: false }).order('sequence', { ascending: false })
        .range(0, limit - 1);
    if (error) throw error;
    return ((data ?? []) as Array<{ id: string; source: string; report_date: string; columns: unknown }>).map(row => {
        const columns = Array.isArray(row.columns) ? row.columns as string[] : null;
        return {
            id: row.id, source: row.source, report_date: row.report_date,
            kind: !columns ? null : isSalesDataset({ columns }) ? 'sales' : isProductsDataset({ columns }) ? 'products' : null,
        };
    });
}

/** Сонгосон snapshot-уудын бүх sheet-ийг нэг уншилтаар авна. */
export async function loadErpDatasets(db: SupabaseClient, shopId: string, ids: string[]): Promise<Map<string, ErpDataset[]>> {
    const datasets = new Map<string, ErpDataset[]>();
    const unique = [...new Set(ids)];
    if (!unique.length) return datasets;
    const { data, error } = await db.from('erp_imports').select('id, datasets').eq('shop_id', shopId).in('id', unique);
    if (error) throw error;
    for (const row of data ?? []) datasets.set(row.id as string, (row.datasets ?? []) as ErpDataset[]);
    return datasets;
}

/** Snapshot-ын тухайн төрлийн мөрүүдийг бүтэцтэй бичлэг болгоно. */
export function snapshotRecords<T>(meta: ErpSnapshotMeta | null, datasets: Map<string, ErpDataset[]>, parse: (row: ErpRow) => T | null) {
    if (!meta) return null;
    const detect = meta.kind === 'products' ? isProductsDataset : isSalesDataset;
    return { info: { date: meta.report_date, source: meta.source }, rows: readErpRecords(datasets.get(meta.id) ?? [], detect, parse) };
}

/**
 * Тухайн өдөр хүртэлх хамгийн сүүлийн бүтээгдэхүүний экспорт (байрны үлдэгдэл) — Лхагвын тайлантай
 * ижил сонголт. Экспорт байхгүй бол null; уншилтын алдаа шидэгдэнэ (хоосон нөөц гэж үзэхгүй).
 */
export async function loadLatestErpProducts(db: SupabaseClient, shopId: string, upTo: string) {
    const meta = (await listErpSnapshots(db, shopId, upTo)).find(snapshot => snapshot.kind === 'products') ?? null;
    if (!meta) return null;
    return snapshotRecords(meta, await loadErpDatasets(db, shopId, [meta.id]), parseErpProduct);
}
