'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { StatusPill } from '@/components/ui/StatusPill';
import { useAuth } from '@/contexts/AuthContext';
import { formatMNT } from '@/lib/utils/currency';
import { cn } from '@/lib/utils';
import { Trophy, ArrowRight, Users } from 'lucide-react';

interface ManagerRow {
    sales_manager: string;
    is_active: boolean;
    contract_count: number;
    total_sales: number;
    collection_rate_pct: number;
}

interface TeamPerformance {
    managers: ManagerRow[];
    totals: {
        teamTarget: number;
        teamActual: number;
        teamAttainmentPct: number;
    };
}

interface TeamOverviewProps {
    /** Менежерийн мөр дээр дарахад drill-in нээх callback. */
    onSelectManager?: (name: string) => void;
    /** Толгойн баруун талын хэрэгслүүд (ж: менежер сонгогч Select). */
    actions?: React.ReactNode;
}

/**
 * «Багийн гүйцэтгэл» — админы дашбоардын виджет: жилийн зорилтын биелэлт +
 * менежерүүдийн leaderboard (одоо байгаа reports/manager-performance API-гаас).
 * Мөр дээр дарахад тухайн менежерийн хувийн самбар нээгдэнэ.
 */
export function TeamOverview({ onSelectManager, actions }: TeamOverviewProps) {
    const { shop } = useAuth();
    const shopId = shop?.id;

    const { data, isLoading } = useQuery<TeamPerformance | null>({
        queryKey: ['team-overview', shopId],
        queryFn: async () => {
            if (!shopId) return null;
            const res = await fetch('/api/dashboard/reports/manager-performance', {
                headers: { 'x-shop-id': shopId },
            });
            if (!res.ok) return null; // reports эрхгүй бол виджет нуугдана
            return res.json();
        },
        enabled: !!shopId,
        staleTime: 60000,
    });

    if (isLoading || !data) return null;

    const managers = (data.managers || []).slice(0, 8);
    const topSales = managers.reduce((max, m) => Math.max(max, m.total_sales), 0);
    const { teamTarget, teamActual, teamAttainmentPct } = data.totals || {
        teamTarget: 0,
        teamActual: 0,
        teamAttainmentPct: 0,
    };

    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between py-3 md:py-4">
                <CardTitle className="flex items-center gap-2 text-base md:text-lg">
                    <Trophy className="w-4 h-4 md:w-5 md:h-5 text-brand" />
                    Багийн гүйцэтгэл
                </CardTitle>
                <div className="flex items-center gap-2">
                    {actions}
                    <Link href="/dashboard/reports/manager-performance">
                        <Button variant="ghost" size="sm" className="h-8 text-xs md:text-sm">
                            Дэлгэрэнгүй <ArrowRight className="w-3 h-3 md:w-4 md:h-4 ml-1" />
                        </Button>
                    </Link>
                </div>
            </CardHeader>
            <CardContent className="p-0">
                {teamTarget > 0 && (
                    <div className="px-4 md:px-6 pb-3">
                        <div className="flex items-baseline justify-between gap-2 text-xs text-muted-foreground">
                            <span>Жилийн зорилт</span>
                            <span className="tabular-nums">
                                <span className="text-foreground font-medium">
                                    {formatMNT(teamActual, { compact: true })}
                                </span>
                                {' / '}
                                {formatMNT(teamTarget, { compact: true })} · {teamAttainmentPct}%
                            </span>
                        </div>
                        <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-3">
                            <div
                                className={cn(
                                    'h-full rounded-full transition-all',
                                    teamAttainmentPct >= 100 ? 'bg-status-success' : 'bg-brand',
                                )}
                                style={{ width: `${Math.min(100, teamAttainmentPct)}%` }}
                            />
                        </div>
                    </div>
                )}

                <div className="divide-y divide-border/60 border-t border-border/60">
                    {managers.length > 0 ? (
                        managers.map((m, i) => {
                            const barPct = topSales > 0 ? Math.round((m.total_sales / topSales) * 100) : 0;
                            return (
                                <button
                                    key={m.sales_manager}
                                    type="button"
                                    onClick={() => onSelectManager?.(m.sales_manager)}
                                    className="w-full text-left px-4 md:px-6 py-3 flex items-center gap-3 hover:bg-surface-2/60 transition-colors"
                                    title="Менежерийн самбар харах"
                                >
                                    <span className="w-6 text-center text-sm font-semibold text-muted-foreground tabular-nums flex-shrink-0">
                                        {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}
                                    </span>
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center justify-between gap-2">
                                            <p className="font-medium text-sm text-foreground truncate">
                                                {m.sales_manager}
                                                {!m.is_active && (
                                                    <span className="ml-2 align-middle">
                                                        <StatusPill variant="neutral">Идэвхгүй</StatusPill>
                                                    </span>
                                                )}
                                            </p>
                                            <span className="text-xs text-muted-foreground tabular-nums flex-shrink-0">
                                                {formatMNT(m.total_sales, { compact: true })} · {m.contract_count} гэрээ
                                            </span>
                                        </div>
                                        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-3">
                                            <div
                                                className="h-full rounded-full bg-brand/70 transition-all"
                                                style={{ width: `${barPct}%` }}
                                            />
                                        </div>
                                    </div>
                                </button>
                            );
                        })
                    ) : (
                        <EmptyState
                            icon={<Users className="w-7 h-7" />}
                            title="Менежерийн гүйцэтгэл алга"
                            description="Гэрээнд менежер бүртгэгдсэнээр энд харагдана"
                        />
                    )}
                </div>
            </CardContent>
        </Card>
    );
}
