'use client';

import { useState, useEffect, useCallback } from 'react';
import { Building2, Plus, Trash2, MapPin, Layers, CreditCard, DollarSign, Facebook, Pencil, BarChart3, ExternalLink } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { DataTable, Money, type DataTableColumn } from '@/components/ui/DataTable';
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetFooter,
    SheetTitle,
    SheetDescription,
} from '@/components/ui/Sheet';
import { cn } from '@/lib/utils';

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

    const columns: DataTableColumn<Competitor>[] = [
        {
            key: 'name',
            header: 'Өрсөлдөгч',
            sortable: true,
            accessor: (c) => c.name,
            cell: (c) => (
                <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-9 h-9 rounded-lg bg-brand-soft flex items-center justify-center text-brand-strong shrink-0"><Building2 className="w-4 h-4" /></div>
                    <div className="min-w-0">
                        <div className="font-medium text-foreground leading-tight truncate">{c.name}</div>
                        {c.district && <div className="text-xs text-muted-foreground truncate">{c.district}</div>}
                    </div>
                </div>
            ),
        },
        {
            key: 'price_per_sqm',
            header: 'М.кв үнэ',
            align: 'right',
            sortable: true,
            accessor: (c) => c.price_per_sqm ?? 0,
            cell: (c) => (
                c.price_per_sqm
                    ? <Money value={c.price_per_sqm} className="font-semibold text-foreground" />
                    : <span className="text-muted-foreground">—</span>
            ),
        },
        {
            key: 'location',
            header: 'Байршил',
            sortable: true,
            accessor: (c) => c.location ?? '',
            cell: (c) => (
                <span className="inline-flex items-center gap-1.5 text-sm text-foreground">
                    {c.location ? <><MapPin className="w-3.5 h-3.5 text-muted-foreground" />{c.location}</> : <span className="text-muted-foreground">—</span>}
                </span>
            ),
        },
        {
            key: 'num_blocks',
            header: 'Блок',
            align: 'center',
            sortable: true,
            accessor: (c) => c.num_blocks ?? 0,
            cell: (c) => (
                <span className="inline-flex items-center gap-1.5 text-sm text-foreground tabular-nums">
                    {c.num_blocks != null ? <><Layers className="w-3.5 h-3.5 text-muted-foreground" />{c.num_blocks}</> : <span className="text-muted-foreground">—</span>}
                </span>
            ),
        },
        {
            key: 'planning',
            header: 'Төлөвлөлт',
            accessor: (c) => c.planning ?? '',
            cell: (c) => <span className="text-sm text-foreground">{c.planning || '—'}</span>,
        },
        {
            key: 'payment_terms',
            header: 'Төлбөрийн нөхцөл',
            accessor: (c) => c.payment_terms ?? '',
            cell: (c) => (
                <span className="inline-flex items-center gap-1.5 text-sm text-foreground">
                    {c.payment_terms ? <><CreditCard className="w-3.5 h-3.5 text-muted-foreground" />{c.payment_terms}</> : <span className="text-muted-foreground">—</span>}
                </span>
            ),
        },
        {
            key: 'facebook',
            header: 'Facebook',
            cell: (c) => (
                c.facebook_url
                    ? (
                        <a href={c.facebook_url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-1.5 text-sm text-status-info hover:underline">
                            <Facebook className="w-3.5 h-3.5" /> Хуудас <ExternalLink className="w-3 h-3" />
                        </a>
                    )
                    : <span className="text-muted-foreground">—</span>
            ),
        },
        {
            key: 'actions',
            header: '',
            align: 'right',
            cell: (c) => (
                <div className="flex items-center justify-end gap-1">
                    <button onClick={(e) => { e.stopPropagation(); openEdit(c); }} className="p-1.5 rounded-md text-muted-foreground hover:bg-surface-2 hover:text-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background" aria-label="Засах"><Pencil className="w-3.5 h-3.5" /></button>
                    <button onClick={(e) => { e.stopPropagation(); remove(c.id); }} className="p-1.5 rounded-md text-muted-foreground hover:bg-status-danger-soft hover:text-status-danger outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background" aria-label="Устгах"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
            ),
        },
    ];

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
                        <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2"><BarChart3 className="w-4 h-4 text-brand-strong" /> Зах зээл дэх байршуулалт</h3>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                            <div className="p-3 rounded-lg bg-brand-soft">
                                <div className="text-2xs uppercase tracking-wide text-muted-foreground">Мандала Гарден (м.кв)</div>
                                <div className="heading-display text-xl text-brand-strong tabular-nums mt-1">{formatMoney(MANDALA_PRICE)}</div>
                            </div>
                            <div className="p-3 rounded-lg bg-surface-2/50">
                                <div className="text-2xs uppercase tracking-wide text-muted-foreground">Өрсөлдөгчдийн дундаж</div>
                                <div className="heading-display text-xl text-foreground tabular-nums mt-1">{formatMoney(avgComp)}</div>
                            </div>
                            <div className="p-3 rounded-lg bg-surface-2/50">
                                <div className="text-2xs uppercase tracking-wide text-muted-foreground">Байр суурь ({priced.length} өрсөлдөгч)</div>
                                <div className={cn('text-lg font-semibold mt-1', position?.tone)}>{position?.label}</div>
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
                <DataTable
                    columns={columns}
                    data={competitors}
                    getRowId={(c) => c.id}
                    caption="Өрсөлдөгчдийн судалгааны хүснэгт"
                />
            )}

            {/* Comparison vs Mandala hint */}
            {competitors.length > 0 && (
                <p className="inline-flex items-center gap-1.5 text-xs text-muted-foreground mt-5">
                    <DollarSign className="w-3.5 h-3.5 text-brand-strong shrink-0" />
                    Мандала Гардены м.кв үнэ <strong className="text-foreground">4,850,000₮</strong> — дээрх өрсөлдөгчидтэй харьцуулж байр сууриа тодорхойлно уу.
                </p>
            )}

            <Sheet open={showForm} onOpenChange={(open) => !open && setShowForm(false)}>
                <SheetContent side="right" className="sm:max-w-lg">
                    <SheetHeader>
                        <SheetTitle className="flex items-center gap-2"><Building2 className="w-5 h-5 text-brand-strong" /> Өрсөлдөгч</SheetTitle>
                        <SheetDescription>Зах зээлийн өрсөлдөгчийн мэдээлэл</SheetDescription>
                    </SheetHeader>

                    <div className="flex-1 overflow-y-auto px-6 py-4 grid grid-cols-2 gap-3">
                        <Field full label="Нэр" name="name" form={form} setForm={setForm} placeholder="Жишээ: Skyline Residence" required />
                        <Field label="Байршил" name="location" form={form} setForm={setForm} />
                        <Field label="Дүүрэг" name="district" form={form} setForm={setForm} />
                        <Field label="Блокын тоо" name="num_blocks" form={form} setForm={setForm} type="number" />
                        <Field label="М.кв үнэ (₮)" name="price_per_sqm" form={form} setForm={setForm} type="number" />
                        <Field label="Төлөвлөлт" name="planning" form={form} setForm={setForm} placeholder="2-3 өрөө..." />
                        <Field label="Төлбөрийн нөхцөл" name="payment_terms" form={form} setForm={setForm} placeholder="зээл/бэлэн..." />
                        <Field full label="Facebook хаяг" name="facebook_url" form={form} setForm={setForm} placeholder="https://facebook.com/..." />
                        <Field full label="Тэмдэглэл" name="notes" form={form} setForm={setForm} textarea />
                    </div>

                    <SheetFooter>
                        <Button onClick={() => setShowForm(false)} variant="secondary" size="md">Цуцлах</Button>
                        <Button onClick={save} variant="primary" size="md" isLoading={saving} disabled={!form.name.trim()}>Хадгалах</Button>
                    </SheetFooter>
                </SheetContent>
            </Sheet>
        </div>
    );
}

function Field({ label, name, form, setForm, placeholder, type, textarea, full, required }: {
    label: string; name: string; form: Record<string, string>; setForm: (f: (p: Record<string, string>) => Record<string, string>) => void;
    placeholder?: string; type?: string; textarea?: boolean; full?: boolean; required?: boolean;
}) {
    return (
        <FormField label={label} htmlFor={`competitor-${name}`} required={required} className={full ? 'col-span-2' : ''}>
            {textarea ? (
                <Textarea id={`competitor-${name}`} rows={2} value={form[name]} onChange={(e) => setForm((p) => ({ ...p, [name]: e.target.value }))} placeholder={placeholder} />
            ) : (
                <Input id={`competitor-${name}`} type={type || 'text'} value={form[name]} onChange={(e) => setForm((p) => ({ ...p, [name]: e.target.value }))} placeholder={placeholder} />
            )}
        </FormField>
    );
}
