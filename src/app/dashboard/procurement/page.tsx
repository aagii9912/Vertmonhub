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
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogFooter,
    DialogTitle,
} from '@/components/ui/Dialog';
import { FormField } from '@/components/ui/FormField';
import { Building2, Wallet, AlertCircle, TrendingDown, Plus, Banknote } from 'lucide-react';

interface Summary { totalBills: number; totalPayable: number; outstanding: number; overdueAmount: number; monthSpend: number; }
interface Vendor { id: string; name: string; phone: string | null; }
interface Account { id: string; code: string; name: string; }
interface Project { id: string; name: string; }
interface Bill {
    id: string; bill_number: string | null; bill_date: string; due_date: string | null;
    total_amount: number; paid_amount: number; status: string;
    vendors?: { name: string } | null; projects?: { name: string } | null;
}

const STATUS: Record<string, { label: string; variant: 'success' | 'danger' | 'pending' | 'info' | 'neutral' }> = {
    draft: { label: 'Ноорог', variant: 'neutral' },
    pending: { label: 'Хүлээгдэж буй', variant: 'pending' },
    partial: { label: 'Хэсэгчилсэн', variant: 'info' },
    paid: { label: 'Төлсөн', variant: 'success' },
    cancelled: { label: 'Цуцалсан', variant: 'neutral' },
};

export default function ProcurementPage() {
    const [summary, setSummary] = useState<Summary | null>(null);
    const [vendors, setVendors] = useState<Vendor[]>([]);
    const [bills, setBills] = useState<Bill[]>([]);
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [projects, setProjects] = useState<Project[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState(false);

    const [showVendor, setShowVendor] = useState(false);
    const [vendorForm, setVendorForm] = useState({ name: '', phone: '' });
    const [showBill, setShowBill] = useState(false);
    const [billForm, setBillForm] = useState({
        vendor_id: '', project_id: '', bill_number: '', due_date: '',
        description: '', account_id: '', amount: '', vat_amount: '',
    });
    const [payBill, setPayBill] = useState<Bill | null>(null);
    const [payForm, setPayForm] = useState({ amount: '', method: 'bank' });
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const headers = () => ({
        'Content-Type': 'application/json',
        'x-shop-id': localStorage.getItem('vertmonhub_active_shop_id') || '',
    });

    useEffect(() => { loadAll(); /* eslint-disable-next-line */ }, []);

    async function loadAll() {
        setLoading(true);
        setLoadError(false);
        try {
            // Primary data fetch — its failure marks the whole page as errored.
            const summaryRes = await fetch('/api/dashboard/procurement/summary', { headers: headers() });
            if (!summaryRes.ok) throw new Error('Худалдан авалтын мэдээлэл татаж чадсангүй');
            const s = await summaryRes.json();
            setSummary(s.summary || null);

            // Secondary / best-effort fetches — still check res.ok before parsing.
            const [v, b, ac, pr] = await Promise.all([
                fetch('/api/dashboard/procurement/vendors', { headers: headers() }),
                fetch('/api/dashboard/procurement/bills', { headers: headers() }),
                fetch('/api/dashboard/finance/accounts', { headers: headers() }),
                fetch('/api/dashboard/projects', { headers: headers() }),
            ]);
            setVendors(v.ok ? (await v.json()).vendors || [] : []);
            setBills(b.ok ? (await b.json()).bills || [] : []);
            setAccounts(ac.ok ? (await ac.json()).accounts || [] : []);
            setProjects(pr.ok ? (await pr.json()).projects || [] : []);
        } catch (e) {
            console.error(e);
            setLoadError(true);
        } finally {
            setLoading(false);
        }
    }

    async function addVendor() {
        if (!vendorForm.name.trim()) { setError('Нэр оруулна уу'); return; }
        setSaving(true); setError(null);
        try {
            const res = await fetch('/api/dashboard/procurement/vendors', {
                method: 'POST', headers: headers(), body: JSON.stringify(vendorForm),
            });
            if (!res.ok) throw new Error((await res.json())?.error || 'Алдаа');
            setShowVendor(false); setVendorForm({ name: '', phone: '' });
            await loadAll();
        } catch (e) { setError(e instanceof Error ? e.message : 'Алдаа'); } finally { setSaving(false); }
    }

    async function addBill() {
        const amount = parseFloat(billForm.amount);
        if (!amount || amount <= 0) { setError('Дүн оруулна уу'); return; }
        setSaving(true); setError(null);
        try {
            const res = await fetch('/api/dashboard/procurement/bills', {
                method: 'POST', headers: headers(),
                body: JSON.stringify({
                    vendor_id: billForm.vendor_id || null,
                    project_id: billForm.project_id || null,
                    bill_number: billForm.bill_number || null,
                    due_date: billForm.due_date || null,
                    vat_amount: billForm.vat_amount ? parseFloat(billForm.vat_amount) : 0,
                    lines: [{ description: billForm.description || null, account_id: billForm.account_id || null, amount }],
                }),
            });
            if (!res.ok) throw new Error((await res.json())?.error || 'Алдаа');
            setShowBill(false);
            setBillForm({ vendor_id: '', project_id: '', bill_number: '', due_date: '', description: '', account_id: '', amount: '', vat_amount: '' });
            await loadAll();
        } catch (e) { setError(e instanceof Error ? e.message : 'Алдаа'); } finally { setSaving(false); }
    }

    async function submitPay() {
        if (!payBill) return;
        const amount = parseFloat(payForm.amount);
        if (!amount || amount <= 0) { setError('Дүн оруулна уу'); return; }
        setSaving(true); setError(null);
        try {
            const res = await fetch(`/api/dashboard/procurement/bills/${payBill.id}/pay`, {
                method: 'POST', headers: headers(),
                body: JSON.stringify({ amount, method: payForm.method }),
            });
            if (!res.ok) throw new Error((await res.json())?.error || 'Алдаа');
            setPayBill(null); setPayForm({ amount: '', method: 'bank' });
            await loadAll();
        } catch (e) { setError(e instanceof Error ? e.message : 'Алдаа'); } finally { setSaving(false); }
    }

    const billColumns: DataTableColumn<Bill>[] = [
        {
            key: 'vendor',
            header: 'Нийлүүлэгч',
            cell: (b) => <span className="font-medium text-foreground">{b.vendors?.name || '—'}</span>,
        },
        {
            key: 'project',
            header: 'Төсөл',
            cell: (b) => <span className="text-muted-foreground">{b.projects?.name || '—'}</span>,
        },
        {
            key: 'total',
            header: 'Дүн',
            cell: (b) => <Money value={Number(b.total_amount)} compact />,
        },
        {
            key: 'outstanding',
            header: 'Үлдэгдэл',
            cell: (b) => <Money value={Number(b.total_amount) - Number(b.paid_amount)} compact />,
        },
        {
            key: 'due',
            header: 'Хугацаа',
            cell: (b) => <DateText value={b.due_date} className="text-muted-foreground" />,
        },
        {
            key: 'status',
            header: 'Төлөв',
            cell: (b) => {
                const st = STATUS[b.status] || STATUS.pending;
                return <StatusPill variant={st.variant}>{st.label}</StatusPill>;
            },
        },
        {
            key: 'action',
            header: 'Үйлдэл',
            align: 'right',
            cell: (b) => {
                const outstanding = Number(b.total_amount) - Number(b.paid_amount);
                return b.status !== 'paid' && b.status !== 'cancelled' ? (
                    <Button variant="secondary" size="sm" onClick={() => { setPayBill(b); setPayForm({ amount: String(outstanding), method: 'bank' }); setError(null); }}>
                        Төлөх
                    </Button>
                ) : null;
            },
        },
    ];

    return (
        <div>
            <PageHeader
                eyebrow="ERP"
                title="Худалдан авалт & Зардал"
                subtitle="Нийлүүлэгч, нэхэмжлэх, өглөг"
                primaryAction={
                    <Button variant="primary" size="sm" onClick={() => { setShowBill(true); setError(null); }}>
                        <Plus className="w-4 h-4" />Нэхэмжлэх
                    </Button>
                }
                secondaryActions={
                    <Button variant="secondary" size="sm" onClick={() => { setShowVendor(true); setError(null); }}>
                        <Building2 className="w-4 h-4" />Нийлүүлэгч нэмэх
                    </Button>
                }
            />

            {loading ? (
                <Card><div className="flex items-center justify-center py-16"><Spinner size="lg" /></div></Card>
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
                            <StatTile label="Нийт өглөг" value={<Money value={summary.totalPayable} compact />} helper={`${summary.totalBills} нэхэмжлэх`} icon={<Banknote className="w-5 h-5" />} accent="brand" />
                            <StatTile label="Үлдэгдэл өглөг" value={<Money value={summary.outstanding} compact />} helper="Төлөгдөөгүй" icon={<Wallet className="w-5 h-5" />} accent="warning" />
                            <StatTile label="Хугацаа хэтэрсэн" value={<Money value={summary.overdueAmount} compact />} helper="Яаралтай төлөх" icon={<AlertCircle className="w-5 h-5" />} accent="danger" />
                            <StatTile label="Энэ сарын зарлага" value={<Money value={summary.monthSpend} compact />} helper="Бодит төлөлт" icon={<TrendingDown className="w-5 h-5" />} accent="info" />
                        </StatBar>
                    )}

                    <Card>
                        <div className="p-5">
                            <h3 className="heading-section text-sm text-foreground mb-4">Нэхэмжлэхүүд</h3>
                            <DataTable
                                columns={billColumns}
                                data={bills}
                                getRowId={(b) => b.id}
                                caption="Нэхэмжлэхүүд"
                                emptyMessage="Нэхэмжлэх бүртгэгдээгүй байна"
                            />
                        </div>
                    </Card>

                    {vendors.length > 0 && (
                        <Card className="mt-6">
                            <div className="p-5">
                                <h3 className="heading-section text-sm text-foreground mb-3">Нийлүүлэгчид ({vendors.length})</h3>
                                <div className="flex flex-wrap gap-2">
                                    {vendors.map(v => (
                                        <span key={v.id} className="px-3 py-1.5 rounded-lg border border-border bg-surface-2/30 text-sm text-foreground">
                                            {v.name}{v.phone ? ` · ${v.phone}` : ''}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        </Card>
                    )}
                </>
            )}

            {/* Vendor modal */}
            <Dialog open={showVendor} onOpenChange={(o) => { if (!o) setShowVendor(false); }}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Нийлүүлэгч нэмэх</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                        {error && (
                            <div className="p-3 bg-status-danger-soft border border-status-danger/30 rounded-lg text-status-danger text-sm flex items-center gap-2">
                                <AlertCircle className="w-4 h-4" />{error}
                            </div>
                        )}
                        <FormField label="Нэр" htmlFor="vendor-name">
                            <input id="vendor-name" className="w-full px-3 py-2.5 border border-border-strong rounded-lg text-sm bg-surface" value={vendorForm.name} onChange={e => setVendorForm(f => ({ ...f, name: e.target.value }))} placeholder="Нийлүүлэгчийн нэр" />
                        </FormField>
                        <FormField label="Утас" htmlFor="vendor-phone">
                            <input id="vendor-phone" className="w-full px-3 py-2.5 border border-border-strong rounded-lg text-sm bg-surface" value={vendorForm.phone} onChange={e => setVendorForm(f => ({ ...f, phone: e.target.value }))} placeholder="99119911" />
                        </FormField>
                    </div>
                    <DialogFooter>
                        <Button variant="secondary" size="sm" onClick={() => setShowVendor(false)}>Цуцлах</Button>
                        <Button variant="primary" size="sm" onClick={addVendor} isLoading={saving} disabled={saving}>Хадгалах</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Bill modal */}
            <Dialog open={showBill} onOpenChange={(o) => { if (!o) setShowBill(false); }}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Нэхэмжлэх үүсгэх</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                        {error && (
                            <div className="p-3 bg-status-danger-soft border border-status-danger/30 rounded-lg text-status-danger text-sm flex items-center gap-2">
                                <AlertCircle className="w-4 h-4" />{error}
                            </div>
                        )}
                        <FormField label="Нийлүүлэгч" htmlFor="bill-vendor">
                            <select id="bill-vendor" className="w-full px-3 py-2.5 border border-border-strong rounded-lg text-sm bg-surface" value={billForm.vendor_id} onChange={e => setBillForm(f => ({ ...f, vendor_id: e.target.value }))}>
                                <option value="">— Сонгох —</option>
                                {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                            </select>
                        </FormField>
                        <FormField label="Төсөл" htmlFor="bill-project">
                            <select id="bill-project" className="w-full px-3 py-2.5 border border-border-strong rounded-lg text-sm bg-surface" value={billForm.project_id} onChange={e => setBillForm(f => ({ ...f, project_id: e.target.value }))}>
                                <option value="">— Сонгох —</option>
                                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                            </select>
                        </FormField>
                        <FormField label="Зардлын данс" htmlFor="bill-account">
                            <select id="bill-account" className="w-full px-3 py-2.5 border border-border-strong rounded-lg text-sm bg-surface" value={billForm.account_id} onChange={e => setBillForm(f => ({ ...f, account_id: e.target.value }))}>
                                <option value="">— Сонгох —</option>
                                {accounts.filter(a => a.code >= '5000').map(a => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}
                            </select>
                        </FormField>
                        <FormField label="Тайлбар" htmlFor="bill-description">
                            <input id="bill-description" className="w-full px-3 py-2.5 border border-border-strong rounded-lg text-sm bg-surface" value={billForm.description} onChange={e => setBillForm(f => ({ ...f, description: e.target.value }))} placeholder="Барааны/үйлчилгээний тайлбар" />
                        </FormField>
                        <div className="grid grid-cols-2 gap-3">
                            <FormField label="Дүн (₮)" htmlFor="bill-amount">
                                <input id="bill-amount" type="number" className="w-full px-3 py-2.5 border border-border-strong rounded-lg text-sm bg-surface" value={billForm.amount} onChange={e => setBillForm(f => ({ ...f, amount: e.target.value }))} placeholder="0" />
                            </FormField>
                            <FormField label="НӨАТ (₮)" htmlFor="bill-vat">
                                <input id="bill-vat" type="number" className="w-full px-3 py-2.5 border border-border-strong rounded-lg text-sm bg-surface" value={billForm.vat_amount} onChange={e => setBillForm(f => ({ ...f, vat_amount: e.target.value }))} placeholder="0" />
                            </FormField>
                        </div>
                        <FormField label="Төлөх хугацаа" htmlFor="bill-due">
                            <input id="bill-due" type="date" className="w-full px-3 py-2.5 border border-border-strong rounded-lg text-sm bg-surface" value={billForm.due_date} onChange={e => setBillForm(f => ({ ...f, due_date: e.target.value }))} />
                        </FormField>
                    </div>
                    <DialogFooter>
                        <Button variant="secondary" size="sm" onClick={() => setShowBill(false)}>Цуцлах</Button>
                        <Button variant="primary" size="sm" onClick={addBill} isLoading={saving} disabled={saving}>Хадгалах</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Pay modal */}
            <Dialog open={!!payBill} onOpenChange={(o) => { if (!o) setPayBill(null); }}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Нэхэмжлэх төлөх</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                        {error && (
                            <div className="p-3 bg-status-danger-soft border border-status-danger/30 rounded-lg text-status-danger text-sm flex items-center gap-2">
                                <AlertCircle className="w-4 h-4" />{error}
                            </div>
                        )}
                        <FormField label="Дүн (₮)" htmlFor="pay-amount">
                            <input id="pay-amount" type="number" className="w-full px-3 py-2.5 border border-border-strong rounded-lg text-sm bg-surface" value={payForm.amount} onChange={e => setPayForm(f => ({ ...f, amount: e.target.value }))} />
                        </FormField>
                        <FormField label="Хэлбэр" htmlFor="pay-method">
                            <select id="pay-method" className="w-full px-3 py-2.5 border border-border-strong rounded-lg text-sm bg-surface" value={payForm.method} onChange={e => setPayForm(f => ({ ...f, method: e.target.value }))}>
                                <option value="bank">Банк</option>
                                <option value="cash">Бэлэн</option>
                                <option value="barter">Бартер</option>
                            </select>
                        </FormField>
                    </div>
                    <DialogFooter>
                        <Button variant="secondary" size="sm" onClick={() => setPayBill(null)}>Цуцлах</Button>
                        <Button variant="primary" size="sm" onClick={submitPay} isLoading={saving} disabled={saving}>Төлөх</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
