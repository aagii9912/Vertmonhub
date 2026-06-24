'use client';

import { useState, useEffect, useCallback } from 'react';
import { Building2, Plus, X, Trash2, MapPin, Layers, CreditCard, DollarSign, Facebook, Pencil } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/dashboard/PageHeader';

const SHOP_KEY = 'vertmonhub_active_shop_id';

interface Competitor {
    id: string;
    name: string;
    location?: string | null;
    district?: string | null;
    num_blocks?: number | null;
    planning?: string | null;
    payment_terms?: string | null;
    price_per_sqm?: number | null;
    facebook_url?: string | null;
    notes?: string | null;
    updated_at?: string;
}

function shopHeaders(): HeadersInit {
    return {
        'Content-Type': 'application/json',
        'x-shop-id': typeof window !== 'undefined' ? localStorage.getItem(SHOP_KEY) || '' : '',
    };
}
function formatMoney(n?: number | null): string {
    if (!n) return '—';
    return new Intl.NumberFormat('mn-MN').format(Math.round(n)) + '₮';
}

const EMPTY = { name: '', location: '', district: '', num_blocks: '', planning: '', payment_terms: '', price_per_sqm: '', facebook_url: '', notes: '' };

export default function CompetitorResearchPage() {
    const [competitors, setCompetitors] = useState<Competitor[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState<Record<string, string>>({ ...EMPTY });

    const fetchData = useCallback(async () => {
        try {
            setLoading(true);
            const res = await fetch('/api/dashboard/competitors', { headers: shopHeaders() });
            const data = await res.json();
            setCompetitors(data.competitors || []);
        } catch (e) {
            console.error('[Competitors] fetch error', e);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchData(); }, [fetchData]);

    function openNew() { setForm({ ...EMPTY }); setShowForm(true); }
    function openEdit(c: Competitor) {
        setForm({
            name: c.name, location: c.location || '', district: c.district || '',
            num_blocks: c.num_blocks?.toString() || '', planning: c.planning || '',
            payment_terms: c.payment_terms || '', price_per_sqm: c.price_per_sqm?.toString() || '',
            facebook_url: c.facebook_url || '', notes: c.notes || '',
        });
        setShowForm(true);
    }

    async function save() {
        if (!form.name.trim()) return;
        setSaving(true);
        try {
            const res = await fetch('/api/dashboard/competitors', { method: 'POST', headers: shopHeaders(), body: JSON.stringify(form) });
            if (res.ok) { setShowForm(false); fetchData(); }
        } catch (e) { console.error(e); } finally { setSaving(false); }
    }

    async function remove(id: string) {
        if (!confirm('Энэ өрсөлдөгчийг устгах уу?')) return;
        try {
            const res = await fetch(`/api/dashboard/competitors?id=${id}`, { method: 'DELETE', headers: shopHeaders() });
            if (res.ok) fetchData();
        } catch (e) { console.error(e); }
    }

    const MANDALA_PRICE = 4850000;
    const priced = competitors.filter((c) => c.price_per_sqm && c.price_per_sqm > 0);
    const avgComp = priced.length ? Math.round(priced.reduce((s, c) => s + (c.price_per_sqm || 0), 0) / priced.length) : 0;
    const position = avgComp ? (MANDALA_PRICE > avgComp * 1.05 ? { label: 'Дунджаас ДЭЭГҮҮР', tone: 'text-status-danger' } : MANDALA_PRICE < avgComp * 0.95 ? { label: 'Дунджаас ДООГУУР', tone: 'text-status-success' } : { label: 'ДУНДАЖ түвшинд', tone: 'text-status-info' }) : null;

    return (
        <div>
            <PageHeader
                eyebrow="Маркетинг"
                title="Өрсөлдөгчийн судалгаа"
                subtitle="Зах зээл дэх өрсөлдөгчдийн үнэ, байршил, блок, төлбөрийн нөхцөл"
                primaryAction={<Button onClick={openNew} variant="primary" size="md"><Plus className="w-4 h-4" /> Өрсөлдөгч нэмэх</Button>}
            />

            {/* Зах зээл дэх байршуулалт (Мандала vs өрсөлдөгчид) */}
            {avgComp > 0 && (
                <Card className="mb-5">
                    <CardContent className="p-4">
                        <h3 className="text-sm font-semibold text-foreground mb-3">📊 Зах зээл дэх байршуулалт</h3>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                            <div className="p-3 rounded-lg bg-brand-soft">
                                <div className="text-[11px] text-muted-foreground">Мандала Гарден (м.кв)</div>
                                <div className="text-xl font-semibold text-brand-strong tabular-nums">{formatMoney(MANDALA_PRICE)}</div>
                            </div>
                            <div className="p-3 rounded-lg bg-surface-2/50">
                                <div className="text-[11px] text-muted-foreground">Өрсөлдөгчдийн дундаж</div>
                                <div className="text-xl font-semibold text-foreground tabular-nums">{formatMoney(avgComp)}</div>
                            </div>
                            <div className="p-3 rounded-lg bg-surface-2/50">
                                <div className="text-[11px] text-muted-foreground">Байр суурь ({priced.length} өрсөлдөгч)</div>
                                <div className={`text-lg font-semibold ${position?.tone}`}>{position?.label}</div>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}

            {loading ? (
                <div className="flex items-center justify-center py-24"><Spinner size="lg" /></div>
            ) : competitors.length === 0 ? (
                <Card><CardContent className="py-12">
                    <EmptyState
                        icon={<Building2 className="w-7 h-7" />}
                        title="Өрсөлдөгч бүртгээгүй"
                        description="Зах зээлийн өрсөлдөгчдийн мэдээллийг нэмж, Мандала Гардены байр сууриа тодорхойлоорой."
                        action={<Button onClick={openNew} variant="primary" size="sm"><Plus className="w-4 h-4" /> Эхний өрсөлдөгчийг нэмэх</Button>}
                    />
                </CardContent></Card>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {competitors.map((c) => (
                        <Card key={c.id}>
                            <CardContent className="p-4">
                                <div className="flex items-start justify-between mb-3">
                                    <div className="flex items-center gap-2">
                                        <div className="w-9 h-9 rounded-lg bg-brand-soft flex items-center justify-center text-brand-strong"><Building2 className="w-4.5 h-4.5" /></div>
                                        <div>
                                            <div className="font-semibold text-foreground leading-tight">{c.name}</div>
                                            {c.district && <div className="text-[11px] text-muted-foreground">{c.district}</div>}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <button onClick={() => openEdit(c)} className="p-1.5 rounded-md text-muted-foreground hover:bg-surface-2 hover:text-foreground"><Pencil className="w-3.5 h-3.5" /></button>
                                        <button onClick={() => remove(c.id)} className="p-1.5 rounded-md text-muted-foreground hover:bg-status-danger-soft hover:text-status-danger"><Trash2 className="w-3.5 h-3.5" /></button>
                                    </div>
                                </div>
                                <div className="space-y-1.5 text-sm">
                                    <Row icon={<DollarSign className="w-3.5 h-3.5" />} label="М.кв үнэ" value={formatMoney(c.price_per_sqm)} highlight />
                                    <Row icon={<MapPin className="w-3.5 h-3.5" />} label="Байршил" value={c.location} />
                                    <Row icon={<Layers className="w-3.5 h-3.5" />} label="Блокын тоо" value={c.num_blocks?.toString()} />
                                    <Row icon={<Building2 className="w-3.5 h-3.5" />} label="Төлөвлөлт" value={c.planning} />
                                    <Row icon={<CreditCard className="w-3.5 h-3.5" />} label="Төлбөрийн нөхцөл" value={c.payment_terms} />
                                </div>
                                {c.notes && <p className="text-[12px] text-muted-foreground mt-3 pt-3 border-t border-border/50">{c.notes}</p>}
                                {c.facebook_url && (
                                    <a href={c.facebook_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-[12px] text-status-info mt-2 hover:underline">
                                        <Facebook className="w-3.5 h-3.5" /> Facebook хуудас
                                    </a>
                                )}
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}

            {/* Comparison vs Mandala hint */}
            {competitors.length > 0 && (
                <p className="text-[12px] text-muted-foreground mt-5">
                    💡 Мандала Гардены м.кв үнэ <strong className="text-foreground">4,850,000₮</strong> — дээрх өрсөлдөгчидтэй харьцуулж байр сууриа тодорхойлно уу.
                </p>
            )}

            {showForm && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setShowForm(false)}>
                    <div className="absolute inset-0 bg-foreground/40 backdrop-blur-sm" />
                    <div className="relative w-full max-w-lg bg-surface border border-border rounded-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                        <div className="sticky top-0 bg-surface border-b border-border px-5 py-4 flex items-center justify-between">
                            <h2 className="font-semibold text-foreground flex items-center gap-2"><Building2 className="w-5 h-5 text-brand-strong" /> Өрсөлдөгч</h2>
                            <button onClick={() => setShowForm(false)} className="p-1.5 hover:bg-surface-2 rounded-md text-muted-foreground"><X className="w-4 h-4" /></button>
                        </div>
                        <div className="p-5 grid grid-cols-2 gap-3">
                            <Field full label="Нэр *" name="name" form={form} setForm={setForm} placeholder="Жишээ: Skyline Residence" />
                            <Field label="Байршил" name="location" form={form} setForm={setForm} />
                            <Field label="Дүүрэг" name="district" form={form} setForm={setForm} />
                            <Field label="Блокын тоо" name="num_blocks" form={form} setForm={setForm} type="number" />
                            <Field label="М.кв үнэ (₮)" name="price_per_sqm" form={form} setForm={setForm} type="number" />
                            <Field label="Төлөвлөлт" name="planning" form={form} setForm={setForm} placeholder="2-3 өрөө..." />
                            <Field label="Төлбөрийн нөхцөл" name="payment_terms" form={form} setForm={setForm} placeholder="зээл/бэлэн..." />
                            <Field full label="Facebook хаяг" name="facebook_url" form={form} setForm={setForm} placeholder="https://facebook.com/..." />
                            <Field full label="Тэмдэглэл" name="notes" form={form} setForm={setForm} textarea />
                        </div>
                        <div className="sticky bottom-0 bg-surface border-t border-border px-5 py-4 flex justify-end gap-2">
                            <Button onClick={() => setShowForm(false)} variant="secondary" size="md">Цуцлах</Button>
                            <Button onClick={save} variant="primary" size="md" isLoading={saving} disabled={!form.name.trim()}>Хадгалах</Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function Row({ icon, label, value, highlight }: { icon: React.ReactNode; label: string; value?: string | null; highlight?: boolean }) {
    return (
        <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-muted-foreground text-[12px]">{icon}{label}</span>
            <span className={highlight ? 'font-semibold text-foreground tabular-nums' : 'text-foreground'}>{value || '—'}</span>
        </div>
    );
}

function Field({ label, name, form, setForm, placeholder, type, textarea, full }: {
    label: string; name: string; form: Record<string, string>; setForm: (f: (p: Record<string, string>) => Record<string, string>) => void;
    placeholder?: string; type?: string; textarea?: boolean; full?: boolean;
}) {
    const cls = 'w-full px-3 py-2 rounded-md border border-border bg-surface text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-brand';
    return (
        <div className={full ? 'col-span-2' : ''}>
            <label className="block text-[12px] font-medium text-muted-foreground mb-1">{label}</label>
            {textarea ? (
                <textarea className={cls} rows={2} value={form[name]} onChange={(e) => setForm((p) => ({ ...p, [name]: e.target.value }))} placeholder={placeholder} />
            ) : (
                <input className={cls} type={type || 'text'} value={form[name]} onChange={(e) => setForm((p) => ({ ...p, [name]: e.target.value }))} placeholder={placeholder} />
            )}
        </div>
    );
}
