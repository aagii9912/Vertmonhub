'use client';

import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { dashboardJson } from '@/lib/api/dashboardFetch';

export interface DashboardQueryOptions {
    /** Анхдагч 30 секунд. */
    staleTime?: number;
    /** false бол асуухгүй (жишээ нь сонголт хийгдээгүй үед). */
    enabled?: boolean;
    /** Түлхүүр солигдоход (шүүлтүүр) өмнөх хуудсыг түр харуулна; данс/байгууллага солигдвол харуулахгүй. */
    keepPreviousData?: boolean;
}

/**
 * Dashboard API-г react-query-оор уншина. Түлхүүрт идэвхтэй байгууллага, хэрэглэгч, дүр
 * автоматаар орно — өөр данс, байгууллага, дүр рүү шилжихэд хуучин өгөгдөл харагдахгүй.
 * Алдаа `error`-оор ирнэ (хоосон өгөгдөл болж нуугдахгүй). Хадгалсны дараа `refetch()`
 * эсвэл `queryClient.invalidateQueries({ queryKey: [key[0]] })`.
 */
export function useDashboardQuery<T>(key: readonly unknown[], url: string | null, options: DashboardQueryOptions = {}) {
    const { shop, user } = useAuth();
    const scope = [shop?.id, user?.id, user?.role] as const;
    return useQuery<T>({
        queryKey: [...key, ...scope, url],
        queryFn: () => dashboardJson<T>(url as string),
        enabled: !!shop?.id && !!url && (options.enabled ?? true),
        staleTime: options.staleTime ?? 30_000,
        placeholderData: options.keepPreviousData
            ? (previous, previousQuery) => {
                const previousScope = previousQuery?.queryKey.slice(key.length, key.length + 3);
                return previousScope?.every((value, index) => value === scope[index]) ? previous : undefined;
            }
            : undefined,
    });
}
