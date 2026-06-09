'use client';

import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { StatBar, StatTile } from '@/components/dashboard/StatBar';
import { Banknote, TrendingUp, TrendingDown, Target, Plus, X, AlertCircle, Link2 } from 'lucide-react';

interface Pnl {
    project_id: string | null;
    name: string;
    revenue: number;
    collected: number;
    cost: number;
    margin: number;
    budget: number;
    budgetVariance: number;
}
interface Project { id: string; name: string; }
interface Account { id: string; code: string; name: string; }

function formatMNT(n: number): string {
    if (Math.abs(n) >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B₮`;
    if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M₮`;
    return `${Math.round(n).toLocaleString()}₮`;
}

export default function ProjectFinancePage() {
    const [rows, setRows] = useState<Pnl[]>([]);
    const [projects, setProjects] = useState<Project[]>([]);
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [loading, setLoading] = useState(true);
    const [mapping, setMapping] = useState(false);

    const [showBudget, setShowBudget] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [budgetForm, setBudgetForm] = useState({ project_id: '', account_id: '', label: '', planned_amount: '' });

    const headers = () => ({
        'Content-Type': 'application/json',
        'x-shop-id': localStorage.getItem('vertmonhub_active_shop_id') || '',
    });

    useEffect(() => { loadAll(); /* eslint-disable-next-line */ }, []);

    async function loadAll() {
        setLoading(true);
        try {
            const [p, pr, ac] = await Promise.all([
                fetch('/api/dashboard/finance/project-pnl', { headers: headers() }).then(r => r.json()),
                fetch('/api/dashboard/projects', { headers: headers() }).then(r => r.json()),
                fetch('/api/dashboard/finance/accounts', { headers: headers() }).then(r => r.json()),
            ]);
            setRows(p.projects || []);
            setProjects(pr.projects || []);
            setAccounts(ac.accounts || []);
        } catch (e) { console.error(e); } finally { setLoading(false); }
    }

    async function autoMap() {
        setMapping(true);
        try {
            const res = await fetch('/api/dashboard/finance/projects/automap', { method: 'POST', headers: headers() });
            if (res.ok) await loadAll();
        } catch (e) { console.error(e); } finally { setMapping(false); }
    }

    async function addBudget() {
        const amount = parseFloat(budgetForm.planned_amount);
        if (!budgetForm.project_id) { setError('Төсөл сонгоно уу'); return; }
        if (!amount || amount <= 0) { setError('Дүн оруулна уу'); return; }
        setSaving(true); setError(null);
        try {
            const res = await fetch('/api/dashboard/finance/budgets', {
                method: 'POST', headers: headers(),
                body: JSON.stringify({
                    project_id: budgetForm.project_id,
                    account_id: budgetForm.account_id || null,
                    label: budgetForm.label || null,
                    planned_amount: amount,
                }),
            });
            if (!res.ok) throw new Error((await res.json())?.error || 'Алдаа');
            setShowBudget(false);
            setBudgetForm({ project_id: '', account_id: '', label: '', planned_amount: '' });
            await loadAll();
        } catch (e) { setError(e instanceof Error ? e.message : 'Алдаа'); } finally { setSaving(false); }
    }

    const totals = rows.reduce((t, r) => ({
        revenue: t.revenue + r.revenue, cost: t.cost + r.cost, margin: t.margin + r.margin, budget: t.budget + r.budget,
    }), { revenue: 0, cost: 0, margin: 0, budget: 0 });

    return (
        <div>
            <PageHeader
                eyebrow="ERP"
                title="Төслийн санхүү"
                subtitle="Орлого vs өртөг, төсөв vs гүйцэтгэл"
                primaryAction={
                    <Button variant="primary" size="sm" onClick={() => { setShowBudget(true); setError(null); }}>
                        <Plus className="w-4 h-4" />Төсөв нэмэх
                    </Button>
                }
                secondaryActions={
                    <Button variant="secondary" size="sm" onClick={autoMap} isLoading={mapping} disabled={mapping}>
                        {!mapping && <Link2 className="w-4 h-4" />}Гэрээ автомат холбох
                    </Button>
                }
            />

            {loading ? (
                <Card><div className="flex items-center justify-center py-16"><Spinner size="lg" /></div></Card>
            ) : (
                <>
                    <StatBar columns={4}>
                        <StatTile label="Нийт орлого" value={formatMNT(totals.revenue)} icon={<Banknote className="w-5 h-5" />} accent="brand" />
                        <StatTile label="Нийт өртөг" value={formatMNT(totals.cost)} icon={<TrendingDown className="w-5 h-5" />} accent="warning" />
                        <StatTile label="Ашиг (margin)" value={formatMNT(totals.margin)} helper={totals.revenue > 0 ? `${Math.round((totals.margin / totals.revenue) * 100)}%` : '—'} icon={<TrendingUp className="w-5 h-5" />} accent={totals.margin >= 0 ? 'success' : 'danger'} />
                        <StatTile label="Нийт төсөв" value={formatMNT(totals.budget)} icon={<Target className="w-5 h-5" />} accent="info" />
                    </StatBar>

                    <Card>
                        <div className="p-5">
                            <h3 className="heading-section text-sm text-foreground mb-4">Төслийн P&L</h3>
                            {rows.length === 0 ? (
                                <p className="text-sm text-muted-foreground py-6 text-center">
                                    Өгөгдөл алга. Гэрээ/зардлыг төсөлд холбоно уу.
                                </p>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full">
                                        <thead className="border-b border-border">
                                            <tr className="text-left text-[11px] uppercase tracking-[0.08em] text-muted-foreground/80">
                                                <th className="py-2 pr-4">Төсөл</th>
                                                <th className="py-2 pr-4 text-right">Орлого</th>
                                                <th className="py-2 pr-4 text-right">Цугласан</th>
                                                <th className="py-2 pr-4 text-right">Өртөг</th>
                                                <th className="py-2 pr-4 text-right">Ашиг</th>
                                                <th className="py-2 pr-4 text-right">Төсөв</th>
                                                <th className="py-2 text-right">Зөрүү</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-border/60">
                                            {rows.map((r) => (
                                                <tr key={r.project_id || 'none'} className="text-sm">
                                                    <td className="py-3 pr-4 font-medium text-foreground">{r.name}</td>
                                                    <td className="py-3 pr-4 text-right tabular-nums">{formatMNT(r.revenue)}</td>
                                                    <td className="py-3 pr-4 text-right tabular-nums text-muted-foreground">{formatMNT(r.collected)}</td>
                                                    <td className="py-3 pr-4 text-right tabular-nums">{formatMNT(r.cost)}</td>
                                                    <td className={`py-3 pr-4 text-right tabular-nums font-semibold ${r.margin >= 0 ? 'text-status-success' : 'text-status-danger'}`}>{formatMNT(r.margin)}</td>
                                                    <td className="py-3 pr-4 text-right tabular-nums text-muted-foreground">{r.budget > 0 ? formatMNT(r.budget) : '—'}</td>
                                                    <td className={`py-3 text-right tabular-nums ${r.budget > 0 ? (r.budgetVariance >= 0 ? 'text-status-success' : 'text-status-danger') : 'text-muted-foreground'}`}>
                                                        {r.budget > 0 ? formatMNT(r.budgetVariance) : '—'}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    </Card>
                </>
            )}

            {showBudget && (
                <div className="fixed inset-0 bg-foreground/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-surface rounded-xl border border-border w-full max-w-md shadow-xl">
                        <div className="flex items-center justify-between p-5 border-b border-border">
                            <h2 className="heading-section text-base text-foreground">Төсвийн мөр нэмэх</h2>
                            <button onClick={() => setShowBudget(false)} className="p-2 hover:bg-surface-2 rounded-md"><X className="w-5 h-5 text-muted-foreground" /></button>
                        </div>
                        <div className="p-5 space-y-4">
                            {error && (
                                <div className="p-3 bg-status-danger-soft border border-status-danger/30 rounded-lg text-status-danger text-sm flex items-center gap-2">
                                    <AlertCircle className="w-4 h-4" />{error}
                                </div>
                            )}
                            <div>
                                <label className="block text-sm font-medium text-foreground mb-1">Төсөл</label>
                                <select className="w-full px-3 py-2.5 border border-border-strong rounded-lg text-sm bg-surface" value={budgetForm.project_id} onChange={e => setBudgetForm(f => ({ ...f, project_id: e.target.value }))}>
                                    <option value="">— Сонгох —</option>
                                    {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-foreground mb-1">Ангилал (данс)</label>
                                <select className="w-full px-3 py-2.5 border border-border-strong rounded-lg text-sm bg-surface" value={budgetForm.account_id} onChange={e => setBudgetForm(f => ({ ...f, account_id: e.target.value }))}>
                                    <option value="">— Сонгох —</option>
                                    {accounts.filter(a => a.code >= '5000').map(a => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-foreground mb-1">Тайлбар</label>
                                <input className="w-full px-3 py-2.5 border border-border-strong rounded-lg text-sm" value={budgetForm.label} onChange={e => setBudgetForm(f => ({ ...f, label: e.target.value }))} placeholder="Жишээ: Материал" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-foreground mb-1">Төлөвлөсөн дүн (₮)</label>
                                <input type="number" className="w-full px-3 py-2.5 border border-border-strong rounded-lg text-sm" value={budgetForm.planned_amount} onChange={e => setBudgetForm(f => ({ ...f, planned_amount: e.target.value }))} placeholder="0" />
                            </div>
                        </div>
                        <div className="flex justify-end gap-3 p-5 border-t border-border">
                            <Button variant="secondary" size="sm" onClick={() => setShowBudget(false)}>Цуцлах</Button>
                            <Button variant="primary" size="sm" onClick={addBudget} isLoading={saving} disabled={saving}>Хадгалах</Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
