'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatMNT } from '@/lib/utils/currency';
import { cn } from '@/lib/utils';
import type { MyStatsTarget } from '@/hooks/useMyStats';
import { Target, TrendingUp } from 'lucide-react';

function pct(actual: number, target: number): number {
    if (target <= 0) return 0;
    return Math.round((actual / target) * 100);
}

/** Биелэлтийн хувиар өнгө (SalesTargetWidget-тэй ижил дүрэм). */
function barColor(p: number): string {
    if (p >= 100) return 'bg-status-success';
    if (p >= 60) return 'bg-brand';
    if (p >= 30) return 'bg-status-pending';
    return 'bg-status-danger';
}

function MineRow({
    label,
    mine,
    team,
}: {
    label: string;
    mine: number;
    team: { target: number; actual: number };
}) {
    const share = team.actual > 0 ? Math.round((mine / team.actual) * 100) : 0;
    const teamPct = pct(team.actual, team.target);
    return (
        <div>
            <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-medium text-foreground">{label}</span>
                <span className="text-xs text-muted-foreground tabular-nums">
                    <span className="text-foreground font-medium">{formatMNT(mine, { compact: true })}</span>
                    {' · багийн '}
                    {share}%
                </span>
            </div>
            <div className="mt-1.5 flex items-center gap-2">
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-3">
                    <div
                        className={cn('h-full rounded-full transition-all', barColor(teamPct))}
                        style={{ width: `${Math.min(100, teamPct)}%` }}
                    />
                </div>
                <span
                    className={cn(
                        'w-11 text-right text-xs font-semibold tabular-nums',
                        teamPct >= 100 ? 'text-status-success' : 'text-muted-foreground',
                    )}
                >
                    {teamPct}%
                </span>
            </div>
            <p className="mt-1 text-2xs text-muted-foreground">
                Баг: {formatMNT(team.actual, { compact: true })} / {formatMNT(team.target, { compact: true })}
            </p>
        </div>
    );
}

/** «Борлуулалтын зорилт» — миний гүйцэтгэл түрүүнд, багийн биелэлт контекстээр. */
export function MyTargetWidget({ target }: { target: MyStatsTarget | null }) {
    if (!target) {
        return (
            <Card>
                <CardHeader className="py-3">
                    <CardTitle className="flex items-center gap-2 text-base">
                        <Target className="w-4 h-4 text-brand" />
                        Борлуулалтын зорилт
                    </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    <EmptyState
                        icon={<Target className="w-7 h-7" />}
                        title="Зорилт тохируулаагүй"
                        description="Админ багийн сарын төлөвлөгөө оруулснаар энд харагдана"
                    />
                </CardContent>
            </Card>
        );
    }

    const monthShare =
        target.periods.month.actual > 0
            ? Math.round((target.mine.month / target.periods.month.actual) * 100)
            : 0;

    return (
        <Card className="border-brand/30 bg-gradient-to-br from-brand-soft/40 to-transparent">
            <CardHeader className="flex flex-row items-center justify-between py-3 md:py-4">
                <CardTitle className="flex items-center gap-2 text-base md:text-lg">
                    <Target className="h-4 w-4 text-brand md:h-5 md:w-5" />
                    Борлуулалтын зорилт
                </CardTitle>
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <TrendingUp className="h-3.5 w-3.5" />
                    Миний хувь {monthShare}%
                </span>
            </CardHeader>
            <CardContent className="space-y-4">
                <MineRow label="Энэ сар" mine={target.mine.month} team={target.periods.month} />
                <MineRow label="Энэ улирал" mine={target.mine.quarter} team={target.periods.quarter} />
                <MineRow label="Энэ жил" mine={target.mine.year} team={target.periods.year} />
            </CardContent>
        </Card>
    );
}
