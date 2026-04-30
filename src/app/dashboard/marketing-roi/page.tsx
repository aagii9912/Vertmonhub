'use client';

import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { TrendingUp, Users, Target, BarChart3 } from 'lucide-react';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { StatBar, StatTile } from '@/components/dashboard/StatBar';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { cn } from '@/lib/utils';

const sourceLabels: Record<string, string> = {
    messenger: 'Messenger',
    instagram: 'Instagram',
    website: 'Вебсайт',
    referral: 'Танилын',
    phone: 'Утас',
    facebook: 'Facebook Ads',
    google: 'Google Ads',
    other: 'Бусад',
};

export default function MarketingROIPage() {
    const { shop } = useAuth();
    const [leads, setLeads] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!shop?.id) return;
        fetchData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [shop?.id]);

    async function fetchData() {
        const { data } = await supabase
            .from('leads')
            .select('id, source, status, budget_min, budget_max, created_at')
            .eq('shop_id', shop!.id);
        setLeads(data || []);
        setLoading(false);
    }

    const analytics = useMemo(() => {
        if (leads.length === 0) return null;

        const bySource: Record<string, { total: number; won: number; lost: number; active: number }> = {};
        leads.forEach((l) => {
            const src = l.source || 'other';
            if (!bySource[src]) bySource[src] = { total: 0, won: 0, lost: 0, active: 0 };
            bySource[src].total++;
            if (l.status === 'closed_won') bySource[src].won++;
            else if (l.status === 'closed_lost') bySource[src].lost++;
            else bySource[src].active++;
        });

        const sources = Object.entries(bySource)
            .map(([source, data]) => ({
                source,
                label: sourceLabels[source] || source,
                ...data,
                conversionRate: data.total > 0 ? Math.round((data.won / data.total) * 100) : 0,
            }))
            .sort((a, b) => b.total - a.total);

        const totalLeads = leads.length;
        const totalWon = leads.filter((l) => l.status === 'closed_won').length;
        const totalLost = leads.filter((l) => l.status === 'closed_lost').length;
        const overallConversion = totalLeads > 0 ? Math.round((totalWon / totalLeads) * 100) : 0;

        const monthly: Record<string, number> = {};
        leads.forEach((l) => {
            const month = new Date(l.created_at).toLocaleDateString('mn-MN', { year: 'numeric', month: 'short' });
            monthly[month] = (monthly[month] || 0) + 1;
        });

        const bestSource =
            sources.length > 0 ? sources.reduce((best, s) => (s.conversionRate > best.conversionRate ? s : best)) : null;

        return { sources, totalLeads, totalWon, totalLost, overallConversion, monthly, bestSource };
    }, [leads]);

    if (loading)
        return (
            <Card>
                <div className="flex items-center justify-center py-20">
                    <Spinner size="lg" />
                </div>
            </Card>
        );

    return (
        <div>
            <PageHeader
                eyebrow="Маркетинг"
                title="Маркетинг ROI"
                subtitle="Эх үүсвэр тус бүрийн лийд, конверс шинжилгээ"
            />

            {!analytics ? (
                <Card>
                    <div className="py-12">
                        <EmptyState icon={<BarChart3 className="w-7 h-7" />} title="Лийд өгөгдөл байхгүй" />
                    </div>
                </Card>
            ) : (
                <>
                    <StatBar columns={4}>
                        <StatTile
                            label="Нийт лийд"
                            value={analytics.totalLeads}
                            icon={<Users className="w-4 h-4" />}
                            accent="info"
                        />
                        <StatTile
                            label="Амжилттай"
                            value={analytics.totalWon}
                            icon={<Target className="w-4 h-4" />}
                            accent="success"
                        />
                        <StatTile
                            label="Конверс"
                            value={`${analytics.overallConversion}%`}
                            icon={<BarChart3 className="w-4 h-4" />}
                            accent="brand"
                        />
                        <StatTile
                            label="Шилдэг суваг"
                            value={analytics.bestSource?.label || '-'}
                            icon={<TrendingUp className="w-4 h-4" />}
                            accent="warning"
                            helper={
                                analytics.bestSource ? `${analytics.bestSource.conversionRate}% конверс` : undefined
                            }
                        />
                    </StatBar>

                    {/* Source Breakdown */}
                    <Card className="mb-6">
                        <div className="px-4 py-3 border-b border-border">
                            <h3 className="heading-section text-sm text-foreground">Эх үүсвэрийн шинжилгээ</h3>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead className="bg-surface-2/50 border-b border-border">
                                    <tr>
                                        <th className="text-left px-4 py-2.5 text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground/80">
                                            Суваг
                                        </th>
                                        <th className="text-center px-4 py-2.5 text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground/80">
                                            Лийд
                                        </th>
                                        <th className="text-center px-4 py-2.5 text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground/80">
                                            Амжилт
                                        </th>
                                        <th className="text-center px-4 py-2.5 text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground/80">
                                            Алдсан
                                        </th>
                                        <th className="text-center px-4 py-2.5 text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground/80">
                                            Идэвхтэй
                                        </th>
                                        <th className="text-center px-4 py-2.5 text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground/80">
                                            Конверс
                                        </th>
                                        <th className="text-left px-4 py-2.5 text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground/80">
                                            Визуал
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border/60">
                                    {analytics.sources.map((s) => (
                                        <tr key={s.source} className="hover:bg-surface-2/40 transition-colors">
                                            <td className="px-4 py-3 font-medium text-foreground">{s.label}</td>
                                            <td className="px-4 py-3 text-center text-foreground tabular-nums">{s.total}</td>
                                            <td className="px-4 py-3 text-center text-status-success font-medium tabular-nums">
                                                {s.won}
                                            </td>
                                            <td className="px-4 py-3 text-center text-status-danger tabular-nums">{s.lost}</td>
                                            <td className="px-4 py-3 text-center text-status-info tabular-nums">{s.active}</td>
                                            <td className="px-4 py-3 text-center">
                                                <Badge
                                                    variant={
                                                        s.conversionRate >= 50
                                                            ? 'success'
                                                            : s.conversionRate >= 20
                                                              ? 'warning'
                                                              : 'default'
                                                    }
                                                    size="sm"
                                                >
                                                    {s.conversionRate}%
                                                </Badge>
                                            </td>
                                            <td className="px-4 py-3 min-w-[120px]">
                                                <div className="w-full bg-surface-2 rounded-full h-2 overflow-hidden">
                                                    <div
                                                        className="bg-brand h-full rounded-full transition-all"
                                                        style={{ width: `${s.conversionRate}%` }}
                                                    />
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </Card>

                    {/* Monthly Trend */}
                    <Card>
                        <div className="px-4 py-3 border-b border-border">
                            <h3 className="heading-section text-sm text-foreground">Сар бүрийн лийд</h3>
                        </div>
                        <div className="p-4">
                            <div className="flex items-end gap-2 h-32">
                                {Object.entries(analytics.monthly)
                                    .slice(-6)
                                    .map(([month, count]) => {
                                        const max = Math.max(...Object.values(analytics.monthly));
                                        const height = max > 0 ? (count / max) * 100 : 0;
                                        return (
                                            <div key={month} className="flex-1 flex flex-col items-center gap-1">
                                                <span className="text-xs font-medium text-foreground tabular-nums">
                                                    {count}
                                                </span>
                                                <div
                                                    className={cn(
                                                        'w-full bg-brand-soft rounded-t transition-all',
                                                    )}
                                                    style={{ height: `${height}%`, minHeight: '4px' }}
                                                >
                                                    <div className="w-full h-full bg-brand rounded-t" />
                                                </div>
                                                <span className="text-[10px] text-muted-foreground truncate w-full text-center">
                                                    {month}
                                                </span>
                                            </div>
                                        );
                                    })}
                            </div>
                        </div>
                    </Card>
                </>
            )}
        </div>
    );
}
