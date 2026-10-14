/**
 * AI tool — маркетингийн контент төлөвлөгөө (get_content_plan): GET /api/marketing/content-plan-тэй
 * ижил дүрэм (`listContent`, ≤ 93 өдөр) ба `summarizeContentPlan`. Маркетинг өөрийн контент
 * төлөвлөгөөгөөр (төлөвлөсөн → нийтэлсэн) хэмжигдэнэ — лид, гэрээтэй холбохгүй. Зургийн хувийн
 * замыг модельд өгөхгүй, зөвхөн тоог нь.
 */
import { supabaseAdmin } from '@/lib/supabase';
import { ubDateStr } from '@/lib/utils/date';
import { CONTENT_STATUS_LABEL, CONTENT_TYPE_LABEL, ContentRangeSchema, contentPlatformLabel, summarizeContentPlan } from '@/lib/marketing/content-plan';
import { listContent } from '@/lib/marketing/content-plan-store';
import { marketingHomeWindow } from '@/lib/marketing/marketing-home';

type Args = Record<string, any>;
const MAX_ITEMS = 150;

export async function getContentPlanTool(shopId: string, args: Args) {
    const today = ubDateStr();
    const month = marketingHomeWindow(today).month;
    const range = ContentRangeSchema.safeParse({ from: args.from || month.from, to: args.to || month.to });
    if (!range.success) return { error: range.error.issues[0]?.message || 'from/to (YYYY-MM-DD, ≤ 93 өдөр) шалгана уу' };
    const result = await listContent(supabaseAdmin(), shopId, range.data);
    if ('error' in result) return { error: 'Контент төлөвлөгөөг уншиж чадсангүй. Дахин оролдоно уу.' };
    const summary = summarizeContentPlan(result.items, range.data, today);
    return {
        range: range.data,
        today,
        totals: {
            planned: summary.planned, published: summary.published, in_progress: summary.inProgress,
            overdue: summary.overdue, cancelled: summary.cancelled, published_pct: summary.pct,
        },
        by_type: summary.byType.map(row => ({ type: row.label, planned: row.planned, published: row.published })),
        items: summary.items.slice(0, MAX_ITEMS).map(item => ({
            date: item.scheduled_date, time: item.scheduled_time, title: item.title,
            type: CONTENT_TYPE_LABEL[item.type] ?? item.type, platform: contentPlatformLabel(item.platform),
            status: CONTENT_STATUS_LABEL[item.status] ?? item.status, assigned_to: item.assigned_to,
            overdue: item.status !== 'published' && item.status !== 'cancelled' && item.scheduled_date < today,
            images: item.image_paths.length,
        })),
        truncated: summary.items.length > MAX_ITEMS,
        guidance: summary.items.length
            ? 'Гүйцэтгэл = нийтэлсэн / төлөвлөсөн (цуцалсныг тооцохгүй). Хоцорсон = огноо өнгөрсөн, нийтлээгүй. Лид, гэрээгээр бүү дүгнэ.'
            : 'Энэ хугацаанд контент төлөвлөөгүй (Маркетинг → Контент календарь). Тоо бүү зохио.',
    };
}
