'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { StatBar, StatTile } from '@/components/dashboard/StatBar';
import { ChartCard } from '@/components/ui/ChartCard';
import { BarChart } from '@/components/charts/BarChart';
import { DonutChart } from '@/components/charts/DonutChart';
import { ChartExportButton } from '@/components/charts/ChartExportButton';
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
import { formatMNT } from '@/lib/utils/currency';

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
    messenger: 'Messenger',
    facebook: 'Facebook',
    instagram: 'Instagram',
    website: 'Вэбсайт',
    referral: 'Зөвлөмж',
    phone: 'Утас',
    facebook_ads: 'Facebook Ads',
    google_ads: 'Google Ads',
    tv: 'ТВ',
    meeting: 'Уулзалт',
    event: 'Өдөрлөг',
    board: 'Самбар',
    other: 'Бусад',
};

export default function LeadsReport() {
    const { shop } = useAuth();
    type Period = 'today' | 'week' | 'month' | 'quarter' | 'year';
    const [period, setPeriod] = useState<Period>('month');
    const sourceChartRef = useRef<HTMLDivElement>(null);
    const sourceBarChartRef = useRef<HTMLDivElement>(null);
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState<LeadStats>({ total: 0, won: 0, inProgress: 0, conversionRate: 0 });
    const [sourceData, setSourceData] = useState<SourceData[]>([]);
    const [projectData, setProjectData] = useState<ProjectData[]>([]);
    const [exporting, setExporting] = useState(false);

    async function exportExcel() {
        setExporting(true);
        try {
            const res = await fetch('/api/dashboard/export/excel?type=leads', {
                headers: { 'x-shop-id': typeof window !== 'undefined' ? localStorage.getItem('vertmonhub_active_shop_id') || '' : '' },
            });
            if (!res.ok) throw new Error('export failed');
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = `лийдүүд_${new Date().toISOString().slice(0, 10)}.xlsx`; a.click();
            URL.revokeObjectURL(url);
        } catch (e) { console.error('[LeadsReport] export error', e); } finally { setExporting(false); }
    }

    useEffect(() => {
        if (!shop?.id) return;

        const fetchData = async () => {
            setLoading(true);
            try {
                // Сонгосон хугацааны эхлэлийг тооцоолно
                const now = new Date();
                const start = new Date(now);
                if (period === 'today') start.setHours(0, 0, 0, 0);
                else if (period === 'week') start.setDate(now.getDate() - 7);
                else if (period === 'month') start.setMonth(now.getMonth() - 1);
                else if (period === 'quarter') start.setMonth(now.getMonth() - 3);
                else start.setFullYear(now.getFullYear() - 1);

                const { data: leads, error } = await supabase
                    .from('leads')
                    .select('*')
                    .eq('shop_id', shop.id)
                    .gte('created_at', start.toISOString());

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

    const formatCurrency = (value: number) => formatMNT(value, { compact: true });

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
                <Button variant="secondary" size="sm" onClick={exportExcel} isLoading={exporting} disabled={exporting}>
                    {!exporting && <Download className="w-4 h-4" />}
                    Экспорт
                </Button>
            </div>

            {/* Period Filter */}
            <div className="flex flex-wrap gap-2">
                {[
                    { value: 'today', label: 'Өнөөдөр' },
                    { value: 'week', label: '7 хоног' },
                    { value: 'month', label: 'Сар' },
                    { value: 'quarter', label: 'Улирал' },
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
                <StatTile label="Нийт лийд" value={stats.total} icon={<Users className="w-4 h-4" />} accent="info" />
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
                {/* Source Analysis — pie */}
                {sourceData.length === 0 ? (
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <PieChart className="w-5 h-5 text-brand" />
                                Сувгийн задаргаа
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-sm text-muted-foreground text-center py-8">Мэдээлэл байхгүй</p>
                        </CardContent>
                    </Card>
                ) : (
                    <div ref={sourceChartRef}>
                        <ChartCard
                            title="Сувгийн задаргаа"
                            subtitle="Эх сурвалж тус бүрийн эзлэх хувь"
                            height={300}
                            actions={
                                <ChartExportButton
                                    targetRef={sourceChartRef}
                                    fileName={`сувгийн_задаргаа_${period}`}
                                />
                            }
                        >
                            <DonutChart
                                data={sourceData.map((item) => ({
                                    name: item.source,
                                    value: item.count,
                                }))}
                                centerLabel="Нийт"
                            />
                        </ChartCard>
                    </div>
                )}

                {/* Source Analysis — bar */}
                {sourceData.length === 0 ? (
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <PieChart className="w-5 h-5 text-brand" />
                                Сувгийн анализ
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-sm text-muted-foreground text-center py-8">Мэдээлэл байхгүй</p>
                        </CardContent>
                    </Card>
                ) : (
                    <div ref={sourceBarChartRef}>
                        <ChartCard
                            title="Сувгийн анализ"
                            subtitle="Эх сурвалж тус бүрийн лийдийн тоо"
                            height={300}
                            actions={
                                <ChartExportButton
                                    targetRef={sourceBarChartRef}
                                    fileName={`сувгийн_анализ_${period}`}
                                />
                            }
                        >
                            <BarChart
                                data={sourceData.map((item) => ({ source: item.source, count: item.count }))}
                                xKey="source"
                                series={[{ key: 'count', name: 'Лийд' }]}
                                horizontal
                                colorByPoint
                            />
                        </ChartCard>
                    </div>
                )}
            </div>

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
    );
}
