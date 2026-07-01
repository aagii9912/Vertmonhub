'use client';

import { useState, useEffect } from 'react';
import { Users, FileText, TrendingUp, DollarSign, Award, Download } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { StatBar, StatTile } from '@/components/dashboard/StatBar';
import { DataTable, type DataTableColumn, StatusPill } from '@/components/ui/DataTable';

const SHOP_KEY = 'vertmonhub_active_shop_id';

interface ManagerRow {
    sales_manager: string;
    is_active?: boolean;
    contract_count: number;
    closed_count: number;
    total_sales: number;
    total_collected: number;
    total_outstanding: number;
    collection_rate_pct: number;
    unique_customers: number;
}
interface Totals {
    managers: number;
    contracts: number;
    closed: number;
    sales: number;
    collected: number;
    teamTarget: number;
    teamActual: number;
    teamAttainmentPct: number;
}

function formatMoney(n: number): string {
    if (!n) return '0₮';
    if (n >= 1e9) return (n / 1e9).toFixed(1) + ' тэрбум₮';
    if (n >= 1e6) return (n / 1e6).toFixed(0) + ' сая₮';
    return new Intl.NumberFormat('mn-MN').format(Math.round(n)) + '₮';
}
function shopHeaders(): HeadersInit {
    return { 'x-shop-id': typeof window !== 'undefined' ? localStorage.getItem(SHOP_KEY) || '' : '' };
}

export default function ManagerPerformancePage() {
    const [managers, setManagers] = useState<ManagerRow[]>([]);
    const [totals, setTotals] = useState<Totals>({ managers: 0, contracts: 0, closed: 0, sales: 0, collected: 0, teamTarget: 0, teamActual: 0, teamAttainmentPct: 0 });
    const [loading, setLoading] = useState(true);
    const [exporting, setExporting] = useState(false);

    async function exportExcel() {
        setExporting(true);
        try {
            const res = await fetch('/api/dashboard/export/excel?type=manager', { headers: shopHeaders() });
            if (!res.ok) throw new Error('export failed');
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `менежер_гүйцэтгэл_${new Date().toISOString().slice(0, 10)}.xlsx`;
            a.click();
            URL.revokeObjectURL(url);
        } catch (e) { console.error('[ManagerPerformance] export error', e); } finally { setExporting(false); }
    }

    useEffect(() => {
        (async () => {
            try {
                setLoading(true);
                const res = await fetch('/api/dashboard/reports/manager-performance', { headers: shopHeaders() });
                const data = await res.json();
                setManagers(data.managers || []);
                setTotals(data.totals || totals);
            } catch (e) {
                console.error('[ManagerPerformance] fetch error', e);
            } finally {
                setLoading(false);
            }
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const topSales = managers[0]?.total_sales || 1;

    // Presentation only — column renderers reuse the exact same numbers and ordering
    // that the original <table> produced (managers array, topSales bar ratio).
    const columns: DataTableColumn<ManagerRow>[] = [
        {
            key: 'sales_manager',
            header: 'Менежер',
            cell: (m) => {
                const i = managers.indexOf(m);
                return (
                    <div className="flex items-center gap-2">
                        {i < 3 && (
                            <Award className={`w-4 h-4 ${i === 0 ? 'text-status-pending' : i === 1 ? 'text-muted-foreground' : 'text-status-pending/70'}`} />
                        )}
                        <span className="font-medium text-foreground">{m.sales_manager || '—'}</span>
                        {m.is_active === false && (
                            <span className="rounded-full bg-surface-2 px-1.5 py-0.5 text-2xs text-muted-foreground">Идэвхгүй</span>
                        )}
                    </div>
                );
            },
        },
        { key: 'contract_count', header: 'Гэрээ', align: 'right', cell: (m) => <span className="tabular-nums text-foreground">{m.contract_count}</span> },
        {
            key: 'closed_count',
            header: 'Хаагдсан',
            align: 'right',
            cell: (m) => (
                <StatusPill variant="success" className="tabular-nums">{m.closed_count}</StatusPill>
            ),
        },
        {
            key: 'total_sales',
            header: 'Борлуулалт',
            cell: (m) => (
                <div className="min-w-[10rem]">
                    <div className="text-foreground tabular-nums">{formatMoney(m.total_sales)}</div>
                    <div className="h-1.5 mt-1 bg-surface-2 rounded-full overflow-hidden">
                        <div className="h-full bg-status-success rounded-full" style={{ width: `${Math.max(3, Math.round((m.total_sales / topSales) * 100))}%` }} />
                    </div>
                </div>
            ),
        },
        { key: 'total_collected', header: 'Цуглуулсан', align: 'right', cell: (m) => <span className="tabular-nums text-foreground">{formatMoney(m.total_collected)}</span> },
        { key: 'total_outstanding', header: 'Үлдэгдэл', align: 'right', cell: (m) => <span className="tabular-nums text-muted-foreground">{formatMoney(m.total_outstanding)}</span> },
        { key: 'collection_rate_pct', header: 'Цуглуулалт %', align: 'right', cell: (m) => <span className="tabular-nums text-foreground">{m.collection_rate_pct}%</span> },
        { key: 'unique_customers', header: 'Харилцагч', align: 'right', cell: (m) => <span className="tabular-nums text-muted-foreground">{m.unique_customers}</span> },
    ];

    return (
        <div>
            <PageHeader
                eyebrow="Аналитик"
                title="Менежерийн гүйцэтгэл"
                subtitle="Менежер тус бүрийн гэрээ, хаалт, борлуулалт, цуглуулалт"
                primaryAction={
                    <Button onClick={exportExcel} variant="secondary" size="md" isLoading={exporting} disabled={exporting || managers.length === 0}>
                        {!exporting && <Download className="w-4 h-4" />} Excel татах
                    </Button>
                }
            />

            <StatBar columns={4}>
                <StatTile label="Менежер" value={totals.managers} icon={<Users className="w-4 h-4" />} accent="info" />
                <StatTile label="Нийт гэрээ" value={totals.contracts} icon={<FileText className="w-4 h-4" />} accent="brand" helper={`${totals.closed} хаагдсан`} />
                <StatTile label="Нийт борлуулалт" value={formatMoney(totals.sales)} icon={<TrendingUp className="w-4 h-4" />} accent="success" />
                <StatTile label="Цуглуулсан" value={formatMoney(totals.collected)} icon={<DollarSign className="w-4 h-4" />} accent="warning" helper={totals.sales > 0 ? `${Math.round((totals.collected / totals.sales) * 100)}%` : undefined} />
            </StatBar>

            {/* Багийн жилийн төлөвлөгөө (admin-аас тохируулсан үед) */}
            {totals.teamTarget > 0 && (
                <Card className="mb-4 border-brand/30 bg-gradient-to-br from-brand-soft/40 to-transparent">
                    <div className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between md:p-5">
                        <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-soft">
                                <TrendingUp className="h-5 w-5 text-brand" />
                            </div>
                            <div>
                                <p className="text-sm font-semibold text-foreground">Багийн {new Date().getFullYear()} оны төлөвлөгөө</p>
                                <p className="text-xs text-muted-foreground">
                                    Гүйцэтгэл {formatMoney(totals.teamActual)} / {formatMoney(totals.teamTarget)} (идэвхтэй менежерүүд)
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center gap-3 md:w-64">
                            <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-3">
                                <div
                                    className={`h-full rounded-full ${totals.teamAttainmentPct >= 100 ? 'bg-status-success' : totals.teamAttainmentPct >= 60 ? 'bg-brand' : 'bg-status-pending'}`}
                                    style={{ width: `${Math.min(100, totals.teamAttainmentPct)}%` }}
                                />
                            </div>
                            <span className={`text-lg font-bold tabular-nums ${totals.teamAttainmentPct >= 100 ? 'text-status-success' : 'text-brand'}`}>
                                {totals.teamAttainmentPct}%
                            </span>
                        </div>
                    </div>
                </Card>
            )}

            <Card>
                <div className="p-4 md:p-5">
                    <DataTable<ManagerRow>
                        columns={columns}
                        data={managers}
                        getRowId={(m) => m.sales_manager || String(managers.indexOf(m))}
                        caption="Менежерийн гүйцэтгэл"
                        loading={loading}
                        emptyMessage="Гэрээ импортолсны дараа менежерийн гүйцэтгэл энд харагдана"
                        showDensityToggle={false}
                        hidePagination
                    />
                </div>
            </Card>
        </div>
    );
}
