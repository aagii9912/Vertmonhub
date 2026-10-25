'use client';

import { useMutation, useQuery, useQueryClient, type Query } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { dashboardJson, dashboardMutate } from '@/lib/api/dashboardFetch';
import type { ReferralSource } from '@/lib/sales/referral-sources';
import type { ContractRow } from '@/hooks/useContracts';

/**
 * «Сэжим (хаанаас ирсэн)»: төслийн жагсаалт (архивласан орно — засвар, тохиргоонд) ба тохиргооны бичилтүүд.
 * Уулзалтын маягт, гэрээний дэлгэрэнгүй, Тохиргоо нэг cache-тэй.
 */
export interface ReferralSourcesResult {
    sources: ReferralSource[];
    /** false = migration ороогүй (жагсаалт хоосон; уулзалт бүртгэхийг хаахгүй). */
    available: boolean;
}

export function useReferralSources(options: { inlineError?: boolean; enabled?: boolean } = {}) {
    const { shop, user } = useAuth();
    return useQuery<ReferralSourcesResult>({
        queryKey: ['referral-sources', shop?.id, user?.id, user?.role],
        queryFn: () => dashboardJson<ReferralSourcesResult>('/api/dashboard/referral-sources?include=archived'),
        enabled: !!shop?.id && options.enabled !== false,
        staleTime: 5 * 60_000,
        retry: false,
        ...(options.inlineError ? { meta: { inlineError: true } } : {}),
    });
}

function useInvalidateReferralSources() {
    const qc = useQueryClient();
    return () => { void qc.invalidateQueries({ queryKey: ['referral-sources'] }); };
}

export function useCreateReferralSource() {
    const onSettled = useInvalidateReferralSources();
    return useMutation({
        mutationFn: (name: string) => dashboardMutate<{ source: ReferralSource }>('/api/dashboard/referral-sources', 'POST', { name }),
        onSettled,
    });
}

export function useAddDefaultReferralSources() {
    const onSettled = useInvalidateReferralSources();
    return useMutation({
        mutationFn: () => dashboardMutate<{ created: ReferralSource[]; skipped: number }>('/api/dashboard/referral-sources', 'POST', { preset: 'defaults' }),
        onSettled,
    });
}

export function useUpdateReferralSource() {
    const onSettled = useInvalidateReferralSources();
    return useMutation({
        mutationFn: ({ id, patch }: { id: string; patch: { name?: string; archived?: boolean } }) =>
            dashboardMutate<{ source: ReferralSource }>(`/api/dashboard/referral-sources/${id}`, 'PATCH', patch),
        onSettled,
    });
}

const isReferralList = (query: Query) => query.queryKey[0] === 'referral-sources';

/** Дээш/доош: бүх сонголтын шинэ дарааллыг НЭГ хүсэлтээр. Жагсаалтад шууд тусгаж, алдаа гарвал буцаана. */
export function useReorderReferralSources() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (order: string[]) => dashboardMutate<{ sources: ReferralSource[] }>('/api/dashboard/referral-sources', 'PATCH', { order }),
        onMutate: async (order) => {
            await qc.cancelQueries({ predicate: isReferralList });
            const previous = qc.getQueriesData<ReferralSourcesResult>({ predicate: isReferralList });
            const position = new Map(order.map((id, index) => [id, index]));
            qc.setQueriesData<ReferralSourcesResult>({ predicate: isReferralList }, (data) => data && {
                ...data,
                sources: [...data.sources]
                    .sort((a, b) => (position.get(a.id) ?? data.sources.length) - (position.get(b.id) ?? data.sources.length))
                    .map((source) => (position.has(source.id) ? { ...source, sort_order: (position.get(source.id)! + 1) * 10 } : source)),
            });
            return { previous };
        },
        onError: (_error, _order, context) => {
            for (const [key, data] of context?.previous ?? []) qc.setQueryData(key, data);
        },
        onSettled: () => { void qc.invalidateQueries({ predicate: isReferralList }); },
    });
}

/** Гэрээний «Сэжим» (PATCH `referral_source_id`; null = цэвэрлэх). Сервер идэвхтэй жагсаалтаар шалгаж аудитад бичнэ. */
export function useSetContractReferral(contractId: string) {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (referralSourceId: string | null) => dashboardMutate<{ contract: ContractRow }>(`/api/dashboard/contracts/${contractId}`, 'PATCH', { referral_source_id: referralSourceId }),
        onSettled: () => {
            void qc.invalidateQueries({ queryKey: ['contracts'] });
            void qc.invalidateQueries({ queryKey: ['weekly-sales'] });
        },
    });
}
