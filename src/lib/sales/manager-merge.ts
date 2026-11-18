import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

/**
 * Ижил хүний давхар бүртгэлийг нэгтгэх (2026-11-18, Mandala Garden: акаунтын латин нэрээр үүссэн «Nomin» ба гэрээтэй
 * «Номин.Одончимэг»). `merge_sales_managers` RPC (migration 20261118120000) source нэрийн бүх лавлагааг (лид, уулзалт,
 * гэрээ, өдрийн тайлан, KPI, төслийн харьяалал, ажлын төлөвлөгөөний хариуцагч…) байгаа target нэр рүү нэг гүйлгээнд
 * шилжүүлж source мөрийг бүртгэлээс хасна. Target акаунтгүй бол source-ийн акаунтыг авна; аль нэг нь идэвхтэй бол идэвхтэй.
 * Хоёр нэр нэг өдрийн тайлангийн нүд эсвэл KPI сард зэрэг утгатай, эсвэл өөр өөр акаунттай бол юу ч бичихгүй.
 * Клиентэд аюулгүй (RPC-ийн дуудлага зөвхөн серверт).
 */
export const SalesManagerMergeSchema = z.object({
    shopId: z.guid(),
    source: z.string().min(1).max(120),
    target: z.string().min(1).max(120),
}).strict().refine(input => input.source !== input.target, { message: 'Нэгтгэх хоёр өөр менежерийг сонгоно уу', path: ['target'] });
export type SalesManagerMergeInput = z.infer<typeof SalesManagerMergeSchema>;

export interface SalesManagerMergeResult {
    source: string; target: string; counts: Record<string, number>;
    /** Target акаунтгүй байсан тул source-ийн акаунт шилжсэн. */
    userLinked: boolean;
    isActive: boolean;
}

/** Service-only: эрх (super_admin, төслийн хандалт)-ийг RPC дахин шалгана; алдааг PostgREST хэлбэрээр буцаана. */
export async function mergeSalesManagers(
    db: SupabaseClient, input: SalesManagerMergeInput, actorId: string,
): Promise<{ data: SalesManagerMergeResult | null; error: { code?: string; message: string } | null }> {
    const parsed = SalesManagerMergeSchema.parse(input);
    const { data, error } = await db.rpc('merge_sales_managers', {
        p_shop_id: parsed.shopId, p_source: parsed.source, p_target: parsed.target, p_actor: actorId,
    });
    if (error) return { data: null, error };
    const result = (data ?? {}) as { source_name?: unknown; target_name?: unknown; counts?: Record<string, unknown>; user_linked?: unknown; is_active?: unknown };
    return {
        data: {
            source: typeof result.source_name === 'string' ? result.source_name : parsed.source,
            target: typeof result.target_name === 'string' ? result.target_name : parsed.target,
            counts: Object.fromEntries(Object.entries(result.counts ?? {}).map(([key, value]) => [key, Number(value) || 0])),
            userLinked: result.user_linked === true,
            isActive: result.is_active === true,
        },
        error: null,
    };
}
