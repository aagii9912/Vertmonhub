'use client';

import { useQuery } from '@tanstack/react-query';
import { dashboardFetch } from '@/lib/api/dashboardFetch';
import type { CountKey } from '@/lib/navigation/nav';

export type NavCounts = Partial<Record<CountKey, number>>;

/**
 * Sidebar-ийн амьд тоонууд: шинэ лид, уншаагүй мессеж, өнөөдрийн уулзалт.
 *
 * Нэг хөнгөн дуудлага, 60 секунд cache — навигаци бүрт дахин татахгүй.
 * Алдаа гарвал ЧИМЭЭГҮЙ хоосон буцаана: sidebar тоогүй ч бүрэн ажиллана.
 */
export function useNavCounts(): NavCounts {
    const { data } = useQuery<NavCounts>({
        queryKey: ['nav-counts'],
        queryFn: async () => {
            const res = await dashboardFetch('/api/dashboard/nav-counts');
            if (!res.ok) return {};
            const json = await res.json().catch(() => ({}));
            return {
                leads: typeof json.leads === 'number' ? json.leads : undefined,
                inbox: typeof json.inbox === 'number' ? json.inbox : undefined,
                meetings: typeof json.meetings === 'number' ? json.meetings : undefined,
            };
        },
        staleTime: 60_000,
        refetchOnWindowFocus: false,
        retry: false,
    });

    return data ?? {};
}
