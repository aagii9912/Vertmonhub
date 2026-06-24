'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
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
        return <div className="flex items-center justify-center min-h-[400px]"><div className="w-6 h-6 border-2 border-status-success border-t-transparent rounded-full animate-spin" /></div>;
    }

    const pctSold = stats.total > 0 ? Math.round((stats.sold / stats.total) * 100) : 0;

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-xl md:text-2xl font-bold text-foreground flex items-center gap-2">
                        <Building2 className="w-6 h-6 text-status-success" /> Үл хөдлөхийн тайлан
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">Нэгжийн нөөц: ээлж, ангилал, төлөвөөр</p>
                </div>
                <Button onClick={exportExcel} variant="secondary" size="sm" isLoading={exporting} disabled={exporting || stats.total === 0}>
                    {!exporting && <Download className="w-4 h-4 mr-2" />} Татах
                </Button>
            </div>

            {stats.total === 0 ? (
                <div className="flex flex-col items-center justify-center min-h-[300px] text-center">
                    <Building2 className="w-16 h-16 text-muted-foreground/60 mb-4" />
                    <h2 className="text-xl font-semibold text-foreground mb-2">Мэдээлэл байхгүй</h2>
                    <p className="text-muted-foreground max-w-md">Нэгжийн дата импортлоогүй байна.</p>
                </div>
            ) : (
                <>
                    {/* Key stats */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                        <StatCard icon={<Building2 className="w-5 h-5 text-status-info" />} bg="bg-status-info-soft" value={stats.total.toLocaleString()} label="Нийт нэгж" />
                        <StatCard icon={<Home className="w-5 h-5 text-status-success" />} bg="bg-status-success-soft" value={stats.available.toLocaleString()} label="Зарагдаагүй" />
                        <StatCard icon={<CheckCircle2 className="w-5 h-5 text-brand-strong" />} bg="bg-brand-soft" value={stats.sold.toLocaleString()} label={`Зарагдсан (${pctSold}%)`} />
                        <StatCard icon={<Layers className="w-5 h-5 text-status-pending" />} bg="bg-status-pending-soft" value={Math.round(stats.totalArea).toLocaleString() + ' м²'} label="Нийт талбай" />
                    </div>

                    {/* By phase + by category */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <GroupCard title="Ээлжээр" rows={byPhase} />
                        <GroupCard title="Ангиллаар" rows={byCategory} />
                    </div>
                </>
            )}
        </div>
    );
}

function StatCard({ icon, bg, value, label }: { icon: React.ReactNode; bg: string; value: string; label: string }) {
    return (
        <Card className="bg-surface border-border"><CardContent className="p-4">
            <div className={`p-2 ${bg} rounded-lg w-fit`}>{icon}</div>
            <div className="mt-3"><p className="text-2xl font-bold text-foreground tabular-nums">{value}</p><p className="text-sm text-muted-foreground">{label}</p></div>
        </CardContent></Card>
    );
}

function GroupCard({ title, rows }: { title: string; rows: GroupRow[] }) {
    return (
        <Card className="bg-surface border-border"><CardContent className="p-4">
            <h3 className="font-semibold text-foreground mb-4">{title}</h3>
            {rows.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">Мэдээлэл байхгүй</p>
            ) : (
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-b border-border/60 text-xs text-muted-foreground">
                            <th className="text-left py-2 font-medium">{title === 'Ээлжээр' ? 'Ээлж' : 'Ангилал'}</th>
                            <th className="text-center py-2 font-medium">Нийт</th>
                            <th className="text-center py-2 font-medium">Зарагдаагүй</th>
                            <th className="text-right py-2 font-medium">Зарагдсан %</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((r) => (
                            <tr key={r.key} className="border-b border-border/40 hover:bg-surface-2/40">
                                <td className="py-3 font-medium text-foreground">{r.key}</td>
                                <td className="py-3 text-center text-muted-foreground tabular-nums">{r.total}</td>
                                <td className="py-3 text-center"><span className="px-2 py-1 bg-status-success-soft text-status-success rounded-full text-xs tabular-nums">{r.available}</span></td>
                                <td className="py-3 text-right text-foreground tabular-nums">{r.total > 0 ? Math.round((r.sold / r.total) * 100) : 0}%</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
        </CardContent></Card>
    );
}
