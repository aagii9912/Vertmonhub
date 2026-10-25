import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

/**
 * Менежерийн бүртгэлийн нэрийг солих (W15, ижил хүн — жишээ нь «Khongoroo» → «Хонгорзул.Мөнхгэрэл»).
 * `rename_sales_manager` RPC (migration 20261023150000) бүртгэл ба тэр нэрийг түлхүүр болгосон багана бүрийг
 * (лид, уулзалт, гэрээ, санал гомдол, өдрийн тайлан, KPI, төслийн харьяалал…) нэг гүйлгээнд солино.
 * «Хэн оруулсан» тамга, өөрчлөлтийн түүх хуучин нэрээрээ үлдэнэ. Клиентэд аюулгүй (RPC-ийн дуудлага зөвхөн серверт).
 */
export const SalesManagerRenameSchema = z.object({
    shopId: z.guid(),
    oldName: z.string().min(1).max(120),
    newName: z.string().trim().min(1).max(120),
}).strict().refine(input => input.oldName !== input.newName, { message: 'Шинэ нэр одоогийн нэртэй ижил байна', path: ['newName'] });
export type SalesManagerRenameInput = z.infer<typeof SalesManagerRenameSchema>;

export interface SalesManagerRenameResult { oldName: string; newName: string; counts: Record<string, number> }

/** RPC-ийн тоолсон хүснэгт → дэлгэцийн нэр (харуулах дараалал). */
export const RENAME_COUNT_LABELS: Record<string, string> = {
    leads: 'лид', property_viewings: 'уулзалт', property_contracts: 'гэрээ', customers: 'харилцагч',
    service_logs: 'санал гомдол', daily_report_counts: 'өдрийн тайлангийн нүд', daily_report_settings: 'тайлангийн загвар',
    sales_kpi_months: 'KPI сар', sales_manager_projects: 'төслийн харьяалал', property_units: 'байр', sales_targets: 'хуучин төлөвлөгөө',
};

/** «12 лид, 9 уулзалт, 3 гэрээ» — тэгээс их тоотой хүснэгтүүд. */
export function renameCountsText(counts: Record<string, number>): string {
    const parts = Object.entries(RENAME_COUNT_LABELS).filter(([key]) => (counts[key] ?? 0) > 0)
        .map(([key, label]) => `${counts[key].toLocaleString('en-US')} ${label}`);
    return parts.length ? parts.join(', ') : 'бусад бүртгэлд энэ нэр байгаагүй';
}

/** Service-only: эрх (super_admin, төслийн хандалт)-ийг RPC дахин шалгана; алдааг PostgREST хэлбэрээр буцаана. */
export async function renameSalesManager(
    db: SupabaseClient, input: SalesManagerRenameInput, actorId: string,
): Promise<{ data: SalesManagerRenameResult | null; error: { code?: string; message: string } | null }> {
    const parsed = SalesManagerRenameSchema.parse(input);
    const { data, error } = await db.rpc('rename_sales_manager', {
        p_shop_id: parsed.shopId, p_old: parsed.oldName, p_new: parsed.newName, p_actor: actorId,
    });
    if (error) return { data: null, error };
    const result = (data ?? {}) as { old_name?: unknown; new_name?: unknown; counts?: Record<string, unknown> };
    return {
        data: {
            oldName: typeof result.old_name === 'string' ? result.old_name : parsed.oldName,
            newName: typeof result.new_name === 'string' ? result.new_name : parsed.newName,
            counts: Object.fromEntries(Object.entries(result.counts ?? {}).map(([key, value]) => [key, Number(value) || 0])),
        },
        error: null,
    };
}
