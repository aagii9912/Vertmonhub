'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { StatBar, StatTile } from '@/components/dashboard/StatBar';
import {
    Users,
    Target,
    CheckCircle2,
    Clock,
    Download,
    PieChart,
    Building2,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';

interface LeadStats {
    total: number;
    won: number;
    inProgress: number;
    conversionRate: number;
}

interface SourceData {
    source: string;
    count: number;
    percentage: number;
    barClass: string;
}

interface ProjectData {
    project: string;
    leads: number;
    won: number;
    value: number;
}

const sourceBarClass: Record<string, string> = {
    messenger: 'bg-status-info',
    instagram: 'bg-brand',
    website: 'bg-status-info',
    referral: 'bg-status-success',
    phone: 'bg-status-pending',
    other: 'bg-muted',
};

const sourceLabels: Record<string, string> = {
    messenger: 'Facebook',
    instagram: 'Instagram',
    website: 'Вэбсайт',
    referral: 'Зөвлөмж',
    phone: 'Утас',
    other: 'Бусад',
};

export default function LeadsReport() {
    const { shop } = useAuth();
    type Period = 'today' | 'week' | 'month' | 'year';
    const [period, setPeriod] = useState<Period>('month');
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState<LeadStats>({ total: 0, won: 0, inProgress: 0, conversionRate: 0 });
    const [sourceData, setSourceData] = useState<SourceData[]>([]);
    const [projectData, setProjectData] = useState<ProjectData[]>([]);

    useEffect(() => {
        if (!shop?.id) return;

        const fetchData = async () => {
            setLoading(true);
            try {
                const { data: leads, error } = await supabase
                    .from('leads')
                    .select('*')
                    .eq('shop_id', shop.id);

                if (error) throw error;

                if (!leads || leads.length === 0) {
                    setLoading(false);
                    return;
                }

                const won = leads.filter((l) => l.status === 'closed_won').length;
                const inProgress = leads.filter((l) =>
                    ['contacted', 'viewing_scheduled', 'offered', 'negotiating'].includes(l.status),
                ).length;

                setStats({
                    total: leads.length,
                    won,
                    inProgress,
                    conversionRate: leads.length > 0 ? (won / leads.length) * 100 : 0,
                });

                const sourceCounts = new Map<string, number>();
                for (const lead of leads) {
                    const src = lead.source || 'other';
                    sourceCounts.set(src, (sourceCounts.get(src) || 0) + 1);
                }
                const srcData: SourceData[] = Array.from(sourceCounts.entries())
                    .map(([source, count]) => ({
                        source: sourceLabels[source] || source,
                        count,
                        percentage: Math.round((count / leads.length) * 100),
                        barClass: sourceBarClass[source] || 'bg-muted',
                    }))
                    .sort((a, b) => b.count - a.count);
                setSourceData(srcData);

                const projectMap = new Map<string, { leads: number; won: number; value: number }>();
                for (const lead of leads) {
                    const project = lead.preferred_type || 'Бусад';
                    if (!projectMap.has(project)) {
                        projectMap.set(project, { leads: 0, won: 0, value: 0 });
                    }
                    const d = projectMap.get(project)!;
                    d.leads++;
                    if (lead.status === 'closed_won') {
                        d.won++;
                        d.value += lead.budget_max || lead.budget_min || 0;
                    }
                }
                setProjectData(
                    Array.from(projectMap.entries())
                        .map(([project, data]) => ({ project, ...data }))
                        .sort((a, b) => b.leads - a.leads)
                        .slice(0, 5),
                );
            } catch (error) {
                console.error('Error fetching leads report:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [shop?.id, period]);

    const formatCurrency = (value: number) => {
        if (value >= 1000000000) return `${(value / 1000000000).toFixed(1)} тэрбум ₮`;
        if (value >= 1000000) return `${(value / 1000000).toLocaleString()} сая ₮`;
        return value.toLocaleString() + '₮';
    };

    if (loading) {
        return (
            <Card>
                <div className="flex items-center justify-center py-16 gap-3">
                    <Spinner size="md" />
                    <span className="text-muted-foreground">Тайлан татаж байна...</span>
                </div>
            </Card>
        );
    }

    if (stats.total === 0) {
        return (
            <Card>
                <div className="py-12">
                    <EmptyState
                        icon={<Users className="w-7 h-7" />}
                        title="Мэдээлэл байхгүй"
                        description="Сэжмийн тайлан харахын тулд лийд мэдээлэл оруулна уу."
                    />
                </div>
            </Card>
        );
    }

    return (
        <div className="space-y-6">
            {/* Sub header */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div>
                    <h2 className="heading-section text-lg text-foreground flex items-center gap-2">
                        <Users className="w-5 h-5 text-brand" />
                        Сэжмийн тайлан
                    </h2>
                    <p className="text-sm text-muted-foreground mt-1">
                        Худалдан авах магадлалтай харилцагчдын анализ
                    </p>
                </div>
                <Button variant="secondary" size="sm">
                    <Download className="w-4 h-4" />
                    Экспорт
                </Button>
            </div>

            {/* Period Filter */}
            <div className="flex flex-wrap gap-2">
                {[
                    { value: 'today', label: 'Өнөөдөр' },
                    { value: 'week', label: '7 хоног' },
                    { value: 'month', label: 'Сар' },
                    { value: 'year', label: 'Жил' },
                ].map((option) => (
                    <button
                        key={option.value}
                        onClick={() => setPeriod(option.value as Period)}
                        className={cn(
                            'px-4 py-2 rounded-md font-medium text-sm transition-colors border',
                            period === option.value
                                ? 'bg-foreground text-background border-foreground'
                                : 'bg-surface text-muted-foreground border-border hover:bg-surface-2',
                        )}
                    >
                        {option.label}
                    </button>
                ))}
            </div>

            {/* KPI Cards */}
            <StatBar columns={4}>
                <StatTile label="Нийт сэжим" value={stats.total} icon={<Users className="w-4 h-4" />} accent="info" />
                <StatTile
                    label="Амжилттай"
                    value={stats.won}
                    icon={<CheckCircle2 className="w-4 h-4" />}
                    accent="success"
                />
                <StatTile
                    label="Хөрвүүлэлт"
                    value={`${stats.conversionRate.toFixed(1)}%`}
                    icon={<Target className="w-4 h-4" />}
                    accent="brand"
                />
                <StatTile
                    label="Боловсруулалтанд"
                    value={stats.inProgress}
                    icon={<Clock className="w-4 h-4" />}
                    accent="warning"
                />
            </StatBar>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Source Analysis */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <PieChart className="w-5 h-5 text-brand" />
                            Сувгийн анализ
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {sourceData.length === 0 ? (
                            <p className="text-sm text-muted-foreground text-center py-8">Мэдээлэл байхгүй</p>
                        ) : (
                            <div className="space-y-6">
                                {sourceData.map((item, i) => (
                                    <div key={i}>
                                        <div className="flex items-center justify-between mb-2">
                                            <span className="font-medium text-foreground">{item.source}</span>
                                            <div className="text-right tabular-nums">
                                                <span className="font-semibold text-foreground">{item.count}</span>
                                                <span className="text-sm text-muted-foreground ml-2">({item.percentage}%)</span>
                                            </div>
                                        </div>
                                        <div className="w-full bg-surface-2 rounded-full h-2 overflow-hidden">
                                            <div
                                                className={cn('h-full rounded-full transition-all', item.barClass)}
                                                style={{ width: `${item.percentage}%` }}
                                            />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Performance by Project */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Building2 className="w-5 h-5 text-brand" />
                            Төслөөр
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {projectData.length === 0 ? (
                            <p className="text-sm text-muted-foreground text-center py-8">Мэдээлэл байхгүй</p>
                        ) : (
                            <div className="space-y-3">
                                {projectData.map((item, i) => (
                                    <div
                                        key={i}
                                        className="flex items-center justify-between p-4 bg-surface-2/40 border border-border rounded-md"
                                    >
                                        <div>
                                            <p className="font-medium text-foreground">{item.project}</p>
                                            <div className="flex gap-4 mt-1">
                                                <p className="text-xs text-muted-foreground tabular-nums">Сэжим: {item.leads}</p>
                                                <p className="text-xs text-status-success tabular-nums">Амжилттай: {item.won}</p>
                                            </div>
                                        </div>
                                        {item.value > 0 && (
                                            <div className="text-right">
                                                <p className="font-semibold text-brand tabular-nums">
                                                    {formatCurrency(item.value)}
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
