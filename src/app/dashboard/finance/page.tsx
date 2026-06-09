'use client';

import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { StatBar, StatTile } from '@/components/dashboard/StatBar';
import {
    Wallet,
    TrendingUp,
    TrendingDown,
    Banknote,
    Plus,
    X,
    AlertCircle,
} from 'lucide-react';
import { formatMNT as formatMNTShared } from '@/lib/utils/currency';

interface Summary {
    totalRevenue: number;
    totalCollected: number;
    totalReceivable: number;
    totalVat: number;
    collectionRate: number;
    monthReceipts: number;
    monthDisbursements: number;
    monthNetCash: number;
    contractCount: number;
}

interface Aging {
    current: number;
    d1_30: number;
    d31_60: number;
    d61_90: number;
    d90_plus: number;
    total: number;
}

interface Account { id: string; code: string; name: string; type: string; }

interface Txn {
    id: string;
    txn_date: string;
    type: 'receipt' | 'disbursement';
    amount: number;
    method: string | null;
    note: string | null;
}

function formatMNT(n: number): string {
    return formatMNTShared(n, { compact: true });
}

const METHOD_LABELS: Record<string, string> = {
    cash: 'Бэлэн', bank: 'Банк', barter: 'Бартер', mortgage: 'Ипотек',
};

export default function FinancePage() {
    const [summary, setSummary] = useState<Summary | null>(null);
    const [aging, setAging] = useState<Aging | null>(null);
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [transactions, setTransactions] = useState<Txn[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState(false);

    const [showForm, setShowForm] = useState(false);
    const [saving, setSaving] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);
    const [form, setForm] = useState({
        type: 'receipt' as 'receipt' | 'disbursement',
        amount: '',
        method: 'cash',
        account_id: '',
        note: '',
    });

    const headers = () => ({
        'Content-Type': 'application/json',
        'x-shop-id': localStorage.getItem('vertmonhub_active_shop_id') || '',
    });

    useEffect(() => {
        loadAll();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    async function loadAll() {
        setLoading(true);
        setLoadError(false);
        try {
            // Primary data fetch — its failure marks the whole page as errored.
            const summaryRes = await fetch('/api/dashboard/finance/summary', { headers: headers() });
            if (!summaryRes.ok) throw new Error('Санхүүгийн мэдээлэл татаж чадсангүй');
            const s = await summaryRes.json();
            setSummary(s.summary || null);

            // Secondary / best-effort fetches — still check res.ok before parsing.
            const [a, t, ac] = await Promise.all([
                fetch('/api/dashboard/finance/ar-aging', { headers: headers() }),
                fetch('/api/dashboard/finance/transactions?limit=20', { headers: headers() }),
                fetch('/api/dashboard/finance/accounts', { headers: headers() }),
            ]);
            setAging(a.ok ? (await a.json()).aging || null : null);
            setTransactions(t.ok ? (await t.json()).transactions || [] : []);
            setAccounts(ac.ok ? (await ac.json()).accounts || [] : []);
        } catch (e) {
            console.error('Failed to load finance data:', e);
            setLoadError(true);
        } finally {
            setLoading(false);
        }
    }

    async function submitTxn() {
        const amount = parseFloat(form.amount);
        if (!amount || amount <= 0) {
            setFormError('Дүн оруулна уу');
            return;
        }
        setSaving(true);
        setFormError(null);
        try {
            const res = await fetch('/api/dashboard/finance/transactions', {
                method: 'POST',
                headers: headers(),
                body: JSON.stringify({
                    type: form.type,
                    amount,
                    method: form.method,
                    account_id: form.account_id || null,
                    note: form.note || null,
                }),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err?.error || 'Алдаа гарлаа');
            }
            setShowForm(false);
            setForm({ type: 'receipt', amount: '', method: 'cash', account_id: '', note: '' });
            await loadAll();
        } catch (e) {
            setFormError(e instanceof Error ? e.message : 'Алдаа гарлаа');
        } finally {
            setSaving(false);
        }
    }

    return (
        <div>
            <PageHeader
                eyebrow="ERP"
                title="Санхүү"
                subtitle="Орлого, авлага, мөнгөн урсгал"
                primaryAction={
                    <Button variant="primary" size="sm" onClick={() => { setShowForm(true); setFormError(null); }}>
                        <Plus className="w-4 h-4" />
                        Гүйлгээ бүртгэх
                    </Button>
                }
            />

            {loading ? (
                <Card>
                    <div className="flex items-center justify-center py-16">
                        <Spinner size="lg" />
                    </div>
                </Card>
            ) : loadError ? (
                <Card>
                    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                        <AlertCircle className="w-8 h-8 text-status-danger" />
                        <p className="text-sm text-muted-foreground">Мэдээлэл татахад алдаа гарлаа</p>
                        <Button variant="secondary" size="sm" onClick={loadAll}>Дахин оролдох</Button>
                    </div>
                </Card>
            ) : (
                <>
                    {summary && (
                        <StatBar columns={4}>
                            <StatTile
                                label="Нийт орлого (гэрээ)"
                                value={formatMNT(summary.totalRevenue)}
                                helper={`${summary.contractCount} гэрээ · НӨАТ ${formatMNT(summary.totalVat)}`}
                                icon={<Banknote className="w-5 h-5" />}
                                accent="brand"
                            />
                            <StatTile
                                label="Цугласан"
                                value={formatMNT(summary.totalCollected)}
                                helper={`Цуглуулалт ${summary.collectionRate}%`}
                                icon={<TrendingUp className="w-5 h-5" />}
                                accent="success"
                            />
                            <StatTile
                                label="Авлага (үлдэгдэл)"
                                value={formatMNT(summary.totalReceivable)}
                                helper="Хүлээгдэж буй төлбөр"
                                icon={<Wallet className="w-5 h-5" />}
                                accent="warning"
                            />
                            <StatTile
                                label="Энэ сарын цэвэр урсгал"
                                value={formatMNT(summary.monthNetCash)}
                                helper={`Орлого ${formatMNT(summary.monthReceipts)} · Зарлага ${formatMNT(summary.monthDisbursements)}`}
                                icon={summary.monthNetCash >= 0 ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
                                accent={summary.monthNetCash >= 0 ? 'info' : 'danger'}
                            />
                        </StatBar>
                    )}

                    {/* AR Aging */}
                    {aging && (
                        <Card className="mb-6">
                            <div className="p-5">
                                <h3 className="heading-section text-sm text-foreground mb-4">Авлагын насжилт (AR aging)</h3>
                                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                                    {[
                                        { label: 'Хугацаа болоогүй', val: aging.current, accent: 'text-status-success' },
                                        { label: '1–30 хоног', val: aging.d1_30, accent: 'text-foreground' },
                                        { label: '31–60 хоног', val: aging.d31_60, accent: 'text-status-pending' },
                                        { label: '61–90 хоног', val: aging.d61_90, accent: 'text-status-pending' },
                                        { label: '90+ хоног', val: aging.d90_plus, accent: 'text-status-danger' },
                                    ].map((b) => (
                                        <div key={b.label} className="rounded-lg border border-border bg-surface-2/30 p-3">
                                            <p className="text-xs text-muted-foreground">{b.label}</p>
                                            <p className={`mt-1 text-lg font-semibold tabular-nums ${b.accent}`}>{formatMNT(b.val)}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </Card>
                    )}

                    {/* Recent transactions */}
                    <Card>
                        <div className="p-5">
                            <h3 className="heading-section text-sm text-foreground mb-4">Сүүлийн гүйлгээ</h3>
                            {transactions.length === 0 ? (
                                <p className="text-sm text-muted-foreground py-6 text-center">Гүйлгээ бүртгэгдээгүй байна</p>
                            ) : (
                                <div className="divide-y divide-border/60">
                                    {transactions.map((t) => (
                                        <div key={t.id} className="flex items-center justify-between py-3">
                                            <div className="flex items-center gap-3">
                                                <span className={`w-8 h-8 rounded-full flex items-center justify-center ${t.type === 'receipt' ? 'bg-status-success-soft text-status-success' : 'bg-status-danger-soft text-status-danger'}`}>
                                                    {t.type === 'receipt' ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                                                </span>
                                                <div>
                                                    <p className="text-sm font-medium text-foreground">{t.note || (t.type === 'receipt' ? 'Орлого' : 'Зарлага')}</p>
                                                    <p className="text-xs text-muted-foreground">
                                                        {t.txn_date}{t.method ? ` · ${METHOD_LABELS[t.method] || t.method}` : ''}
                                                    </p>
                                                </div>
                                            </div>
                                            <span className={`text-sm font-semibold tabular-nums ${t.type === 'receipt' ? 'text-status-success' : 'text-status-danger'}`}>
                                                {t.type === 'receipt' ? '+' : '−'}{formatMNT(Number(t.amount))}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </Card>
                </>
            )}

            {/* Record transaction modal */}
            {showForm && (
                <div className="fixed inset-0 bg-foreground/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-surface rounded-xl border border-border w-full max-w-md shadow-xl">
                        <div className="flex items-center justify-between p-5 border-b border-border">
                            <h2 className="heading-section text-base text-foreground">Гүйлгээ бүртгэх</h2>
                            <button onClick={() => setShowForm(false)} className="p-2 hover:bg-surface-2 rounded-md">
                                <X className="w-5 h-5 text-muted-foreground" />
                            </button>
                        </div>
                        <div className="p-5 space-y-4">
                            {formError && (
                                <div className="p-3 bg-status-danger-soft border border-status-danger/30 rounded-lg text-status-danger text-sm flex items-center gap-2">
                                    <AlertCircle className="w-4 h-4" />{formError}
                                </div>
                            )}
                            <div className="grid grid-cols-2 gap-2">
                                <button
                                    onClick={() => setForm(f => ({ ...f, type: 'receipt' }))}
                                    className={`px-3 py-2 rounded-lg text-sm font-medium border-2 ${form.type === 'receipt' ? 'border-status-success bg-status-success-soft text-status-success' : 'border-border text-muted-foreground'}`}
                                >Орлого</button>
                                <button
                                    onClick={() => setForm(f => ({ ...f, type: 'disbursement' }))}
                                    className={`px-3 py-2 rounded-lg text-sm font-medium border-2 ${form.type === 'disbursement' ? 'border-status-danger bg-status-danger-soft text-status-danger' : 'border-border text-muted-foreground'}`}
                                >Зарлага</button>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-foreground mb-1">Дүн (₮)</label>
                                <input
                                    type="number"
                                    value={form.amount}
                                    onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                                    className="w-full px-3 py-2.5 border border-border-strong rounded-lg text-sm"
                                    placeholder="0"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-foreground mb-1">Хэлбэр</label>
                                <select
                                    value={form.method}
                                    onChange={e => setForm(f => ({ ...f, method: e.target.value }))}
                                    className="w-full px-3 py-2.5 border border-border-strong rounded-lg text-sm bg-surface"
                                >
                                    <option value="cash">Бэлэн</option>
                                    <option value="bank">Банк</option>
                                    <option value="barter">Бартер</option>
                                    <option value="mortgage">Ипотек</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-foreground mb-1">Данс</label>
                                <select
                                    value={form.account_id}
                                    onChange={e => setForm(f => ({ ...f, account_id: e.target.value }))}
                                    className="w-full px-3 py-2.5 border border-border-strong rounded-lg text-sm bg-surface"
                                >
                                    <option value="">— Данс сонгох —</option>
                                    {accounts.map(a => (
                                        <option key={a.id} value={a.id}>{a.code} · {a.name}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-foreground mb-1">Тэмдэглэл</label>
                                <input
                                    type="text"
                                    value={form.note}
                                    onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
                                    className="w-full px-3 py-2.5 border border-border-strong rounded-lg text-sm"
                                    placeholder="Тайлбар"
                                />
                            </div>
                        </div>
                        <div className="flex justify-end gap-3 p-5 border-t border-border">
                            <Button variant="secondary" size="sm" onClick={() => setShowForm(false)}>Цуцлах</Button>
                            <Button variant="primary" size="sm" onClick={submitTxn} isLoading={saving} disabled={saving}>
                                Хадгалах
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
