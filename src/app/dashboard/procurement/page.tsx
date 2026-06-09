'use client';

import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { StatBar, StatTile } from '@/components/dashboard/StatBar';
import { Building2, Wallet, AlertCircle, TrendingDown, Plus, X, Banknote } from 'lucide-react';

interface Summary { totalBills: number; totalPayable: number; outstanding: number; overdueAmount: number; monthSpend: number; }
interface Vendor { id: string; name: string; phone: string | null; }
interface Account { id: string; code: string; name: string; }
interface Project { id: string; name: string; }
interface Bill {
    id: string; bill_number: string | null; bill_date: string; due_date: string | null;
    total_amount: number; paid_amount: number; status: string;
    vendors?: { name: string } | null; projects?: { name: string } | null;
}

function formatMNT(n: number): string {
    if (Math.abs(n) >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B₮`;
    if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M₮`;
    return `${Math.round(n).toLocaleString()}₮`;
}

const STATUS: Record<string, { label: string; variant: 'success' | 'warning' | 'danger' | 'default' | 'info' }> = {
    draft: { label: 'Ноорог', variant: 'default' },
    pending: { label: 'Хүлээгдэж буй', variant: 'warning' },
    partial: { label: 'Хэсэгчилсэн', variant: 'info' },
    paid: { label: 'Төлсөн', variant: 'success' },
    cancelled: { label: 'Цуцалсан', variant: 'default' },
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
                            <StatTile label="Нийт өглөг" value={formatMNT(summary.totalPayable)} helper={`${summary.totalBills} нэхэмжлэх`} icon={<Banknote className="w-5 h-5" />} accent="brand" />
                            <StatTile label="Үлдэгдэл өглөг" value={formatMNT(summary.outstanding)} helper="Төлөгдөөгүй" icon={<Wallet className="w-5 h-5" />} accent="warning" />
                            <StatTile label="Хугацаа хэтэрсэн" value={formatMNT(summary.overdueAmount)} helper="Яаралтай төлөх" icon={<AlertCircle className="w-5 h-5" />} accent="danger" />
                            <StatTile label="Энэ сарын зарлага" value={formatMNT(summary.monthSpend)} helper="Бодит төлөлт" icon={<TrendingDown className="w-5 h-5" />} accent="info" />
                        </StatBar>
                    )}

                    <Card>
                        <div className="p-5">
                            <h3 className="heading-section text-sm text-foreground mb-4">Нэхэмжлэхүүд</h3>
                            {bills.length === 0 ? (
                                <p className="text-sm text-muted-foreground py-6 text-center">Нэхэмжлэх бүртгэгдээгүй байна</p>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full">
                                        <thead className="border-b border-border">
                                            <tr className="text-left text-[11px] uppercase tracking-[0.08em] text-muted-foreground/80">
                                                <th className="py-2 pr-4">Нийлүүлэгч</th>
                                                <th className="py-2 pr-4">Төсөл</th>
                                                <th className="py-2 pr-4">Дүн</th>
                                                <th className="py-2 pr-4">Үлдэгдэл</th>
                                                <th className="py-2 pr-4">Хугацаа</th>
                                                <th className="py-2 pr-4">Төлөв</th>
                                                <th className="py-2 text-right">Үйлдэл</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-border/60">
                                            {bills.map((b) => {
                                                const st = STATUS[b.status] || STATUS.pending;
                                                const outstanding = Number(b.total_amount) - Number(b.paid_amount);
                                                return (
                                                    <tr key={b.id} className="text-sm">
                                                        <td className="py-3 pr-4 font-medium text-foreground">{b.vendors?.name || '—'}</td>
                                                        <td className="py-3 pr-4 text-muted-foreground">{b.projects?.name || '—'}</td>
                                                        <td className="py-3 pr-4 tabular-nums">{formatMNT(Number(b.total_amount))}</td>
                                                        <td className="py-3 pr-4 tabular-nums">{formatMNT(outstanding)}</td>
                                                        <td className="py-3 pr-4 text-muted-foreground">{b.due_date || '—'}</td>
                                                        <td className="py-3 pr-4"><Badge variant={st.variant} size="sm">{st.label}</Badge></td>
                                                        <td className="py-3 text-right">
                                                            {b.status !== 'paid' && b.status !== 'cancelled' && (
                                                                <Button variant="secondary" size="sm" onClick={() => { setPayBill(b); setPayForm({ amount: String(outstanding), method: 'bank' }); setError(null); }}>
                                                                    Төлөх
                                                                </Button>
                                                            )}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            )}
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
            {showVendor && (
                <Modal title="Нийлүүлэгч нэмэх" onClose={() => setShowVendor(false)} error={error}
                    footer={<Button variant="primary" size="sm" onClick={addVendor} isLoading={saving} disabled={saving}>Хадгалах</Button>}>
                    <Field label="Нэр">
                        <input className="w-full px-3 py-2.5 border border-border-strong rounded-lg text-sm bg-surface" value={vendorForm.name} onChange={e => setVendorForm(f => ({ ...f, name: e.target.value }))} placeholder="Нийлүүлэгчийн нэр" />
                    </Field>
                    <Field label="Утас">
                        <input className="w-full px-3 py-2.5 border border-border-strong rounded-lg text-sm bg-surface" value={vendorForm.phone} onChange={e => setVendorForm(f => ({ ...f, phone: e.target.value }))} placeholder="99119911" />
                    </Field>
                </Modal>
            )}

            {/* Bill modal */}
            {showBill && (
                <Modal title="Нэхэмжлэх үүсгэх" onClose={() => setShowBill(false)} error={error}
                    footer={<Button variant="primary" size="sm" onClick={addBill} isLoading={saving} disabled={saving}>Хадгалах</Button>}>
                    <Field label="Нийлүүлэгч">
                        <select className="w-full px-3 py-2.5 border border-border-strong rounded-lg text-sm bg-surface" value={billForm.vendor_id} onChange={e => setBillForm(f => ({ ...f, vendor_id: e.target.value }))}>
                            <option value="">— Сонгох —</option>
                            {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                        </select>
                    </Field>
                    <Field label="Төсөл">
                        <select className="w-full px-3 py-2.5 border border-border-strong rounded-lg text-sm bg-surface" value={billForm.project_id} onChange={e => setBillForm(f => ({ ...f, project_id: e.target.value }))}>
                            <option value="">— Сонгох —</option>
                            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                    </Field>
                    <Field label="Зардлын данс">
                        <select className="w-full px-3 py-2.5 border border-border-strong rounded-lg text-sm bg-surface" value={billForm.account_id} onChange={e => setBillForm(f => ({ ...f, account_id: e.target.value }))}>
                            <option value="">— Сонгох —</option>
                            {accounts.filter(a => a.code >= '5000').map(a => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}
                        </select>
                    </Field>
                    <Field label="Тайлбар">
                        <input className="w-full px-3 py-2.5 border border-border-strong rounded-lg text-sm bg-surface" value={billForm.description} onChange={e => setBillForm(f => ({ ...f, description: e.target.value }))} placeholder="Барааны/үйлчилгээний тайлбар" />
                    </Field>
                    <div className="grid grid-cols-2 gap-3">
                        <Field label="Дүн (₮)">
                            <input type="number" className="w-full px-3 py-2.5 border border-border-strong rounded-lg text-sm bg-surface" value={billForm.amount} onChange={e => setBillForm(f => ({ ...f, amount: e.target.value }))} placeholder="0" />
                        </Field>
                        <Field label="НӨАТ (₮)">
                            <input type="number" className="w-full px-3 py-2.5 border border-border-strong rounded-lg text-sm bg-surface" value={billForm.vat_amount} onChange={e => setBillForm(f => ({ ...f, vat_amount: e.target.value }))} placeholder="0" />
                        </Field>
                    </div>
                    <Field label="Төлөх хугацаа">
                        <input type="date" className="w-full px-3 py-2.5 border border-border-strong rounded-lg text-sm bg-surface" value={billForm.due_date} onChange={e => setBillForm(f => ({ ...f, due_date: e.target.value }))} />
                    </Field>
                </Modal>
            )}

            {/* Pay modal */}
            {payBill && (
                <Modal title="Нэхэмжлэх төлөх" onClose={() => setPayBill(null)} error={error}
                    footer={<Button variant="primary" size="sm" onClick={submitPay} isLoading={saving} disabled={saving}>Төлөх</Button>}>
                    <Field label="Дүн (₮)">
                        <input type="number" className="w-full px-3 py-2.5 border border-border-strong rounded-lg text-sm bg-surface" value={payForm.amount} onChange={e => setPayForm(f => ({ ...f, amount: e.target.value }))} />
                    </Field>
                    <Field label="Хэлбэр">
                        <select className="w-full px-3 py-2.5 border border-border-strong rounded-lg text-sm bg-surface" value={payForm.method} onChange={e => setPayForm(f => ({ ...f, method: e.target.value }))}>
                            <option value="bank">Банк</option>
                            <option value="cash">Бэлэн</option>
                            <option value="barter">Бартер</option>
                        </select>
                    </Field>
                </Modal>
            )}
        </div>
    );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div>
            <label className="block text-sm font-medium text-foreground mb-1">{label}</label>
            {children}
        </div>
    );
}

function Modal({ title, onClose, error, children, footer }: {
    title: string; onClose: () => void; error: string | null; children: React.ReactNode; footer: React.ReactNode;
}) {
    return (
        <div className="fixed inset-0 bg-foreground/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-surface rounded-xl border border-border w-full max-w-md shadow-xl max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between p-5 border-b border-border">
                    <h2 className="heading-section text-base text-foreground">{title}</h2>
                    <button onClick={onClose} className="p-2 hover:bg-surface-2 rounded-md"><X className="w-5 h-5 text-muted-foreground" /></button>
                </div>
                <div className="p-5 space-y-4">
                    {error && (
                        <div className="p-3 bg-status-danger-soft border border-status-danger/30 rounded-lg text-status-danger text-sm flex items-center gap-2">
                            <AlertCircle className="w-4 h-4" />{error}
                        </div>
                    )}
                    {children}
                </div>
                <div className="flex justify-end gap-3 p-5 border-t border-border">
                    <Button variant="secondary" size="sm" onClick={onClose}>Цуцлах</Button>
                    {footer}
                </div>
            </div>
        </div>
    );
}
