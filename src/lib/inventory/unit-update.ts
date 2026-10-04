import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

/**
 * Байрны бүртгэлийн нэгжийг (`property_units`) гараар засах нэг дүрэм — PATCH /api/dashboard/units
 * ба AI `update_unit`. Зөвхөн доорх талбар; хоосон текст нь null. Багануудын урт DB-тэй ижил.
 */
const text = (max: number) => z.string().trim().max(max).nullable().optional();
const area = z.number().min(0).max(99_999_999.99).nullable().optional();

export const UnitUpdateSchema = z.object({
    status: z.enum(['available', 'reserved', 'ordered', 'sold', 'handed_over']).optional(),
    raw_status: text(50),
    sales_channel: text(50),
    sales_manager: text(255),
    unit_type: text(30),
    model: text(50),
    window_view: text(50),
    rooms: z.number().int().min(0).max(50).nullable().optional(),
    sale_area: area,
    updated_sale_area: area,
    contracted_area: area,
    unit_number: text(50),
    legacy_unit_number: text(50),
    floor: text(20),
    block: text(50),
    phase: text(50),
    category: z.enum(['residential', 'commercial', 'parking', 'industry']).optional(),
});
export type UnitUpdate = z.infer<typeof UnitUpdateSchema>;

const UNIT_FIELD_LABEL: Record<keyof UnitUpdate, string> = {
    status: 'Төлөв', raw_status: 'Эх төлөв', sales_channel: 'Борлуулалтын суваг', sales_manager: 'Борлуулалтын менежер',
    unit_type: 'Айлын төрөл', model: 'Загвар', window_view: 'Цонхны харагдац', rooms: 'Өрөөний тоо',
    sale_area: 'Борлуулах талбай', updated_sale_area: 'Шинэчилсэн талбай', contracted_area: 'Гэрээлсэн талбай',
    unit_number: 'Тоот', legacy_unit_number: 'Хуучин тоот', floor: 'Давхар', block: 'Блок', phase: 'Ээлж', category: 'Ангилал',
};
export const unitFieldLabel = (key: string) => UNIT_FIELD_LABEL[key as keyof UnitUpdate] ?? key;

/** Body-гоос зөвхөн зөвшөөрсөн талбарыг авч шалгана; хоосон текстийг null болгоно. */
export function parseUnitUpdate(body: Record<string, unknown>): { ok: true; changes: UnitUpdate } | { ok: false; error: string } {
    const input = Object.fromEntries(Object.entries(body)
        .filter(([key]) => Object.hasOwn(UNIT_FIELD_LABEL, key))
        .map(([key, value]) => [key, value === '' ? null : value]));
    const parsed = UnitUpdateSchema.safeParse(input);
    if (!parsed.success) {
        const issue = parsed.error.issues[0];
        return { ok: false, error: `${unitFieldLabel(String(issue?.path[0] ?? ''))}: буруу утга` };
    }
    const changes = Object.fromEntries(Object.entries(parsed.data)
        .filter(([, value]) => value !== undefined)
        .map(([key, value]) => [key, value === '' ? null : value])) as UnitUpdate;
    if (!Object.keys(changes).length) return { ok: false, error: 'Засах талбар алга' };
    return { ok: true, changes };
}

export async function updateInventoryUnit(db: SupabaseClient, shopId: string, unitId: string, body: Record<string, unknown>) {
    const parsed = parseUnitUpdate(body);
    if (!parsed.ok) return { error: parsed.error, status: 400 as const };
    const { data, error } = await db.from('property_units')
        .update({ ...parsed.changes, updated_at: new Date().toISOString() })
        .eq('id', unitId).eq('shop_id', shopId)
        .select().maybeSingle();
    if (error) return { error: 'Нэгж засахад алдаа гарлаа', status: 500 as const, cause: error };
    if (!data) return { error: 'Нэгж олдсонгүй', status: 404 as const };
    return { unit: data as Record<string, unknown> };
}
