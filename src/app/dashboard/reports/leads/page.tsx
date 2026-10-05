'use client';

import React, { useState, useRef } from 'react';
import { toast } from 'sonner';
import { Alert, AlertDescription } from '@/components/ui/Alert';
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
    Building2,
    UserRound,
    Tags,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useDashboardQuery } from '@/hooks/useDashboardQuery';
import { dashboardDownload } from '@/lib/api/dashboardFetch';
import { cn } from '@/lib/utils';
import { UNCATEGORIZED_LABEL, leadCategoryLabel, sourceLabel } from '@/lib/leads/labels';
import { useLeadCategories } from '@/hooks/useLeads';
import type { LeadsReportPeriod, LeadsSummaryReport } from '@/lib/reports/leads-summary';

const PERIOD_OPTIONS: { value: LeadsReportPeriod; label: string }[] = [
    { value: 'today', label: 'Өнөөдөр' },
    { value: 'week', label: '7 хоног' },
    { value: 'month', label: 'Сар' },
    { value: 'quarter', label: 'Улирал' },
    { value: 'year', label: 'Жил' },
];

interface BreakdownRow {
    key: string;
    label: string;
    count: number;
    won: number;
}

export default function LeadsReport() {
    const { user } = useAuth();
    const [period, setPeriod] = useState<LeadsReportPeriod>('month');
    const sourceChartRef = useRef<HTMLDivElement>(null);
    const sourceBarChartRef = useRef<HTMLDivElement>(null);
    // Нэгтгэлийг сервер хугацааны БҮХ лидээр (төслийн хүрээгээр) тооцно — browser 1,000 мөрөөр тасрахгүй.
    const { data, error, isPending, isFetching, refetch } = useDashboardQuery<LeadsSummaryReport>(
        ['leads-report'],
        `/api/dashboard/reports/leads-summary?period=${period}`,
    );
    // Ангиллын нэр (архивласан нь «(архив)»-тай) — төсөлд ангилал тохируулсан үед л задаргаа харагдана.
    const { data: categories = [] } = useLeadCategories();
    const [exporting, setExporting] = useState(false);
    // Экспорт нь харилцагчийн холбоо барих мэдээлэлтэй тул лидийн модулийн эрх шаардана.
    const canExport = user?.role === 'super_admin' || !!user?.permissions.modules.includes('leads');

    async function exportExcel() {
        if (!data) return;
        setExporting(true);
        try {
            const { from, to } = data.range;
            await dashboardDownload(
                `/api/dashboard/export/excel?type=leads&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
                `лийдүүд_${from}_${to}.xlsx`,
            );
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Файл татаж чадсангүй. Дахин оролдоно уу.');
        } finally {
            setExporting(false);
        }
    }

    if (isPending || (!data && isFetching)) {
        return (
            <Card>
                <div className="flex items-center justify-center py-16 gap-3">
                    <Spinner size="md" />
                    <span className="text-muted-foreground">Тайлан татаж байна...</span>
                </div>
            </Card>
        );
    }

    const toolbar = (
        <>
            {/* Sub header */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div>
                    <h2 className="heading-section text-lg text-foreground flex items-center gap-2">
                        <Users className="w-5 h-5 text-brand-strong" />
                        Сэжмийн тайлан
                    </h2>
                    <p className="text-sm text-muted-foreground mt-1">
                        Худалдан авах магадлалтай харилцагчдын анализ
                    </p>
                </div>
                {canExport && (
                    <Button variant="secondary" size="sm" onClick={exportExcel} isLoading={exporting} disabled={exporting || !data}>
                        {!exporting && <Download className="w-4 h-4" />}
                        Экспорт
                    </Button>
                )}
            </div>

            {/* Period Filter */}
            <div className="flex flex-wrap gap-2">
                {PERIOD_OPTIONS.map((option) => (
                    <button
                        key={option.value}
                        onClick={() => setPeriod(option.value)}
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
            {data && (
                <p className="text-xs text-muted-foreground tabular-nums">
                    {data.range.from === data.range.to ? data.range.from : `${data.range.from} – ${data.range.to}`} · Улаанбаатарын цагаар, лид бүртгэгдсэн өдрөөр
                </p>
            )}

            {error && !isFetching && (
                <Alert variant="danger">
                    <AlertDescription>{error.message}</AlertDescription>
                    <Button variant="secondary" size="sm" className="mt-1 self-start" onClick={() => void refetch()}>Дахин оролдох</Button>
                </Alert>
            )}
        </>
    );

    // Алдаа гарсан үед хоосон тайлан харуулахгүй.
    if (!data) {
        return <div className="space-y-6">{toolbar}</div>;
    }

    // Хугацааны сонголт харагдсан хэвээр — хоосон хугацаанаас өөр хугацаа руу буцаж болно.
    if (data.total === 0) {
        return (
            <div className="space-y-6">
                {toolbar}
                <Card>
                    <div className="py-12">
                        <EmptyState
                            icon={<Users className="w-7 h-7" />}
                            title="Мэдээлэл байхгүй"
                            description="Сэжмийн тайлан харахын тулд лийд мэдээлэл оруулна уу."
                        />
                    </div>
                </Card>
            </div>
        );
    }

    const { total, conversion } = data;
    const sourceData = data.bySource.map((row) => ({ source: sourceLabel(row.source), count: row.count }));
    const projectRows: BreakdownRow[] = data.byProject.map((row) => ({
        key: row.projectId ?? 'none',
        label: row.projectId ? row.name ?? 'Төсөл (нэр олдсонгүй)' : 'Төсөл сонгоогүй',
        count: row.count,
        won: row.won,
    }));
    const categoryRows: BreakdownRow[] = data.byCategory.map((row) => ({
        key: row.categoryId ?? 'none',
        label: row.categoryId ? leadCategoryLabel(categories, row.categoryId, { markArchived: true }) : UNCATEGORIZED_LABEL,
        count: row.count,
        won: row.won,
    }));
    const managerRows: BreakdownRow[] = data.byManager.map((row) => ({
        key: row.manager ?? 'none',
        label: row.manager ?? 'Хариуцагчгүй',
        count: row.count,
        won: row.won,
    }));

    return (
        <div className="space-y-6">
            {toolbar}

            {/* KPI Cards */}
            <StatBar columns={4}>
                <StatTile label="Нийт лийд" value={total} icon={<Users className="w-4 h-4" />} accent="info" />
                <StatTile
                    label="Амжилттай"
                    value={conversion.won}
                    icon={<CheckCircle2 className="w-4 h-4" />}
                    accent="success"
                />
                <StatTile
                    label="Хөрвүүлэлт"
                    value={`${((conversion.won / total) * 100).toFixed(1)}%`}
                    icon={<Target className="w-4 h-4" />}
                    accent="brand"
                />
                <StatTile
                    label="Боловсруулалтанд"
                    value={conversion.inProgress}
                    icon={<Clock className="w-4 h-4" />}
                    accent="warning"
                />
            </StatBar>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Source Analysis — pie */}
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

                {/* Source Analysis — bar */}
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
                            data={sourceData}
                            xKey="source"
                            series={[{ key: 'count', name: 'Лийд' }]}
                            horizontal
                            colorByPoint
                        />
                    </ChartCard>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <BreakdownCard title="Төслөөр" icon={<Building2 className="w-5 h-5 text-brand-strong" />} rows={projectRows} />
                <BreakdownCard title="Менежерээр" icon={<UserRound className="w-5 h-5 text-brand-strong" />} rows={managerRows} />
                {categories.length > 0 && (
                    <BreakdownCard title="Ангиллаар" icon={<Tags className="w-5 h-5 text-brand-strong" />} rows={categoryRows} />
                )}
            </div>
        </div>
    );
}

/** Төсөл / менежер тус бүрийн лид ба амжилттай лидийн тоо (мөнгөн дүнгүй). */
function BreakdownCard({ title, icon, rows }: { title: string; icon: React.ReactNode; rows: BreakdownRow[] }) {
    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    {icon}
                    {title}
                </CardTitle>
            </CardHeader>
            <CardContent>
                {rows.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">Мэдээлэл байхгүй</p>
                ) : (
                    <div className="space-y-3">
                        {rows.map((item) => (
                            <div
                                key={item.key}
                                className="p-4 bg-surface-2/40 border border-border rounded-md"
                            >
                                <p className="font-medium text-foreground">{item.label}</p>
                                <div className="flex gap-4 mt-1">
                                    <p className="text-xs text-muted-foreground tabular-nums">Сэжим: {item.count}</p>
                                    <p className="text-xs text-status-success tabular-nums">Амжилттай: {item.won}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
