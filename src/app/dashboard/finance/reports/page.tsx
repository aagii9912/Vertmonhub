'use client';

import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { StatBar, StatTile } from '@/components/dashboard/StatBar';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { Money } from '@/components/ui/Money';
import { Banknote, TrendingDown, TrendingUp, Percent, Download } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Reports {
    pnl: { totalIncome: number; totalExpense: number; netProfit: number; marginPct: number; byChannel: Array<{ channel: string; revenue: number }> };
    cashflow: { months: Array<{ month: string; receipts: number; disbursements: number; net: number }>; forecastAR: number; forecastAP: number };
    vat: { outputVat: number; inputVat: number; netVat: number };
    aging: { ar: AgingB; ap: AgingB };
}
interface AgingB { current: number; d1_30: number; d31_60: number; d61_90: number; d90_plus: number; total: number; }

interface CashflowMonth { month: string; receipts: number; disbursements: number; net: number; }
interface AgingRowData { id: string; label: string; bucket: AgingB; }

export default function FinanceReportsPage() {
    const [reports, setReports] = useState<Reports | null>(null);
    const [loading, setLoading] = useState(true);
    const [exporting, setExporting] = useState(false);

    const headers = () => ({ 'x-shop-id': localStorage.getItem('vertmonhub_active_shop_id') || '' });

    useEffect(() => {
        (async () => {
            try {
                const r = await fetch('/api/dashboard/finance/reports', { headers: headers() }).then(r => r.json());
                setReports(r.reports || null);
            } catch (e) { console.error(e); } finally { setLoading(false); }
        })();
    }, []);

    async function exportExcel() {
        setExporting(true);
        try {
            const res = await fetch('/api/dashboard/finance/reports/export', { headers: headers() });
            if (!res.ok) throw new Error('export failed');
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `finance-${new Date().toISOString().slice(0, 10)}.xlsx`;
            a.click();
            URL.revokeObjectURL(url);
        } catch (e) { console.error(e); } finally { setExporting(false); }
    }

    const cashflowColumns: DataTableColumn<CashflowMonth>[] = [
        { key: 'month', header: 'Сар', accessor: (m) => m.month, cell: (m) => <span className="text-foreground">{m.month}</span> },
        { key: 'receipts', header: 'Орлого', align: 'right', accessor: (m) => m.receipts, cell: (m) => <Money value={m.receipts} compact className="text-status-success" /> },
        { key: 'disbursements', header: 'Зарлага', align: 'right', accessor: (m) => m.disbursements, cell: (m) => <Money value={m.disbursements} compact className="text-status-danger" /> },
        { key: 'net', header: 'Цэвэр', align: 'right', accessor: (m) => m.net, cell: (m) => <Money value={m.net} compact className={cn('font-medium', m.net >= 0 ? 'text-status-success' : 'text-status-danger')} /> },
    ];

    const agingColumns: DataTableColumn<AgingRowData>[] = [
        { key: 'label', header: '', accessor: (r) => r.label, cell: (r) => <span className="font-medium text-foreground">{r.label}</span> },
        { key: 'current', header: 'Болоогүй', align: 'right', accessor: (r) => r.bucket.current, cell: (r) => <Money value={r.bucket.current} compact /> },
        { key: 'd1_30', header: '1–30', align: 'right', accessor: (r) => r.bucket.d1_30, cell: (r) => <Money value={r.bucket.d1_30} compact /> },
        { key: 'd31_60', header: '31–60', align: 'right', accessor: (r) => r.bucket.d31_60, cell: (r) => <Money value={r.bucket.d31_60} compact /> },
        { key: 'd61_90', header: '61–90', align: 'right', accessor: (r) => r.bucket.d61_90, cell: (r) => <Money value={r.bucket.d61_90} compact /> },
        { key: 'd90_plus', header: '90+', align: 'right', accessor: (r) => r.bucket.d90_plus, cell: (r) => <Money value={r.bucket.d90_plus} compact className="text-status-danger" /> },
        { key: 'total', header: 'Нийт', align: 'right', accessor: (r) => r.bucket.total, cell: (r) => <Money value={r.bucket.total} compact className="font-semibold" /> },
    ];

    return (
        <div>
            <PageHeader
                eyebrow="ERP"
                title="Санхүүгийн тайлан"
                subtitle="P&L, мөнгөн урсгал, НӨАТ, AR/AP"
                primaryAction={
                    <Button variant="secondary" size="sm" onClick={exportExcel} isLoading={exporting} disabled={exporting}>
                        {!exporting && <Download className="w-4 h-4" />}Excel татах
                    </Button>
                }
            />

            {loading ? (
                <Card><div className="flex items-center justify-center py-16"><Spinner size="lg" /></div></Card>
            ) : !reports ? (
                <Card><div className="py-12 text-center text-muted-foreground">Өгөгдөл алга</div></Card>
            ) : (
                <>
                    {/* P&L */}
                    <StatBar columns={4}>
                        <StatTile label="Нийт орлого" value={<Money value={reports.pnl.totalIncome} compact />} icon={<Banknote className="w-5 h-5" />} accent="brand" />
                        <StatTile label="Нийт зардал" value={<Money value={reports.pnl.totalExpense} compact />} icon={<TrendingDown className="w-5 h-5" />} accent="warning" />
                        <StatTile label="Цэвэр ашиг" value={<Money value={reports.pnl.netProfit} compact />} icon={<TrendingUp className="w-5 h-5" />} accent={reports.pnl.netProfit >= 0 ? 'success' : 'danger'} />
                        <StatTile label="Ашгийн хувь" value={`${reports.pnl.marginPct}%`} icon={<Percent className="w-5 h-5" />} accent="info" />
                    </StatBar>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                        {/* By channel */}
                        <Card>
                            <div className="p-5">
                                <h3 className="heading-section text-sm text-foreground mb-4">Орлого — сувгаар</h3>
                                {reports.pnl.byChannel.length === 0 ? (
                                    <p className="text-sm text-muted-foreground py-4 text-center">Өгөгдөл алга</p>
                                ) : (
                                    <div className="divide-y divide-border/60">
                                        {reports.pnl.byChannel.map(c => (
                                            <div key={c.channel} className="flex justify-between py-2 text-sm">
                                                <span className="text-foreground">{c.channel}</span>
                                                <Money value={c.revenue} compact className="font-medium" />
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </Card>

                        {/* VAT */}
                        <Card>
                            <div className="p-5">
                                <h3 className="heading-section text-sm text-foreground mb-4">НӨАТ</h3>
                                <div className="space-y-2 text-sm">
                                    <div className="flex justify-between py-1"><span className="text-muted-foreground">Борлуулалтын НӨАТ (output)</span><Money value={reports.vat.outputVat} compact /></div>
                                    <div className="flex justify-between py-1"><span className="text-muted-foreground">Худалдан авалтын НӨАТ (input)</span><Money value={reports.vat.inputVat} compact /></div>
                                    <div className="flex justify-between py-2 border-t border-border font-semibold"><span>Төлөх НӨАТ</span><Money value={reports.vat.netVat} compact /></div>
                                </div>
                            </div>
                        </Card>
                    </div>

                    {/* Cash flow */}
                    <Card className="mb-6">
                        <div className="p-5">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="heading-section text-sm text-foreground">Мөнгөн урсгал (6 сар)</h3>
                                <div className="text-xs text-muted-foreground">
                                    Ирэх авлага: <Money value={reports.cashflow.forecastAR} compact className="text-status-success font-medium" />
                                    {' · '}Ирэх өглөг: <Money value={reports.cashflow.forecastAP} compact className="text-status-danger font-medium" />
                                </div>
                            </div>
                            <DataTable
                                columns={cashflowColumns}
                                data={reports.cashflow.months}
                                getRowId={(m) => m.month}
                                caption="Мөнгөн урсгал (6 сар)"
                                showDensityToggle={false}
                                hidePagination
                            />
                        </div>
                    </Card>

                    {/* Aging AR + AP */}
                    <Card>
                        <div className="p-5">
                            <h3 className="heading-section text-sm text-foreground mb-4">Насжилт (AR / AP)</h3>
                            <DataTable
                                columns={agingColumns}
                                data={[
                                    { id: 'ar', label: 'Авлага (AR)', bucket: reports.aging.ar },
                                    { id: 'ap', label: 'Өглөг (AP)', bucket: reports.aging.ap },
                                ]}
                                getRowId={(r) => r.id}
                                caption="Насжилт (AR / AP)"
                                showDensityToggle={false}
                                hidePagination
                            />
                        </div>
                    </Card>
                </>
            )}
        </div>
    );
}
