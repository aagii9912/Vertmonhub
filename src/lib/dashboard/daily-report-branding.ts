import type { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '@/lib/utils/logger';
import { brandingImageUrl } from './report-branding';
import { readReportBranding } from './report-branding-store';

/** «Өдрийн тайлан»-гийн толгойн зураг: төслийн нүүрний зураг ба лого (хувийн хаяг, татах бүрд эрх шалгана). */
export interface DailyReportBranding { coverUrl: string | null; logoUrl: string | null }

/**
 * Төслийн брэнд зураг (Тохиргоо → «Тайлангийн брэнд»). Зураггүй бол null; уншилтын алдаа тайланг зогсоохгүй —
 * зураг нь чимэглэл тул лог үлдээгээд зураггүй толгойгоор гарна.
 */
export async function loadDailyReportBranding(db: SupabaseClient, shopId: string): Promise<DailyReportBranding | null> {
    try {
        const { branding } = await readReportBranding(db, shopId);
        const coverUrl = brandingImageUrl(branding.coverImagePath), logoUrl = brandingImageUrl(branding.logoPath);
        return coverUrl || logoUrl ? { coverUrl, logoUrl } : null;
    } catch (error) {
        logger.error('[daily-report] branding read failed', { error });
        return null;
    }
}
