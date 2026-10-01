import type { SupabaseClient } from '@supabase/supabase-js';
import type { InventoryUnitInsert } from './units';

export interface InventoryPreviewGroup {
    phase: string;
    block: string;
    category: string;
    total: number;
    statuses: Record<string, number>;
}

export interface InventoryImportPreview {
    total: number;
    fresh: number;
    existing: number;
    groups: InventoryPreviewGroup[];
}

export interface InventoryImportResult {
    success: boolean;
    imported: number;
    skipped: number;
    message: string;
    errors?: string[];
    preview?: InventoryImportPreview;
}

interface UnitIdentity {
    shop_id: string;
    phase: string;
    category: string;
    code: string;
}

interface ExistingUnit extends UnitIdentity {
    id: string;
    project_id: string | null;
    block: string | null;
}

const CODE_BATCH = 200;
const READ_PAGE = 1000;

function identity(unit: UnitIdentity): string {
    return JSON.stringify([unit.shop_id.toLowerCase(), unit.phase, unit.category, unit.code]);
}

function failure(message: string, errors: string[] = [message], skipped = 0): InventoryImportResult {
    return { success: false, imported: 0, skipped, message, errors };
}

function previewGroups(rows: InventoryUnitInsert[]): InventoryPreviewGroup[] {
    const groups = new Map<string, InventoryPreviewGroup>();
    for (const row of rows) {
        const key = JSON.stringify([row.phase, row.block, row.category]);
        const group = groups.get(key) ?? {
            phase: row.phase, block: row.block, category: row.category, total: 0, statuses: {},
        };
        group.total += 1;
        group.statuses[row.status] = (group.statuses[row.status] ?? 0) + 1;
        groups.set(key, group);
    }
    return [...groups.values()];
}

/** Баталгаажуулсан шинэ нэгжүүдийг нэг INSERT-ээр нэмнэ; одоо байгаа нөөцийг өөрчлөхгүй. */
export async function importInventoryUnits(
    db: SupabaseClient,
    rows: InventoryUnitInsert[],
    preview: boolean,
): Promise<InventoryImportResult> {
    if (!rows.length) return failure('Импортлох хүчинтэй нэгж байхгүй байна.');

    const source = new Map<string, InventoryUnitInsert>();
    const shops = new Map<string, { phases: Set<string>; codes: Set<string> }>();
    const inputErrors: string[] = [];
    for (const [index, row] of rows.entries()) {
        const required = [row.shop_id, row.project_id, row.phase, row.block, row.category, row.code];
        if (required.some((value) => typeof value !== 'string' || !value.trim())) {
            inputErrors.push(`Мөр ${index + 2}: Байгууллага, төсөл, ээлж, блок, ангилал, код бүрэн байх ёстой.`);
            continue;
        }
        const key = identity(row);
        if (source.has(key)) {
            inputErrors.push(`Мөр ${index + 2}: ${row.code} код ${row.phase} ээлжийн ${row.category} ангилалд давхардсан байна.`);
            continue;
        }
        source.set(key, row);
        const shopId = row.shop_id.toLowerCase();
        const shop = shops.get(shopId) ?? { phases: new Set<string>(), codes: new Set<string>() };
        shop.phases.add(row.phase);
        shop.codes.add(row.code);
        shops.set(shopId, shop);
    }
    if (inputErrors.length) return failure('Файлын нэгжийн таних мэдээлэл зөрчилтэй тул импорт зогслоо.', inputErrors);

    const existing = new Map<string, ExistingUnit>();
    try {
        for (const [shopId, scope] of shops) {
            const codes = [...scope.codes];
            for (let offset = 0; offset < codes.length; offset += CODE_BATCH) {
                const batch = codes.slice(offset, offset + CODE_BATCH);
                for (let from = 0; ; from += READ_PAGE) {
                    const { data, error } = await db.from('property_units')
                        .select('id, shop_id, project_id, phase, block, category, code')
                        .eq('shop_id', shopId)
                        .in('phase', [...scope.phases])
                        .in('code', batch)
                        .order('id')
                        .range(from, from + READ_PAGE - 1);
                    if (error) return failure(`Нөөцийн давхардлыг шалгаж чадсангүй: ${error.message}`);
                    if (!Array.isArray(data)) return failure('Нөөцийн давхардлын шалгалтын хариу дутуу байна.');
                    for (const record of data as ExistingUnit[]) {
                        if ([record.id, record.shop_id, record.phase, record.category, record.code]
                            .some((value) => typeof value !== 'string' || !value)) {
                            return failure('Нөөцийн давхардлын шалгалтын таних мэдээлэл дутуу байна.');
                        }
                        const key = identity(record);
                        if (!source.has(key)) continue;
                        if (existing.has(key)) {
                            return failure(`${record.code}: Нөөцийн санд ижил таних мэдээлэлтэй олон нэгж байна.`);
                        }
                        existing.set(key, record);
                    }
                    if (data.length < READ_PAGE) break;
                }
            }
        }
    } catch (error) {
        return failure(`Нөөцийн давхардлыг шалгаж чадсангүй: ${error instanceof Error ? error.message : 'Тодорхойгүй алдаа'}`);
    }

    const fresh: InventoryUnitInsert[] = [];
    const conflicts: string[] = [];
    for (const row of rows) {
        const record = existing.get(identity(row));
        if (!record) {
            fresh.push(row);
        } else if (record.project_id?.toLowerCase() !== row.project_id.toLowerCase() || record.block !== row.block) {
            conflicts.push(`${row.code}: Ижил кодын нэгж өөр төсөл/блокт бүртгэлтэй эсвэл төслийн холбоосгүй байна.`);
        }
    }
    if (conflicts.length) return failure('Нөөцийн төсөл/блокийн холбоос зөрчилтэй тул импорт зогслоо.', conflicts);

    const skipped = rows.length - fresh.length;
    if (preview) {
        return {
            success: true, imported: 0, skipped,
            message: `Урьдчилсан шалгалт: ${fresh.length} шинэ, ${skipped} бүртгэлтэй нэгж.`,
            preview: { total: rows.length, fresh: fresh.length, existing: skipped, groups: previewGroups(rows) },
        };
    }
    if (!fresh.length) return { success: true, imported: 0, skipped, message: `${skipped} нэгж өмнө нь бүртгэлтэй байна.` };

    try {
        // Багцлахгүй: нэг мөрийн UNIQUE зөрчил бүх шинэ нэгжийн INSERT-ийг буцаана.
        const { data, error, count } = await db.from('property_units')
            .insert(fresh, { count: 'exact' })
            .select('id');
        if (error) {
            const message = error.code === '23505'
                ? 'Шалгалтын дараа ижил нэгж бүртгэгдсэн тул импорт зогслоо. Урьдчилсан шалгалт хийгээд дахин оролдоно уу.'
                : `Нөөцийн импорт амжилтгүй: ${error.message}`;
            return failure(message, [message], skipped);
        }
        const ids = Array.isArray(data) ? data.map((row: { id?: unknown }) => row.id) : [];
        const validIds = ids.length > 0 && ids.every((id) => typeof id === 'string' && id.length > 0)
            && new Set(ids).size === ids.length;
        // PostgREST олон мөрийн буцаах хариуг хязгаарлаж болох тул exact count-ийг мөн шалгана.
        const confirmed = validIds && (count == null ? ids.length === fresh.length : count === fresh.length)
            && ids.length <= fresh.length;
        if (!confirmed) {
            return failure('Хадгалалтын хариу дутуу байна. Нэгжүүд хадгалагдсан байж болох тул урьдчилсан шалгалт хийгээд дахин оролдоно уу.', undefined, skipped);
        }
        return {
            success: true, imported: fresh.length, skipped,
            message: `${fresh.length} шинэ нэгж импортлогдлоо.${skipped ? ` ${skipped} бүртгэлтэй нэгжийг алгаслаа.` : ''}`,
        };
    } catch (error) {
        return failure(`Хадгалалтын хариу авч чадсангүй. Урьдчилсан шалгалт хийгээд дахин оролдоно уу: ${error instanceof Error ? error.message : 'Тодорхойгүй алдаа'}`, undefined, skipped);
    }
}
