'use client';

import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { StatusPill } from '@/components/ui/StatusPill';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatTimeAgo } from '@/lib/utils/date';
import type { MyStatsLead } from '@/hooks/useMyStats';
import { Users, ArrowRight } from 'lucide-react';

/** Лидийн бүх статусын монгол шошго + өнгө (pipeline-ий дарааллаар). */
export const LEAD_STATUS_META: Record<
    string,
    { label: string; variant: 'info' | 'pending' | 'success' | 'danger' | 'neutral' | 'brand' }
> = {
    new: { label: 'Шинэ', variant: 'info' },
    contacted: { label: 'Холбогдсон', variant: 'pending' },
    viewing_scheduled: { label: 'Үзүүлэлт товлосон', variant: 'brand' },
    offered: { label: 'Санал тавьсан', variant: 'pending' },
    negotiating: { label: 'Тохиролцож буй', variant: 'pending' },
    closed_won: { label: 'Амжилттай', variant: 'success' },
    closed_lost: { label: 'Амжилтгүй', variant: 'neutral' },
};

/** «Миний лидүүд» — статусын товч тойм + сүүлийн лидүүд. */
export function MyLeadsWidget({
    leads,
    leadsByStatus,
}: {
    leads: MyStatsLead[];
    leadsByStatus: Record<string, number>;
}) {
    const statusChips = Object.entries(LEAD_STATUS_META)
        .map(([status, meta]) => ({ status, meta, count: leadsByStatus[status] || 0 }))
        .filter((s) => s.count > 0);

    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between py-3 md:py-4">
                <CardTitle className="flex items-center gap-2 text-base md:text-lg">
                    <Users className="w-4 h-4 md:w-5 md:h-5 text-brand" />
                    Миний лидүүд
                </CardTitle>
                <Link href="/dashboard/leads">
                    <Button variant="ghost" size="sm" className="h-8 text-xs md:text-sm">
                        Бүгдийг <ArrowRight className="w-3 h-3 md:w-4 md:h-4 ml-1" />
                    </Button>
                </Link>
            </CardHeader>
            <CardContent className="p-0">
                {statusChips.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 px-4 md:px-6 pb-3">
                        {statusChips.map(({ status, meta, count }) => (
                            <StatusPill key={status} variant={meta.variant}>
                                {meta.label} · {count}
                            </StatusPill>
                        ))}
                    </div>
                )}
                <div className="divide-y divide-border/60 border-t border-border/60">
                    {leads.length > 0 ? (
                        leads.map((lead) => {
                            const status = LEAD_STATUS_META[lead.status] || {
                                label: lead.status || 'Шинэ',
                                variant: 'neutral' as const,
                            };
                            return (
                                <Link
                                    key={lead.id}
                                    href="/dashboard/leads"
                                    className="px-4 md:px-6 py-3 flex items-center justify-between gap-3 hover:bg-surface-2/60 transition-colors"
                                >
                                    <div className="flex items-center gap-3 overflow-hidden">
                                        <div className="w-9 h-9 rounded-md bg-brand-soft flex items-center justify-center flex-shrink-0">
                                            <Users className="w-4 h-4 text-brand-strong" />
                                        </div>
                                        <div className="min-w-0">
                                            <p className="font-medium text-sm text-foreground truncate">
                                                {lead.customer_name || 'Лид'}
                                            </p>
                                            <p className="text-xs text-muted-foreground truncate">
                                                {lead.customer_phone || 'Холбоо барих'} • {formatTimeAgo(lead.created_at)}
                                            </p>
                                        </div>
                                    </div>
                                    <StatusPill variant={status.variant}>{status.label}</StatusPill>
                                </Link>
                            );
                        })
                    ) : (
                        <EmptyState
                            icon={<Users className="w-7 h-7" />}
                            title="Танд оноогдсон лид алга"
                            description="Шинэ лид үүсгэхэд эсвэл танд хуваарилахад энд харагдана"
                        />
                    )}
                </div>
            </CardContent>
        </Card>
    );
}
