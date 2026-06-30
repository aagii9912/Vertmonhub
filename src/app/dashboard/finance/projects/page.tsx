'use client';

import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { StatBar, StatTile } from '@/components/dashboard/StatBar';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { Money } from '@/components/ui/Money';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogFooter,
    DialogTitle,
} from '@/components/ui/Dialog';
import { FormField, FieldGroup } from '@/components/ui/FormField';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/Select';
import { Banknote, TrendingUp, TrendingDown, Target, Plus, AlertCircle, Link2 } from 'lucide-react';
import { cn } from '@/lib/utils';

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

    useEffect(() => { loadAll();   }, []);

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

    const columns: DataTableColumn<Pnl>[] = [
        {
            key: 'name',
            header: 'Төсөл',
            accessor: (r) => r.name,
            cell: (r) => <span className="font-medium text-foreground">{r.name}</span>,
        },
        {
            key: 'revenue',
            header: 'Орлого',
            align: 'right',
            accessor: (r) => r.revenue,
            cell: (r) => <Money value={r.revenue} compact />,
        },
        {
            key: 'collected',
            header: 'Цугласан',
            align: 'right',
            accessor: (r) => r.collected,
            cell: (r) => <Money value={r.collected} compact className="text-muted-foreground" />,
        },
        {
            key: 'cost',
            header: 'Өртөг',
            align: 'right',
            accessor: (r) => r.cost,
            cell: (r) => <Money value={r.cost} compact />,
        },
        {
            key: 'margin',
            header: 'Ашиг',
            align: 'right',
            accessor: (r) => r.margin,
            cell: (r) => (
                <Money
                    value={r.margin}
                    compact
                    className={cn('font-semibold', r.margin >= 0 ? 'text-status-success' : 'text-status-danger')}
                />
            ),
        },
        {
            key: 'budget',
            header: 'Төсөв',
            align: 'right',
            accessor: (r) => r.budget,
            cell: (r) =>
                r.budget > 0 ? (
                    <Money value={r.budget} compact className="text-muted-foreground" />
                ) : (
                    <span className="text-muted-foreground">—</span>
                ),
        },
        {
            key: 'budgetVariance',
            header: 'Зөрүү',
            align: 'right',
            accessor: (r) => r.budgetVariance,
            cell: (r) =>
                r.budget > 0 ? (
                    <Money
                        value={r.budgetVariance}
                        compact
                        className={r.budgetVariance >= 0 ? 'text-status-success' : 'text-status-danger'}
                    />
                ) : (
                    <span className="text-muted-foreground">—</span>
                ),
        },
    ];

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
                        <StatTile label="Нийт орлого" value={<Money value={totals.revenue} compact />} icon={<Banknote className="w-5 h-5" />} accent="brand" />
                        <StatTile label="Нийт өртөг" value={<Money value={totals.cost} compact />} icon={<TrendingDown className="w-5 h-5" />} accent="warning" />
                        <StatTile label="Ашиг (margin)" value={<Money value={totals.margin} compact />} helper={totals.revenue > 0 ? `${Math.round((totals.margin / totals.revenue) * 100)}%` : '—'} icon={<TrendingUp className="w-5 h-5" />} accent={totals.margin >= 0 ? 'success' : 'danger'} />
                        <StatTile label="Нийт төсөв" value={<Money value={totals.budget} compact />} icon={<Target className="w-5 h-5" />} accent="info" />
                    </StatBar>

                    <Card>
                        <div className="p-5">
                            <h3 className="heading-section text-sm text-foreground mb-4">Төслийн P&L</h3>
                            <DataTable
                                columns={columns}
                                data={rows}
                                getRowId={(r) => r.project_id || 'none'}
                                caption="Төслийн P&L"
                                emptyMessage="Өгөгдөл алга. Гэрээ/зардлыг төсөлд холбоно уу."
                                showDensityToggle={false}
                                hidePagination
                            />
                        </div>
                    </Card>
                </>
            )}

            <Dialog open={showBudget} onOpenChange={setShowBudget}>
                <DialogContent className="bg-surface sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="heading-section text-base text-foreground">Төсвийн мөр нэмэх</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                        {error && (
                            <div className="p-3 bg-status-danger-soft border border-status-danger/30 rounded-lg text-status-danger text-sm flex items-center gap-2">
                                <AlertCircle className="w-4 h-4" />{error}
                            </div>
                        )}
                        <FieldGroup>
                            <FormField label="Төсөл" htmlFor="budget-project">
                                <Select value={budgetForm.project_id} onValueChange={v => setBudgetForm(f => ({ ...f, project_id: v }))}>
                                    <SelectTrigger id="budget-project">
                                        <SelectValue placeholder="— Сонгох —" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </FormField>
                            <FormField label="Ангилал (данс)" htmlFor="budget-account">
                                <Select value={budgetForm.account_id} onValueChange={v => setBudgetForm(f => ({ ...f, account_id: v }))}>
                                    <SelectTrigger id="budget-account">
                                        <SelectValue placeholder="— Сонгох —" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {accounts.filter(a => a.code >= '5000').map(a => <SelectItem key={a.id} value={a.id}>{a.code} · {a.name}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </FormField>
                            <FormField label="Тайлбар" htmlFor="budget-label">
                                <input id="budget-label" className="w-full px-3 py-2.5 border border-border-strong rounded-lg text-sm" value={budgetForm.label} onChange={e => setBudgetForm(f => ({ ...f, label: e.target.value }))} placeholder="Жишээ: Материал" />
                            </FormField>
                            <FormField label="Төлөвлөсөн дүн (₮)" htmlFor="budget-amount">
                                <input id="budget-amount" type="number" className="w-full px-3 py-2.5 border border-border-strong rounded-lg text-sm" value={budgetForm.planned_amount} onChange={e => setBudgetForm(f => ({ ...f, planned_amount: e.target.value }))} placeholder="0" />
                            </FormField>
                        </FieldGroup>
                    </div>
                    <DialogFooter>
                        <Button variant="secondary" size="sm" onClick={() => setShowBudget(false)}>Цуцлах</Button>
                        <Button variant="primary" size="sm" onClick={addBudget} isLoading={saving} disabled={saving}>Хадгалах</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
