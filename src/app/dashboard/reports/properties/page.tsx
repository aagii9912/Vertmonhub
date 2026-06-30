'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/Button';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { StatsCard } from '@/components/dashboard/StatsCard';
import { ChartCard } from '@/components/ui/ChartCard';
import { BarChart } from '@/components/charts/BarChart';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { Building2, Download, CheckCircle2, Layers, Home } from 'lucide-react';

const SHOP_KEY = 'vertmonhub_active_shop_id';

interface Stats { total: number; available: number; sold: number; reserved: number; totalArea: number; }
interface GroupRow { key: string; total: number; available: number; sold: number; }

const CAT_LABEL: Record<string, string> = { residential: 'Орон сууц', parking: 'Зогсоол', industry: 'Агуулах', commercial: 'Үйлчилгээ' };

function shopHeaders(): HeadersInit {
    return { 'x-shop-id': typeof window !== 'undefined' ? localStorage.getItem(SHOP_KEY) || '' : '' };
}

export default function PropertiesReportPage() {
    const [loading, setLoading] = useState(true);
    const [exporting, setExporting] = useState(false);
    const [stats, setStats] = useState<Stats>({ total: 0, available: 0, sold: 0, reserved: 0, totalArea: 0 });
    const [byPhase, setByPhase] = useState<GroupRow[]>([]);
    const [byCategory, setByCategory] = useState<GroupRow[]>([]);

    useEffect(() => {
        (async () => {
            setLoading(true);
            try {
                // property_block_summary view-ээс ээлж/блок/ангиллын нэгтгэлийг авна
                const res = await fetch('/api/dashboard/units', { headers: shopHeaders() });
                const data = await res.json();
                const summary: Array<Record<string, number | string>> = data.summary || [];

                const s: Stats = { total: 0, available: 0, sold: 0, reserved: 0, totalArea: 0 };
                const phaseMap = new Map<string, GroupRow>();
                const catMap = new Map<string, GroupRow>();
                for (const r of summary) {
                    const total = Number(r.total_units) || 0;
                    const avail = Number(r.available_units) || 0;
                    const sold = Number(r.sold_units) || 0;
                    const pending = Number(r.pending_units) || 0;
                    s.total += total; s.available += avail; s.sold += sold; s.reserved += pending;
                    s.totalArea += Number(r.total_area) || 0;

                    const ph = String(r.phase || '—');
                    const p = phaseMap.get(ph) || { key: ph, total: 0, available: 0, sold: 0 };
                    p.total += total; p.available += avail; p.sold += sold; phaseMap.set(ph, p);

                    const cat = CAT_LABEL[String(r.category)] || String(r.category || '—');
                    const c = catMap.get(cat) || { key: cat, total: 0, available: 0, sold: 0 };
                    c.total += total; c.available += avail; c.sold += sold; catMap.set(cat, c);
                }
                setStats(s);
                setByPhase([...phaseMap.values()].sort((a, b) => b.total - a.total));
                setByCategory([...catMap.values()].sort((a, b) => b.total - a.total));
            } catch (e) {
                console.error('[PropertiesReport] error', e);
            } finally {
                setLoading(false);
            }
        })();
    }, []);

    async function exportExcel() {
        setExporting(true);
        try {
            const res = await fetch('/api/dashboard/export/excel?type=properties', { headers: shopHeaders() });
            if (!res.ok) throw new Error('export failed');
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = `нэгжүүд_${new Date().toISOString().slice(0, 10)}.xlsx`; a.click();
            URL.revokeObjectURL(url);
        } catch (e) { console.error(e); } finally { setExporting(false); }
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <Spinner size="md" />
            </div>
        );
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
