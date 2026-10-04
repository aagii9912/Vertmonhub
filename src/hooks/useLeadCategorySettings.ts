'use client';

import { useMutation, useQuery, useQueryClient, type Query } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { dashboardJson, dashboardMutate } from '@/lib/api/dashboardFetch';
import type { LeadCategoryTone } from '@/lib/leads/labels';
import type { LeadCategoryRow } from '@/hooks/useLeads';

/**
 * Тохиргоо → «Лидийн ангилал»: лидийн тоо ба бичих үйлдлүүд. Жагсаалт өөрөө `useLeadCategories`
 * (лидийн хуудсуудтай нэг cache); өөрчлөлт бүрийн дараа `lead-categories` cache шинэчлэгдэнэ.
 */
export interface LeadCategoryCounts {
    byCategory: Record<string, number>;
    uncategorized: number;
    /** Ямар нэг лидэд (устгасан лид орно) холбогдсон ангилал — устгах боломжгүй, архивлана. */
    referenced: string[];
}

/**
 * Ангилал бүрийн (устгаагүй) лидийн тоо. Сервер зөвхөн «Тохиргоо» эрхтэй, төслийн хүрээгээр
 * хязгаарлагдаагүй хэрэглэгчид буцаана; бусдад алдаа → тоо харагдахгүй (жагсаалтад нөлөөлөхгүй).
 */
export function useLeadCategoryCounts(enabled: boolean) {
    const { shop, user } = useAuth();
    return useQuery<LeadCategoryCounts | null>({
        queryKey: ['lead-categories', 'counts', shop?.id, user?.id, user?.role],
        queryFn: async () => (await dashboardJson<{ counts?: LeadCategoryCounts }>('/api/dashboard/lead-categories?include=archived&counts=1')).counts ?? null,
        enabled: enabled && !!shop?.id,
        staleTime: 30_000,
        retry: false,
        // Хувийн хүрээтэй хэрэглэгчид 403 ердийн — toast гаргахгүй, тоо л харагдахгүй.
        meta: { inlineError: true },
    });
}

export interface LeadCategoryDraft {
    name: string;
    description?: string | null;
    tone?: LeadCategoryTone;
    sort_order?: number;
}

function useInvalidateCategories() {
    const qc = useQueryClient();
    return () => {
        void qc.invalidateQueries({ queryKey: ['lead-categories'] });
        void qc.invalidateQueries({ queryKey: ['leads'] });
        void qc.invalidateQueries({ queryKey: ['operations-report'] });
    };
}

export function useCreateLeadCategory() {
    const onSettled = useInvalidateCategories();
    return useMutation({
        mutationFn: (draft: LeadCategoryDraft) => dashboardMutate<{ category: LeadCategoryRow }>('/api/dashboard/lead-categories', 'POST', draft),
        onSettled,
    });
}

export function useAddDefaultLeadCategories() {
    const onSettled = useInvalidateCategories();
    return useMutation({
        mutationFn: () => dashboardMutate<{ created: LeadCategoryRow[]; skipped: number }>('/api/dashboard/lead-categories', 'POST', { preset: 'defaults' }),
        onSettled,
    });
}

export function useUpdateLeadCategory() {
    const onSettled = useInvalidateCategories();
    return useMutation({
        mutationFn: ({ id, patch }: { id: string; patch: Partial<LeadCategoryDraft> & { is_active?: boolean } }) =>
            dashboardMutate<{ category: LeadCategoryRow }>(`/api/dashboard/lead-categories/${id}`, 'PATCH', patch),
        onSettled,
    });
}

/** Ангиллын жагсаалтын cache (`useLeadCategories`) — лидийн тооны query-г оруулахгүй. */
const isCategoryList = (query: Query) => query.queryKey[0] === 'lead-categories' && query.queryKey[1] !== 'counts';

/**
 * Дээш/доош: бүх ангиллын шинэ дарааллыг НЭГ хүсэлтээр хадгална. Жагсаалтад шууд (optimistic)
 * тусгаж, алдаа гарвал буцаана; дараа нь зөвхөн жагсаалт, үйл ажиллагааны тайланг шинэчилнэ
 * (лидийн тоо эрэмбээс хамаарахгүй тул дахин тоолохгүй).
 */
export function useReorderLeadCategories() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (order: string[]) => dashboardMutate<{ categories: LeadCategoryRow[] }>('/api/dashboard/lead-categories', 'PATCH', { order }),
        onMutate: async (order) => {
            await qc.cancelQueries({ predicate: isCategoryList });
            const previous = qc.getQueriesData<LeadCategoryRow[]>({ predicate: isCategoryList });
            const position = new Map(order.map((id, index) => [id, index]));
            qc.setQueriesData<LeadCategoryRow[]>({ predicate: isCategoryList }, (rows) => rows && [...rows]
                .sort((a, b) => (position.get(a.id) ?? rows.length) - (position.get(b.id) ?? rows.length))
                .map((row) => (position.has(row.id) ? { ...row, sort_order: (position.get(row.id)! + 1) * 10 } : row)));
            return { previous };
        },
        onError: (_error, _order, context) => {
            for (const [key, rows] of context?.previous ?? []) qc.setQueryData(key, rows);
        },
        onSettled: () => {
            void qc.invalidateQueries({ predicate: isCategoryList });
            void qc.invalidateQueries({ queryKey: ['operations-report'] });
        },
    });
}

export function useDeleteLeadCategory() {
    const onSettled = useInvalidateCategories();
    return useMutation({
        mutationFn: (id: string) => dashboardMutate<{ success: boolean }>(`/api/dashboard/lead-categories/${id}`, 'DELETE'),
        onSettled,
    });
}
