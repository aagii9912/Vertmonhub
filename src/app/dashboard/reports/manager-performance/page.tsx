'use client';

import { useState } from 'react';
import { Users, FileText, TrendingUp, DollarSign, Award, Download } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/Alert';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { StatBar, StatTile } from '@/components/dashboard/StatBar';
import { DataTable, type DataTableColumn, StatusPill } from '@/components/ui/DataTable';
import { dashboardFetch } from '@/lib/api/dashboardFetch';
import { useDashboardQuery } from '@/hooks/useDashboardQuery';
import { formatMNTShort } from '@/lib/utils/currency';
import { ubDateStr } from '@/lib/utils/date';
import { emptyTotals, type ManagerPerformanceTotals } from '@/lib/reports/manager-performance-totals';
import { planPctText } from '@/lib/sales/plan-performance';

interface ManagerRow {
    sales_manager: string;
    contract_count: number;
    closed_count: number;
    total_sales: number;
    total_collected: number;
    total_outstanding: number;
    collection_rate_pct: number;
    unique_customers: number;
}
type Totals = ManagerPerformanceTotals;

const NO_MANAGERS: ManagerRow[] = [];
const EMPTY_TOTALS: Totals = emptyTotals();

export default function ManagerPerformancePage() {
    const { data, error, isFetching, refetch } = useDashboardQuery<{ managers?: ManagerRow[]; totals?: Totals }>(
        ['manager-performance'],
        '/api/dashboard/reports/manager-performance',
    );
    const managers = data?.managers || NO_MANAGERS;
    const totals = data?.totals || EMPTY_TOTALS;
    const loading = !data && isFetching;
    const [exporting, setExporting] = useState(false);

    async function exportExcel() {
        setExporting(true);
        try {
            const res = await dashboardFetch('/api/dashboard/export/excel?type=manager');
            if (!res.ok) throw new Error('export failed');
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `менежер_гүйцэтгэл_${ubDateStr()}.xlsx`;
            a.click();
            URL.revokeObjectURL(url);
        } catch (e) { console.error('[ManagerPerformance] export error', e); } finally { setExporting(false); }
    }

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
                    <div className="text-foreground tabular-nums">{formatMNTShort(m.total_sales)}</div>
                    <div className="h-1.5 mt-1 bg-surface-2 rounded-full overflow-hidden">
                        <div className="h-full bg-status-success rounded-full" style={{ width: `${Math.max(3, Math.round((m.total_sales / topSales) * 100))}%` }} />
                    </div>
                </div>
            ),
        },
        { key: 'total_collected', header: 'Цуглуулсан', align: 'right', cell: (m) => <span className="tabular-nums text-foreground">{formatMNTShort(m.total_collected)}</span> },
        { key: 'total_outstanding', header: 'Үлдэгдэл', align: 'right', cell: (m) => <span className="tabular-nums text-muted-foreground">{formatMNTShort(m.total_outstanding)}</span> },
        { key: 'collection_rate_pct', header: 'Цуглуулалт %', align: 'right', cell: (m) => <span className="tabular-nums text-foreground">{m.collection_rate_pct}%</span> },
        { key: 'unique_customers', header: 'Харилцагч', align: 'right', cell: (m) => <span className="tabular-nums text-muted-foreground">{m.unique_customers}</span> },
    ];

    const header = (
        <PageHeader
            eyebrow="Аналитик"
            title="Менежерийн гүйцэтгэл"
            subtitle="Идэвхтэй менежер тус бүрийн гэрээ, хаалт, борлуулалт, цуглуулалт"
            primaryAction={
                <Button onClick={exportExcel} variant="secondary" size="md" isLoading={exporting} disabled={exporting || managers.length === 0}>
                    {!exporting && <Download className="w-4 h-4" />} Excel татах
                </Button>
            }
        />
    );
    const errorAlert = error && !isFetching && (
        <Alert variant="danger" className="mb-4">
            <AlertDescription>{error.message}</AlertDescription>
            <Button variant="secondary" size="sm" className="mt-1 self-start" onClick={() => void refetch()}>Дахин оролдох</Button>
        </Alert>
    );

    // Алдаа гарсан үед хоосон тайлан харуулахгүй — мэдээлэл байхгүй гэж ойлгогдоно.
    if (errorAlert && !data) {
        return <div>{header}{errorAlert}</div>;
    }

    return (
        <div>
            {header}
            {errorAlert}

            <StatBar columns={4}>
                <StatTile label="Менежер" value={totals.managers} icon={<Users className="w-4 h-4" />} accent="info" />
                <StatTile label="Нийт гэрээ" value={totals.contracts} icon={<FileText className="w-4 h-4" />} accent="brand" helper={`${totals.closed} хаагдсан`} />
                <StatTile label="Нийт борлуулалт" value={formatMNTShort(totals.sales)} icon={<TrendingUp className="w-4 h-4" />} accent="success" />
                <StatTile label="Цуглуулсан" value={formatMNTShort(totals.collected)} icon={<DollarSign className="w-4 h-4" />} accent="warning" helper={totals.sales > 0 ? `${Math.round((totals.collected / totals.sales) * 100)}%` : undefined} />
            </StatBar>

            {/* Багийн жилийн төлөвлөгөө (admin-аас тохируулсан үед) — төслийн төлөвлөгөөнд хамаарах бүх гэрээ */}
            {((totals.teamTarget ?? 0) > 0 || (totals.teamYearTarget ?? 0) > 0) && (
                <Card className="mb-4 border-brand/30 bg-brand-soft/40">
                    <div className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between md:p-5">
                        <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-soft">
                                <TrendingUp className="h-5 w-5 text-brand-strong" />
                            </div>
                            <div>
                                <p className="text-sm font-semibold text-foreground">Багийн {new Date().getFullYear()} оны төлөвлөгөө</p>
                                <p className="text-xs text-muted-foreground">
                                    Гүйцэтгэл {totals.teamActual === null ? '—' : `${formatMNTShort(totals.teamActual)}${totals.teamLowerBound ? '+' : ''}`}
                                    {' '}/ {totals.teamTarget === null ? '—' : formatMNTShort(totals.teamTarget)} (он эхнээс, төслийн бүх гэрээ)
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center gap-4 text-sm">
                            <span className="text-muted-foreground">Он эхнээс <b className={`text-lg font-bold tabular-nums ${(totals.teamAttainmentPct ?? 0) >= 100 ? 'text-status-success' : 'text-brand-strong'}`}>
                                {planPctText(totals.teamAttainmentPct, totals.teamLowerBound)}</b></span>
                            <span className="text-muted-foreground">Жилийн төлөвлөгөөнөөс <b className="text-lg font-bold tabular-nums text-foreground">
                                {planPctText(totals.teamYearPct, totals.teamLowerBound)}</b></span>
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
