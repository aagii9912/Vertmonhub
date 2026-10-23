import { z } from 'zod';
import { brandingMediaUrl, parseBrandingMediaPath } from './report-media';

/**
 * Төслийн илтгэлийн брэнд (W17, client-safe): харагдах нэр («ЭЛИЗИУМ»), хөл бичвэр («ВЕРТМОН ПРОПЕРТИС»), нүүрний
 * зураг ба лого (хувийн `report-media` bucket, `branding/<shop_id>/…`). Лхагвын багийн загварын илтгэлд (sales-team)
 * хэрэглэнэ; одоогийн борлуулалт, маркетингийн илтгэлийн мастер, нүүрийг өөрчлөхгүй.
 * Унших = reports (эсвэл тохиргоо засах settings), бичих = settings write (`/api/dashboard/report-branding`).
 */
export const REPORT_BRANDING_LIMITS = { displayName: 80, footerText: 120 } as const;
export { brandingMediaUrl, parseBrandingMediaPath, REPORT_BRANDING_MEDIA_ENDPOINT } from './report-media';

export interface ReportBranding {
    displayName: string | null;
    footerText: string | null;
    coverImagePath: string | null;
    logoPath: string | null;
    /** Сүүлд хадгалсан (зэрэг засварын шалгалтад `expectedUpdatedAt`); хадгалаагүй бол null. */
    updatedAt: string | null;
}

export const EMPTY_REPORT_BRANDING: ReportBranding = { displayName: null, footerText: null, coverImagePath: null, logoPath: null, updatedAt: null };

/** GET хариу: `available: false` = хүснэгт (migration 20261023152000) хараахан алга — бүх талбар null. */
export interface ReportBrandingResponse { branding: ReportBranding; available: boolean }

/** Зургийн хаяг (хувийн, татах бүрд эрх шалгана) — зураггүй бол null. */
export const brandingImageUrl = (path: string | null) => (path ? brandingMediaUrl(path) : null);

/** Хоосон мөр = null (тодорхойгүй), үгүй бол тайрсан бичвэр. */
const text = (max: number, label: string) => z.string().trim().max(max, `${label} ${max} тэмдэгтээс ихгүй байна`)
    .transform(value => value || null).nullable();
const imagePath = z.string().refine(value => !!parseBrandingMediaPath(value), 'Зургийн зам буруу байна').nullable();

/** PUT: бүх талбарыг солино (хоосон = арилгана); `expectedUpdatedAt` = уншсан үеийн `updatedAt` (шинэ бол null). */
export const ReportBrandingSaveSchema = z.object({
    displayName: text(REPORT_BRANDING_LIMITS.displayName, 'Харагдах нэр'),
    footerText: text(REPORT_BRANDING_LIMITS.footerText, 'Хөл бичвэр'),
    coverImagePath: imagePath,
    logoPath: imagePath,
    expectedUpdatedAt: z.string().max(64).refine(value => !Number.isNaN(Date.parse(value)), 'Огноо буруу').nullable(),
}).strict();
export type ReportBrandingSave = z.output<typeof ReportBrandingSaveSchema>;

export const REPORT_BRANDING_COLUMNS = 'display_name,footer_text,cover_image_path,logo_path,updated_at';

export interface ReportBrandingRow {
    display_name: string | null;
    footer_text: string | null;
    cover_image_path: string | null;
    logo_path: string | null;
    updated_at: string | null;
}

export function brandingFromRow(row: ReportBrandingRow | null | undefined): ReportBranding {
    if (!row) return { ...EMPTY_REPORT_BRANDING };
    return {
        displayName: row.display_name ?? null,
        footerText: row.footer_text ?? null,
        coverImagePath: row.cover_image_path ?? null,
        logoPath: row.logo_path ?? null,
        updatedAt: row.updated_at ?? null,
    };
}
