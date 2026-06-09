'use client';

import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { StatBar, StatTile } from '@/components/dashboard/StatBar';
import { Banknote, TrendingDown, TrendingUp, Percent, Download } from 'lucide-react';
import { formatMNT as formatMNTShared } from '@/lib/utils/currency';

interface Reports {
    pnl: { totalIncome: number; totalExpense: number; netProfit: number; marginPct: number; byChannel: Array<{ channel: string; revenue: number }> };
    cashflow: { months: Array<{ month: string; receipts: number; disbursements: number; net: number }>; forecastAR: number; forecastAP: number };
    vat: { outputVat: number; inputVat: number; netVat: number };
    aging: { ar: AgingB; ap: AgingB };
}
interface AgingB { current: number; d1_30: number; d31_60: number; d61_90: number; d90_plus: number; total: number; }

function formatMNT(n: number): string {
    return formatMNTShared(n, { compact: true });
}

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

    const agingRow = (label: string, b: AgingB) => (
        <tr className="text-sm">
            <td className="py-2 pr-4 font-medium text-foreground">{label}</td>
            <td className="py-2 pr-4 text-right tabular-nums">{formatMNT(b.current)}</td>
            <td className="py-2 pr-4 text-right tabular-nums">{formatMNT(b.d1_30)}</td>
            <td className="py-2 pr-4 text-right tabular-nums">{formatMNT(b.d31_60)}</td>
            <td className="py-2 pr-4 text-right tabular-nums">{formatMNT(b.d61_90)}</td>
            <td className="py-2 pr-4 text-right tabular-nums text-status-danger">{formatMNT(b.d90_plus)}</td>
            <td className="py-2 text-right tabular-nums font-semibold">{formatMNT(b.total)}</td>
        </tr>
    );

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
                        <StatTile label="Нийт орлого" value={formatMNT(reports.pnl.totalIncome)} icon={<Banknote className="w-5 h-5" />} accent="brand" />
                        <StatTile label="Нийт зардал" value={formatMNT(reports.pnl.totalExpense)} icon={<TrendingDown className="w-5 h-5" />} accent="warning" />
                        <StatTile label="Цэвэр ашиг" value={formatMNT(reports.pnl.netProfit)} icon={<TrendingUp className="w-5 h-5" />} accent={reports.pnl.netProfit >= 0 ? 'success' : 'danger'} />
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
                                                <span className="tabular-nums font-medium">{formatMNT(c.revenue)}</span>
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
                                    <div className="flex justify-between py-1"><span className="text-muted-foreground">Борлуулалтын НӨАТ (output)</span><span className="tabular-nums">{formatMNT(reports.vat.outputVat)}</span></div>
                                    <div className="flex justify-between py-1"><span className="text-muted-foreground">Худалдан авалтын НӨАТ (input)</span><span className="tabular-nums">{formatMNT(reports.vat.inputVat)}</span></div>
                                    <div className="flex justify-between py-2 border-t border-border font-semibold"><span>Төлөх НӨАТ</span><span className="tabular-nums">{formatMNT(reports.vat.netVat)}</span></div>
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
                                    Ирэх авлага: <span className="text-status-success font-medium">{formatMNT(reports.cashflow.forecastAR)}</span>
                                    {' · '}Ирэх өглөг: <span className="text-status-danger font-medium">{formatMNT(reports.cashflow.forecastAP)}</span>
                                </div>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full">
                                    <thead className="border-b border-border">
                                        <tr className="text-left text-[11px] uppercase tracking-[0.08em] text-muted-foreground/80">
                                            <th className="py-2 pr-4">Сар</th>
                                            <th className="py-2 pr-4 text-right">Орлого</th>
                                            <th className="py-2 pr-4 text-right">Зарлага</th>
                                            <th className="py-2 text-right">Цэвэр</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border/60">
                                        {reports.cashflow.months.map(m => (
                                            <tr key={m.month} className="text-sm">
                                                <td className="py-2 pr-4 text-foreground">{m.month}</td>
                                                <td className="py-2 pr-4 text-right tabular-nums text-status-success">{formatMNT(m.receipts)}</td>
                                                <td className="py-2 pr-4 text-right tabular-nums text-status-danger">{formatMNT(m.disbursements)}</td>
                                                <td className={`py-2 text-right tabular-nums font-medium ${m.net >= 0 ? 'text-status-success' : 'text-status-danger'}`}>{formatMNT(m.net)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </Card>

                    {/* Aging AR + AP */}
                    <Card>
                        <div className="p-5">
                            <h3 className="heading-section text-sm text-foreground mb-4">Насжилт (AR / AP)</h3>
                            <div className="overflow-x-auto">
                                <table className="w-full">
                                    <thead className="border-b border-border">
                                        <tr className="text-left text-[11px] uppercase tracking-[0.08em] text-muted-foreground/80">
                                            <th className="py-2 pr-4"></th>
                                            <th className="py-2 pr-4 text-right">Болоогүй</th>
                                            <th className="py-2 pr-4 text-right">1–30</th>
                                            <th className="py-2 pr-4 text-right">31–60</th>
                                            <th className="py-2 pr-4 text-right">61–90</th>
                                            <th className="py-2 pr-4 text-right">90+</th>
                                            <th className="py-2 text-right">Нийт</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border/60">
                                        {agingRow('Авлага (AR)', reports.aging.ar)}
                                        {agingRow('Өглөг (AP)', reports.aging.ap)}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </Card>
                </>
            )}
        </div>
    );
}
