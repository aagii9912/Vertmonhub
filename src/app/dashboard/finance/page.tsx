'use client';

import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { StatBar, StatTile } from '@/components/dashboard/StatBar';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { Money } from '@/components/ui/Money';
import { DateText } from '@/components/ui/DateText';
import { StatusPill } from '@/components/ui/StatusPill';
import { ChartCard } from '@/components/ui/ChartCard';
import { BarChart } from '@/components/charts/BarChart';
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
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
import {
    Wallet,
    TrendingUp,
    TrendingDown,
    Banknote,
    Plus,
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

    // Recent-transactions table columns — presentation only; data, ordering, and
    // amount math are unchanged from the original list rendering.
    const txnColumns: DataTableColumn<Txn>[] = [
        {
            key: 'note',
            header: 'Гүйлгээ',
            cell: (t) => (
                <div className="flex items-center gap-3">
                    <span
                        className={`w-8 h-8 rounded-full flex items-center justify-center ${
                            t.type === 'receipt'
                                ? 'bg-status-success-soft text-status-success'
                                : 'bg-status-danger-soft text-status-danger'
                        }`}
                    >
                        {t.type === 'receipt' ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                    </span>
                    <span className="text-sm font-medium text-foreground">
                        {t.note || (t.type === 'receipt' ? 'Орлого' : 'Зарлага')}
                    </span>
                </div>
            ),
        },
        {
            key: 'method',
            header: 'Хэлбэр',
            cell: (t) =>
                t.method ? (
                    <StatusPill variant="neutral">{METHOD_LABELS[t.method] || t.method}</StatusPill>
                ) : (
                    <span className="text-muted-foreground">—</span>
                ),
        },
        {
            key: 'txn_date',
            header: 'Огноо',
            cell: (t) => <DateText value={t.txn_date} className="text-sm text-muted-foreground" />,
        },
        {
            key: 'amount',
            header: 'Дүн',
            align: 'right',
            cell: (t) => (
                <span
                    className={`text-sm font-semibold tabular-nums ${
                        t.type === 'receipt' ? 'text-status-success' : 'text-status-danger'
                    }`}
                >
                    {t.type === 'receipt' ? '+' : '−'}
                    <Money value={Number(t.amount)} compact />
                </span>
            ),
        },
    ];

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

                    {/* AR Aging — same five buckets, rendered as a horizontal bar chart. */}
                    {aging && (
                        <ChartCard
                            title="Авлагын насжилт (AR aging)"
                            height={220}
                            className="mb-6"
                        >
                            <BarChart
                                data={[
                                    { bucket: 'Хугацаа болоогүй', value: aging.current },
                                    { bucket: '1–30 хоног', value: aging.d1_30 },
                                    { bucket: '31–60 хоног', value: aging.d31_60 },
                                    { bucket: '61–90 хоног', value: aging.d61_90 },
                                    { bucket: '90+ хоног', value: aging.d90_plus },
                                ]}
                                xKey="bucket"
                                series={[{ key: 'value', name: 'Авлага' }]}
                                horizontal
                                colorByPoint
                                valueFormatter={(v) => formatMNT(v)}
                            />
                        </ChartCard>
                    )}

                    {/* Recent transactions */}
                    <Card>
                        <div className="p-5">
                            <h3 className="heading-section text-sm text-foreground mb-4">Сүүлийн гүйлгээ</h3>
                            <DataTable<Txn>
                                columns={txnColumns}
                                data={transactions}
                                getRowId={(t) => t.id}
                                caption="Сүүлийн гүйлгээ"
                                emptyMessage="Гүйлгээ бүртгэгдээгүй байна"
                                showDensityToggle={false}
                                hidePagination
                            />
                        </div>
                    </Card>
                </>
            )}

            {/* Record transaction modal */}
            <Dialog open={showForm} onOpenChange={setShowForm}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Гүйлгээ бүртгэх</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
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
                        <FieldGroup>
                            <FormField label="Дүн (₮)" htmlFor="txn-amount">
                                <input
                                    id="txn-amount"
                                    type="number"
                                    value={form.amount}
                                    onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                                    className="w-full px-3 py-2.5 border border-border-strong rounded-lg text-sm"
                                    placeholder="0"
                                />
                            </FormField>
                            <FormField label="Хэлбэр" htmlFor="txn-method">
                                <Select
                                    value={form.method}
                                    onValueChange={(v) => setForm(f => ({ ...f, method: v }))}
                                >
                                    <SelectTrigger id="txn-method">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="cash">Бэлэн</SelectItem>
                                        <SelectItem value="bank">Банк</SelectItem>
                                        <SelectItem value="barter">Бартер</SelectItem>
                                        <SelectItem value="mortgage">Ипотек</SelectItem>
                                    </SelectContent>
                                </Select>
                            </FormField>
                            <FormField label="Данс" htmlFor="txn-account">
                                <Select
                                    value={form.account_id || '__none__'}
                                    onValueChange={(v) => setForm(f => ({ ...f, account_id: v === '__none__' ? '' : v }))}
                                >
                                    <SelectTrigger id="txn-account">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="__none__">— Данс сонгох —</SelectItem>
                                        {accounts.map(a => (
                                            <SelectItem key={a.id} value={a.id}>{a.code} · {a.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </FormField>
                            <FormField label="Тэмдэглэл" htmlFor="txn-note">
                                <input
                                    id="txn-note"
                                    type="text"
                                    value={form.note}
                                    onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
                                    className="w-full px-3 py-2.5 border border-border-strong rounded-lg text-sm"
                                    placeholder="Тайлбар"
                                />
                            </FormField>
                        </FieldGroup>
                    </div>
                    <DialogFooter>
                        <Button variant="secondary" size="sm" onClick={() => setShowForm(false)}>Цуцлах</Button>
                        <Button variant="primary" size="sm" onClick={submitTxn} isLoading={saving} disabled={saving}>
                            Хадгалах
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
