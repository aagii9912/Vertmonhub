'use client';

import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { dashboardJson } from '@/lib/api/dashboardFetch';
import { connectionRows, type ConnectionTone, type MarketingConnections } from '@/lib/marketing/connections';
import { cn } from '@/lib/utils';

/** Идэвхтэй төслийн маркетингийн холболтын төлөв (хуудасны мөр, хэлэлцэх асуудал хоёулаа ашиглана). */
export function useMarketingConnections(enabled: boolean) {
    const { shop, user } = useAuth();
    return useQuery<MarketingConnections>({
        queryKey: ['marketing-connections', shop?.id, user?.id],
        queryFn: async ({ signal }) => (await dashboardJson<{ connections: MarketingConnections }>('/api/dashboard/marketing/connections', { signal, shopId: shop?.id })).connections,
        enabled: !!shop?.id && enabled, staleTime: 60_000, retry: 1,
    });
}

const TONE: Record<ConnectionTone, string> = { ok: 'text-fg-2', warn: 'text-status-pending', off: 'text-muted-foreground' };

/** «Холболтын төлөв» — нэг мөр: Facebook хуудас, Instagram, Meta зарын данс, токен, синк, төгрөгийн ханш. */
export function WeeklyMarketingConnections({ query }: { query: ReturnType<typeof useMarketingConnections> }) {
    if (query.isPending) return null;
    if (!query.data) return <p className="text-xs text-status-danger">Холболтын төлөв: {query.error?.message || 'ачаалж чадсангүй'}</p>;
    const rows = connectionRows(query.data);
    return (
        <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs" aria-label="Холболтын төлөв">
            <span className="font-medium text-muted-foreground">Холболтын төлөв:</span>
            {rows.map(row => <span key={row.key} className={TONE[row.tone]} title={row.detail ?? undefined}>
                {row.label}: {row.status}{row.tone === 'warn' && row.detail ? ` (${row.detail})` : ''}
            </span>)}
        </p>
    );
}
