'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import {
    MANAGER_WIDGETS,
    mergeWidgetPrefs,
    type WidgetPref,
} from '@/lib/dashboard/widget-prefs';

const DEFAULT_PREFS: WidgetPref[] = mergeWidgetPrefs([], MANAGER_WIDGETS);

/**
 * «Миний самбар»-ын виджет тохируулга (хэрэглэгч + shop бүрээр хадгалагдана).
 * Optimistic update — UI шууд өөрчлөгдөж, сервер ард нь хадгална;
 * алдаа гарвал буцаана. Хүснэгт/миграци байхгүй үед default дараалал.
 */
export function useDashboardPrefs(enabled = true) {
    const { shop } = useAuth();
    const shopId = shop?.id;
    const queryClient = useQueryClient();
    const queryKey = ['dashboard-prefs', shopId];

    const query = useQuery<WidgetPref[]>({
        queryKey,
        queryFn: async () => {
            if (!shopId) return DEFAULT_PREFS;
            try {
                const res = await fetch('/api/dashboard/prefs', {
                    headers: { 'x-shop-id': shopId },
                });
                if (!res.ok) return DEFAULT_PREFS;
                const json = await res.json();
                return mergeWidgetPrefs(json.widgets || [], MANAGER_WIDGETS);
            } catch {
                return DEFAULT_PREFS;
            }
        },
        enabled: !!shopId && enabled,
        staleTime: 60000,
    });

    const mutation = useMutation({
        mutationFn: async (widgets: WidgetPref[]) => {
            if (!shopId) return;
            await fetch('/api/dashboard/prefs', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'x-shop-id': shopId },
                body: JSON.stringify({ widgets }),
            });
        },
        onMutate: async (widgets: WidgetPref[]) => {
            await queryClient.cancelQueries({ queryKey });
            const prev = queryClient.getQueryData<WidgetPref[]>(queryKey);
            queryClient.setQueryData(queryKey, widgets);
            return { prev };
        },
        onError: (_err, _widgets, ctx) => {
            if (ctx?.prev) queryClient.setQueryData(queryKey, ctx.prev);
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey });
        },
    });

    return {
        prefs: query.data ?? DEFAULT_PREFS,
        isLoading: query.isLoading,
        save: mutation.mutate,
    };
}
