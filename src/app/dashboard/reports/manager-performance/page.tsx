'use client';

import { useState, useEffect } from 'react';
import { Users, FileText, CheckCircle2, TrendingUp, DollarSign, Award, Download } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { StatBar, StatTile } from '@/components/dashboard/StatBar';

const SHOP_KEY = 'vertmonhub_active_shop_id';

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
interface Totals {
    managers: number;
    contracts: number;
    closed: number;
    sales: number;
    collected: number;
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
    const [totals, setTotals] = useState<Totals>({ managers: 0, contracts: 0, closed: 0, sales: 0, collected: 0 });
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

            <Card>
                <CardContent className="p-0">
                    {loading ? (
                        <div className="flex items-center justify-center py-20"><Spinner size="lg" /></div>
                    ) : managers.length === 0 ? (
                        <div className="py-12">
                            <EmptyState icon={<Award className="w-7 h-7" />} title="Гүйцэтгэлийн мэдээлэл алга" description="Гэрээ импортолсны дараа менежерийн гүйцэтгэл энд харагдана" />
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-border bg-surface-2/40 text-left text-[11px] uppercase tracking-[0.08em] text-muted-foreground/80">
                                        <th className="px-4 py-3 font-medium">Менежер</th>
                                        <th className="px-4 py-3 font-medium text-right">Гэрээ</th>
                                        <th className="px-4 py-3 font-medium text-right">Хаагдсан</th>
                                        <th className="px-4 py-3 font-medium">Борлуулалт</th>
                                        <th className="px-4 py-3 font-medium text-right">Цуглуулсан</th>
                                        <th className="px-4 py-3 font-medium text-right">Үлдэгдэл</th>
                                        <th className="px-4 py-3 font-medium text-right">Цуглуулалт %</th>
                                        <th className="px-4 py-3 font-medium text-right">Харилцагч</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {managers.map((m, i) => (
                                        <tr key={m.sales_manager || i} className="border-b border-border/40 hover:bg-surface-2/40 transition-colors">
                                            <td className="px-4 py-3">
                                                <div className="flex items-center gap-2">
                                                    {i < 3 && <Award className={`w-4 h-4 ${i === 0 ? 'text-status-pending' : i === 1 ? 'text-muted-foreground' : 'text-status-warning'}`} />}
                                                    <span className="font-medium text-foreground">{m.sales_manager || '—'}</span>
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 text-right tabular-nums text-foreground">{m.contract_count}</td>
                                            <td className="px-4 py-3 text-right tabular-nums text-status-success">{m.closed_count}</td>
                                            <td className="px-4 py-3">
                                                <div className="text-foreground tabular-nums">{formatMoney(m.total_sales)}</div>
                                                <div className="h-1.5 mt-1 bg-surface-2 rounded-full overflow-hidden">
                                                    <div className="h-full bg-status-success rounded-full" style={{ width: `${Math.max(3, Math.round((m.total_sales / topSales) * 100))}%` }} />
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 text-right tabular-nums text-foreground">{formatMoney(m.total_collected)}</td>
                                            <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{formatMoney(m.total_outstanding)}</td>
                                            <td className="px-4 py-3 text-right tabular-nums text-foreground">{m.collection_rate_pct}%</td>
                                            <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{m.unique_customers}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
