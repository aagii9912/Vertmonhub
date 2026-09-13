'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { Alert } from '@/components/ui/Alert';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { StatsCard } from '@/components/dashboard/StatsCard';
import { ChartCard } from '@/components/ui/ChartCard';
import { BarChart } from '@/components/charts/BarChart';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { Building2, Download, CheckCircle2, Layers, Home } from 'lucide-react';
import { dashboardFetch, dashboardJson } from '@/lib/api/dashboardFetch';

interface Stats { total: number; available: number; sold: number; reserved: number; totalArea: number; }
interface GroupRow { key: string; total: number; available: number; sold: number; }

const CAT_LABEL: Record<string, string> = { residential: 'Орон сууц', parking: 'Зогсоол', industry: 'Агуулах', commercial: 'Үйлчилгээ' };

export default function PropertiesReportPage() {
    const { shop, loading: authLoading } = useAuth();
    const [exporting, setExporting] = useState(false);
    const { data, isLoading: loading, isError, isFetching, refetch } = useQuery({
        queryKey: ['properties-report', shop?.id],
        queryFn: () => dashboardJson<{ summary: Array<Record<string, number | string>> }>('/api/dashboard/units'),
        enabled: !!shop?.id,
    });
    const { stats, byPhase, byCategory } = useMemo(() => {
        const stats: Stats = { total: 0, available: 0, sold: 0, reserved: 0, totalArea: 0 };
        const phaseMap = new Map<string, GroupRow>();
        const catMap = new Map<string, GroupRow>();
        for (const row of data?.summary || []) {
            const total = Number(row.total_units) || 0;
            const available = Number(row.available_units) || 0;
            const sold = Number(row.sold_units) || 0;
            stats.total += total; stats.available += available; stats.sold += sold;
            stats.reserved += Number(row.pending_units) || 0;
            stats.totalArea += Number(row.total_area) || 0;
            for (const [map, key] of [
                [phaseMap, String(row.phase || '—')],
                [catMap, CAT_LABEL[String(row.category)] || String(row.category || '—')],
            ] as const) {
                const group = map.get(key) || { key, total: 0, available: 0, sold: 0 };
                group.total += total; group.available += available; group.sold += sold;
                map.set(key, group);
            }
        }
        return { stats, byPhase: [...phaseMap.values()].sort((a, b) => b.total - a.total), byCategory: [...catMap.values()].sort((a, b) => b.total - a.total) };
    }, [data]);

    async function exportExcel() {
        setExporting(true);
        try {
            const res = await dashboardFetch('/api/dashboard/export/excel?type=properties');
            if (!res.ok) throw new Error('export failed');
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = `нэгжүүд_${new Date().toISOString().slice(0, 10)}.xlsx`; a.click();
            URL.revokeObjectURL(url);
        } catch { toast.error('Тайлан татаж чадсангүй. Дахин оролдоно уу.'); } finally { setExporting(false); }
    }

    if (authLoading || loading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <Spinner size="md" />
            </div>
        );
    }

    if (!shop || (!data && isError)) {
        return <Alert variant="danger">
            Үл хөдлөхийн тайланг ачаалж чадсангүй. Мэдээлэл байхгүй гэж дүгнэх боломжгүй.
            <Button size="sm" variant="secondary" disabled={isFetching} onClick={() => void refetch()}>Дахин оролдох</Button>
        </Alert>;
    }

    const pctSold = stats.total > 0 ? Math.round((stats.sold / stats.total) * 100) : 0;

    return (
        <div>
            <PageHeader
                eyebrow="Аналитик"
                title="Үл хөдлөхийн тайлан"
                subtitle="Нэгжийн нөөц: ээлж, ангилал, төлөвөөр"
                primaryAction={
                    <Button onClick={exportExcel} variant="secondary" size="sm" isLoading={exporting} disabled={exporting || stats.total === 0}>
                        {!exporting && <Download className="w-4 h-4" />} Татах
                    </Button>
                }
            />

            {isError && <Alert variant="warning">
                Тайланг шинэчилж чадсангүй. Өмнө ачаалсан мэдээлэл харагдаж байна.
                <Button size="sm" variant="secondary" disabled={isFetching} onClick={() => void refetch()}>Дахин оролдох</Button>
            </Alert>}
            {stats.total === 0 ? (
                <EmptyState
                    icon={<Building2 className="w-7 h-7" />}
                    title="Мэдээлэл байхгүй"
                    description="Нэгжийн дата импортлоогүй байна."
                />
            ) : (
                <div className="space-y-6">
                    {/* Key stats */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
                        <StatsCard icon={Building2} iconColor="info" value={stats.total.toLocaleString()} title="Нийт нэгж" />
                        <StatsCard icon={Home} iconColor="success" value={stats.available.toLocaleString()} title="Зарагдаагүй" />
                        <StatsCard icon={CheckCircle2} iconColor="brand" value={stats.sold.toLocaleString()} title={`Зарагдсан (${pctSold}%)`} />
                        <StatsCard icon={Layers} iconColor="warning" value={Math.round(stats.totalArea).toLocaleString() + ' м²'} title="Нийт талбай" />
                    </div>

                    {/* By phase + by category */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <GroupChart title="Ээлжээр" categoryLabel="Ээлж" rows={byPhase} />
                        <GroupChart title="Ангиллаар" categoryLabel="Ангилал" rows={byCategory} />
                    </div>
                </div>
            )}
        </div>
    );
}

function GroupChart({ title, categoryLabel, rows }: { title: string; categoryLabel: string; rows: GroupRow[] }) {
    if (rows.length === 0) {
        return (
            <ChartCard title={title} subtitle={categoryLabel} raw height={200}>
                <p className="text-sm text-muted-foreground text-center py-8">Мэдээлэл байхгүй</p>
            </ChartCard>
        );
    }

    return (
        <ChartCard
            title={title}
            subtitle={`${categoryLabel} тус бүрийн зарагдсан / зарагдаагүй нэгж`}
            height={Math.max(220, rows.length * 56)}
        >
            <BarChart
                data={rows.map((r) => ({ key: r.key, sold: r.sold, available: r.available }))}
                xKey="key"
                series={[
                    { key: 'sold', name: 'Зарагдсан' },
                    { key: 'available', name: 'Зарагдаагүй' },
                ]}
                horizontal
                stacked
            />
        </ChartCard>
    );
}
