import type { SupabaseClient } from '@supabase/supabase-js';
import {
    brandingFromRow, parseBrandingMediaPath, REPORT_BRANDING_COLUMNS,
    type ReportBranding, type ReportBrandingRow, type ReportBrandingSave,
} from './report-branding';

/**
 * Төслийн илтгэлийн брэндийн сервер талын дүрэм (`report_branding`, migration 20261023152000). Эрх (reports / settings
 * write, shop-ийн гишүүнчлэл)-ийг route шалгана; shop, зохиогчийг серверээс авна.
 */
type DbError = { code?: string; message: string } | null;

/** Хүснэгт байхгүй (migration ороогүй) эсэх. */
export const isMissingBrandingTable = (error: DbError) => !!error && (['42P01', 'PGRST205'].includes(error.code ?? '') || /report_branding.*(does not exist|could not find)|could not find the table/i.test(error.message));

/**
 * Төслийн брэнд. Хүснэгт байхгүй бол бүх талбар null (`available: false`); бусад уншилтын алдаа дамжина
 * (хоосон брэнд гэж нуухгүй).
 */
export async function readReportBranding(db: SupabaseClient, shopId: string): Promise<{ branding: ReportBranding; available: boolean }> {
    const { data, error } = await db.from('report_branding').select(REPORT_BRANDING_COLUMNS).eq('shop_id', shopId).maybeSingle();
    if (error) {
        if (isMissingBrandingTable(error)) return { branding: brandingFromRow(null), available: false };
        throw new Error(error.message);
    }
    return { branding: brandingFromRow(data as ReportBrandingRow | null), available: true };
}

/** Илтгэлийн (sales-team) ачаалагч: брэнд эсвэл бүх талбар null. */
export async function loadReportBranding(db: SupabaseClient, shopId: string): Promise<ReportBranding> {
    return (await readReportBranding(db, shopId)).branding;
}

/** Уншсан хувилбар одоогийнхтой ижил эсэх (PostgREST-ийн ижил мөр, эсвэл ижил агшин). */
function sameVersion(expected: string | null, current: string | null): boolean {
    if (expected === null || current === null) return false;
    if (expected === current) return true;
    const a = Date.parse(expected);
    return Number.isFinite(a) && a === Date.parse(current);
}

export type SaveBrandingResult =
    | { ok: true; branding: ReportBranding; removed: string[] }
    | { invalid: string }
    | { conflict: true }
    | { unavailable: true };

/**
 * Брэндийг бүхэлд нь солино. Зураг зөвхөн энэ shop-ийн `branding/` замд. `expectedUpdatedAt` уншсан үеийнхтэй таарахгүй
 * бол (өөр хүн хадгалсан) юу ч бичихгүй — `conflict`. Солигдсон/арилгасан зургийн замыг буцаана (route storage-оос устгана).
 * Одоо хадгалагдсанаас өөр (шинэ) зураг storage-д байх ёстой (`imageExists`): хуучин ноорог устгагдсан зургийн замыг
 * буцааж бичээд, хамтрагчийн шинэ зургийг «солигдсон» гэж устгуулахгүй.
 */
export async function saveReportBranding(
    db: SupabaseClient, shopId: string, actorId: string, input: ReportBrandingSave, imageExists: (path: string) => Promise<boolean>,
): Promise<SaveBrandingResult> {
    for (const path of [input.coverImagePath, input.logoPath]) {
        if (path && parseBrandingMediaPath(path)?.shopId !== shopId) return { invalid: 'Зургийг энэ төслийн брэндэд дахин оруулна уу.' };
    }
    const current = await db.from('report_branding').select(REPORT_BRANDING_COLUMNS).eq('shop_id', shopId).maybeSingle();
    if (current.error) {
        if (isMissingBrandingTable(current.error)) return { unavailable: true };
        throw new Error(current.error.message);
    }
    const before = current.data as ReportBrandingRow | null;
    // Хувилбарыг эхлээд: зэрэг засвар бол 409 (зураг шалгахаас өмнө). Бичихдээ DB-ийн нөхцлөөр дахин шалгана.
    if (before ? !sameVersion(input.expectedUpdatedAt, before.updated_at) : input.expectedUpdatedAt !== null) return { conflict: true };
    const stored = new Set([before?.cover_image_path, before?.logo_path].filter((path): path is string => !!path));
    for (const path of new Set([input.coverImagePath, input.logoPath])) {
        if (path && !stored.has(path) && !await imageExists(path)) return { invalid: 'Зураг олдсонгүй — зургаа дахин оруулаад хадгална уу.' };
    }
    const values = {
        display_name: input.displayName, footer_text: input.footerText, cover_image_path: input.coverImagePath, logo_path: input.logoPath,
        updated_at: new Date().toISOString(), updated_by: actorId,
    };
    let saved: ReportBrandingRow | null;
    if (!before) {
        const { data, error } = await db.from('report_branding').insert({ shop_id: shopId, ...values }).select(REPORT_BRANDING_COLUMNS).single();
        if (error) {
            if (error.code === '23505') return { conflict: true };
            if (isMissingBrandingTable(error)) return { unavailable: true };
            throw new Error(error.message);
        }
        saved = data as ReportBrandingRow;
    } else {
        if (input.expectedUpdatedAt === null) return { conflict: true };
        const { data, error } = await db.from('report_branding').update(values)
            .eq('shop_id', shopId).eq('updated_at', input.expectedUpdatedAt).select(REPORT_BRANDING_COLUMNS).maybeSingle();
        if (error) throw new Error(error.message);
        if (!data) return { conflict: true };
        saved = data as ReportBrandingRow;
    }
    const kept = new Set([saved.cover_image_path, saved.logo_path].filter((path): path is string => !!path));
    const removed = [before?.cover_image_path, before?.logo_path].filter((path): path is string => !!path && !kept.has(path));
    return { ok: true, branding: brandingFromRow(saved), removed };
}
