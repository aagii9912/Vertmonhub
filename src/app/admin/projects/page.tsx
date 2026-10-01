'use client';

import { useCallback, useEffect, useState } from 'react';
import { Building2, Loader2, Pencil, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/Dialog';
import Link from 'next/link';

type ProjectStatus = 'active' | 'planned' | 'on_hold' | 'completed';
type Project = {
    id: string;
    shop_id: string;
    name: string;
    location: string | null;
    district: string | null;
    description: string | null;
    status: ProjectStatus;
    shops: { name: string } | null;
    counts?: { leads: number; units: number; contracts: number } | null;
};
type Unassigned = { shop_id: string; leads: number; units: number; contracts: number };
type Form = { shop_id: string; name: string; location: string; district: string; description: string; status: ProjectStatus };

const STATUS: Record<ProjectStatus, string> = {
    active: 'Идэвхтэй', planned: 'Төлөвлөсөн', on_hold: 'Түр зогссон', completed: 'Дууссан',
};
const emptyForm = (shopId = ''): Form => ({ shop_id: shopId, name: '', location: '', district: '', description: '', status: 'active' });

export default function AdminProjectsPage() {
    const [shops, setShops] = useState<Array<{ id: string; name: string }>>([]);
    const [projects, setProjects] = useState<Project[]>([]);
    const [unassigned, setUnassigned] = useState<Unassigned[]>([]);
    const [diagnosticsError, setDiagnosticsError] = useState<string | null>(null);
    const [filter, setFilter] = useState('all');
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [form, setForm] = useState<Form>(emptyForm());
    const [saving, setSaving] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setLoadError(null);
        try {
            const [shopRes, projectRes] = await Promise.all([fetch('/api/admin/shops'), fetch('/api/admin/projects')]);
            const [shopData, projectData] = await Promise.all([shopRes.json(), projectRes.json()]);
            if (!shopRes.ok || !projectRes.ok) throw new Error(shopData.error || projectData.error || 'Төслүүд ачаалагдсангүй');
            setShops(shopData.shops || []);
            setProjects(projectData.projects || []);
            setUnassigned(projectData.unassigned || []);
            setDiagnosticsError(projectData.diagnosticsError || null);
        } catch (error) {
            setLoadError(error instanceof Error ? error.message : 'Төслүүд ачаалагдсангүй');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { void load(); }, [load]);

    function openCreate() {
        setEditingId(null);
        setForm(emptyForm(shops.length === 1 ? shops[0].id : ''));
        setFormError(null);
        setDialogOpen(true);
    }

    function openEdit(project: Project) {
        setEditingId(project.id);
        setForm({
            shop_id: project.shop_id, name: project.name, location: project.location || '',
            district: project.district || '', description: project.description || '', status: project.status,
        });
        setFormError(null);
        setDialogOpen(true);
    }

    async function save(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!form.shop_id) { setFormError('Байгууллага сонгоно уу'); return; }
        setSaving(true);
        setFormError(null);
        try {
            const payload = editingId
                ? { name: form.name, location: form.location || null, district: form.district || null, description: form.description || null, status: form.status }
                : form;
            const response = await fetch(editingId ? `/api/admin/projects/${editingId}` : '/api/admin/projects', {
                method: editingId ? 'PATCH' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || 'Төсөл хадгалагдсангүй');
            setDialogOpen(false);
            toast.success(editingId ? 'Төсөл шинэчлэгдлээ' : 'Төсөл үүслээ');
            await load();
        } catch (error) {
            setFormError(error instanceof Error ? error.message : 'Төсөл хадгалагдсангүй');
        } finally {
            setSaving(false);
        }
    }

    const visible = filter === 'all' ? projects : projects.filter((project) => project.shop_id === filter);
    const unlinked = filter === 'all' ? unassigned : unassigned.filter((row) => row.shop_id === filter);

    return (
        <div className="mx-auto max-w-5xl space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 className="heading-display text-2xl text-foreground">Төслүүд</h1>
                    <p className="mt-1 text-sm text-muted-foreground">Байгууллага бүрийн төслийн мэдээллийг удирдана.</p>
                </div>
                <button onClick={openCreate} disabled={!shops.length} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-brand px-4 text-sm font-semibold text-brand-fg hover:bg-brand-strong disabled:opacity-50">
                    <Plus className="h-4 w-4" /> Шинэ төсөл
                </button>
            </div>

            {shops.length > 1 && (
                <div>
                    <label htmlFor="project-shop-filter" className="mb-1 block text-sm font-medium text-foreground">Байгууллага</label>
                    <select id="project-shop-filter" value={filter} onChange={(event) => setFilter(event.target.value)} className="min-h-11 w-full max-w-xs rounded-lg border border-border bg-surface px-3 text-sm text-foreground">
                        <option value="all">Бүх байгууллага</option>
                        {shops.map((shop) => <option key={shop.id} value={shop.id}>{shop.name}</option>)}
                    </select>
                </div>
            )}

            {diagnosticsError && <p role="alert" className="rounded-lg border border-status-danger/30 bg-status-danger-soft p-4 text-sm text-status-danger">{diagnosticsError}</p>}
            {!loading && !loadError && unlinked.length > 0 && <div className="rounded-xl border border-border bg-surface p-4 text-sm">
                <h2 className="font-semibold text-foreground">Төсөлд холбоогүй бүртгэл</h2>
                <p className="mt-1 text-muted-foreground">Эдгээр бүртгэл байгууллагад байна. Аль төсөлд хамаарахыг баталгаажуулж холбох хүртэл төслийн тайланд орохгүй.</p>
                {unlinked.map(row => <p key={row.shop_id} className="mt-2 text-foreground">{shops.find(shop => shop.id === row.shop_id)?.name || 'Байгууллага'}: лид {row.leads.toLocaleString()} · нэгж {row.units.toLocaleString()} · гэрээ {row.contracts.toLocaleString()}</p>)}
            </div>}

            {loading ? <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-brand" /></div>
                : loadError ? <div role="alert" className="rounded-lg border border-status-danger/30 bg-status-danger-soft p-4 text-sm text-status-danger">{loadError} <button onClick={load} className="ml-2 font-semibold underline">Дахин ачаалах</button></div>
                : visible.length === 0 ? <div className="rounded-xl border border-border bg-surface p-10 text-center text-sm text-muted-foreground">Төсөл бүртгэгдээгүй байна.</div>
                : <div className="grid gap-3 sm:grid-cols-2">
                    {visible.map((project) => (
                        <div key={project.id} className="rounded-xl border border-border bg-surface p-5">
                            <div className="flex items-start justify-between gap-3">
                                <div className="flex min-w-0 items-start gap-3">
                                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand-strong"><Building2 className="h-5 w-5" /></span>
                                    <div className="min-w-0">
                                        <h2 className="font-semibold text-foreground">{project.name}</h2>
                                        <p className="mt-1 text-sm text-muted-foreground">{project.shops?.name || shops.find((shop) => shop.id === project.shop_id)?.name || 'Байгууллага'}</p>
                                    </div>
                                </div>
                                <button onClick={() => openEdit(project)} aria-label={`${project.name} төслийг засах`} className="rounded-lg p-2 text-muted-foreground hover:bg-surface-2 hover:text-foreground"><Pencil className="h-4 w-4" /></button>
                            </div>
                            <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                <span className="rounded-full bg-brand-soft px-2.5 py-1 font-medium text-brand-strong">{STATUS[project.status] || project.status}</span>
                                {(project.district || project.location) && <span>{[project.district, project.location].filter(Boolean).join(' · ')}</span>}
                            </div>
                            {project.description && <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">{project.description}</p>}
                            {project.counts && <div className="mt-4 border-t border-border pt-3 text-sm">
                                <p className="text-xs text-muted-foreground">Төсөлд холбосон бүртгэл</p>
                                <p className="mt-1 text-foreground">Лид {project.counts.leads.toLocaleString()} · Нэгж {project.counts.units.toLocaleString()} · Гэрээ {project.counts.contracts.toLocaleString()}</p>
                                {!project.counts.units && !project.counts.contracts && <p className="mt-2 text-xs text-muted-foreground">Энэ төсөлд нэгж, гэрээ холбогдоогүй байна. Энэ нь эх мэдээлэл байхгүй гэсэн үг биш.</p>}
                            </div>}
                        </div>
                    ))}
                </div>}

            <div className="rounded-xl border border-border bg-surface p-4 text-sm text-muted-foreground">
                <p>Лид, гэрээний тоонд устгаагүй бүртгэлүүд орно. Нэгжийн тоонд нөөцийн сангийн бүх бүртгэл орно.</p>
                <p className="mt-2">ERP файл тусдаа түүхэн тайланд хадгалагдана. Файл хадгалах нь CRM-ийн нэгж, гэрээ болон мөнгөн орлогыг автоматаар бүртгэхгүй.</p>
                <Link href="/dashboard/reports/erp" className="mt-2 inline-flex min-h-11 items-center font-medium text-brand hover:underline">ERP тайлан харах →</Link>
            </div>

            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent className="max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>{editingId ? 'Төсөл засах' : 'Шинэ төсөл'}</DialogTitle>
                        <DialogDescription>Төслийн үндсэн мэдээлэл CRM болон тайланд ашиглагдана.</DialogDescription>
                    </DialogHeader>
                    <form onSubmit={save} className="space-y-4">
                        <div>
                            <label htmlFor="project-shop" className="mb-1 block text-sm font-medium">Байгууллага</label>
                            <select id="project-shop" value={form.shop_id} disabled={Boolean(editingId)} onChange={(event) => setForm({ ...form, shop_id: event.target.value })} required className="min-h-11 w-full rounded-lg border border-border bg-surface px-3 text-sm disabled:opacity-60">
                                <option value="">— Сонгох —</option>
                                {shops.map((shop) => <option key={shop.id} value={shop.id}>{shop.name}</option>)}
                            </select>
                        </div>
                        {([
                            ['name', 'Төслийн нэр', true], ['district', 'Дүүрэг', false], ['location', 'Байршил', false],
                        ] as const).map(([key, label, required]) => (
                            <div key={key}>
                                <label htmlFor={`project-${key}`} className="mb-1 block text-sm font-medium">{label}</label>
                                <input id={`project-${key}`} value={form[key]} required={required} maxLength={key === 'name' ? 160 : key === 'district' ? 120 : 200} onChange={(event) => setForm({ ...form, [key]: event.target.value })} className="min-h-11 w-full rounded-lg border border-border bg-surface px-3 text-sm" />
                            </div>
                        ))}
                        <div>
                            <label htmlFor="project-status" className="mb-1 block text-sm font-medium">Төлөв</label>
                            <select id="project-status" value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as ProjectStatus })} className="min-h-11 w-full rounded-lg border border-border bg-surface px-3 text-sm">
                                {Object.entries(STATUS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                            </select>
                        </div>
                        <div>
                            <label htmlFor="project-description" className="mb-1 block text-sm font-medium">Тайлбар</label>
                            <textarea id="project-description" value={form.description} maxLength={2000} onChange={(event) => setForm({ ...form, description: event.target.value })} className="min-h-24 w-full rounded-lg border border-border bg-surface p-3 text-sm" />
                        </div>
                        {formError && <p role="alert" className="text-sm text-status-danger">{formError}</p>}
                        <DialogFooter>
                            <button type="button" onClick={() => setDialogOpen(false)} className="min-h-11 rounded-lg border border-border px-4 text-sm">Цуцлах</button>
                            <button type="submit" disabled={saving} className="min-h-11 rounded-lg bg-brand px-4 text-sm font-semibold text-brand-fg disabled:opacity-50">{saving ? 'Хадгалж байна…' : 'Хадгалах'}</button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </div>
    );
}
