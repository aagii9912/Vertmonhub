'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, Loader2, Pencil, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { useAuth } from '@/contexts/AuthContext';
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
    members?: number;
    shares_shop?: boolean;
};
type Unassigned = { shop_id: string; leads: number; units: number; contracts: number };
type Staff = { id: string; email: string; full_name: string | null; role: string };
type Form = { name: string; location: string; district: string; description: string; status: ProjectStatus };
type Overview = { shops: Array<{ id: string; name: string }>; projects: Project[]; unassigned: Unassigned[]; diagnosticsError: string | null; staff: Staff[]; actorId: string | null };

const ROLE_LABEL: Record<string, string> = {
    super_admin: 'Super Admin', admin: 'Админ', marketing: 'Маркетинг', sales_manager: 'Борлуулалтын менежер', viewer: 'Харах эрх',
};
const STATUS: Record<ProjectStatus, string> = {
    active: 'Идэвхтэй', planned: 'Төлөвлөсөн', on_hold: 'Түр зогссон', completed: 'Дууссан',
};
/** Удирдлага, маркетинг бүх төслийг харна; борлуулалтын менежерийг төсөл бүрт тусад нь нэмнэ. */
const DEFAULT_ACCESS_ROLES = new Set(['super_admin', 'admin', 'marketing']);
const emptyForm = (): Form => ({ name: '', location: '', district: '', description: '', status: 'active' });
const NO_SHOPS: Overview['shops'] = [];
const NO_PROJECTS: Project[] = [];
const NO_UNASSIGNED: Unassigned[] = [];
const NO_STAFF: Staff[] = [];

async function fetchOverview(): Promise<Overview> {
    const [shopRes, projectRes, userRes] = await Promise.all([fetch('/api/admin/shops'), fetch('/api/admin/projects'), fetch('/api/admin/users')]);
    const [shopData, projectData, userData] = await Promise.all([shopRes.json(), projectRes.json(), userRes.json()]);
    if (!shopRes.ok || !projectRes.ok) throw new Error(shopData.error || projectData.error || 'Төслүүд ачаалагдсангүй');
    return {
        shops: shopData.shops || [],
        projects: projectData.projects || [],
        unassigned: projectData.unassigned || [],
        diagnosticsError: projectData.diagnosticsError || null,
        // Ажилтны жагсаалт уншигдаагүй ч төсөл үүсгэж болно (үүсгэгч өөрөө гишүүн болно).
        staff: userRes.ok ? userData.users || [] : [],
        actorId: userRes.ok ? userData.actor_id || null : null,
    };
}

export default function AdminProjectsPage() {
    const queryClient = useQueryClient();
    const { shop, user, refreshShops } = useAuth();
    const { data, error, isFetching, refetch } = useQuery({
        meta: { inlineError: true },
        queryKey: ['admin-projects', 'overview', shop?.id, user?.id, user?.role],
        queryFn: fetchOverview,
        enabled: !!user?.id,
        staleTime: 0,
        refetchOnWindowFocus: false,
    });
    const shops = data?.shops ?? NO_SHOPS;
    const projects = data?.projects ?? NO_PROJECTS;
    const unassigned = data?.unassigned ?? NO_UNASSIGNED;
    const diagnosticsError = data?.diagnosticsError ?? null;
    const staff = (data?.staff ?? NO_STAFF).filter(person => person.id !== data?.actorId);
    const loading = !data && isFetching;
    // Өгөгдөл харагдаж байхад дэвсгэрт шинэчлэл унавал (toast) жагсаалтыг нуухгүй.
    const loadError = error && !data ? error.message : null;
    const [dialogOpen, setDialogOpen] = useState(false);
    const [memberIds, setMemberIds] = useState<string[]>([]);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [form, setForm] = useState<Form>(emptyForm());
    const [saving, setSaving] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);

    function openCreate() {
        setEditingId(null);
        setForm(emptyForm());
        setMemberIds(staff.filter(person => DEFAULT_ACCESS_ROLES.has(person.role)).map(person => person.id));
        setFormError(null);
        setDialogOpen(true);
    }

    function openEdit(project: Project) {
        setEditingId(project.id);
        setForm({
            name: project.name, location: project.location || '',
            district: project.district || '', description: project.description || '', status: project.status,
        });
        setFormError(null);
        setDialogOpen(true);
    }

    async function save(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setSaving(true);
        setFormError(null);
        try {
            const payload = editingId
                ? { name: form.name, location: form.location || null, district: form.district || null, description: form.description || null, status: form.status }
                : { ...form, member_ids: memberIds };
            const response = await fetch(editingId ? `/api/admin/projects/${editingId}` : '/api/admin/projects', {
                method: editingId ? 'PATCH' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || 'Төсөл хадгалагдсангүй');
            setDialogOpen(false);
            toast.success(editingId ? 'Төсөл шинэчлэгдлээ' : 'Төсөл үүслээ');
            // Төслийн нэр, жагсаалт борлуулалтын төлөвлөгөөний хуудсанд ч харагдана.
            void queryClient.invalidateQueries({ queryKey: ['admin-sales-targets'] });
            // Шинэ төсөл (shop) төсөл солих цэсэнд шууд гарна.
            void refreshShops();
            await queryClient.invalidateQueries({ queryKey: ['admin-projects'] });
        } catch (error) {
            setFormError(error instanceof Error ? error.message : 'Төсөл хадгалагдсангүй');
        } finally {
            setSaving(false);
        }
    }

    const visible = projects;
    const unlinked = unassigned;

    return (
        <div className="mx-auto max-w-5xl space-y-6">
            <PageHeader
                title="Төслүүд"
                subtitle="Төсөл бүр өөрийн ажлын орчин, маркетинг, менежер, тайлантай. Төсөл дотор дэд төсөл үүсгэхгүй."
                primaryAction={<Button onClick={openCreate} disabled={loading}><Plus />Шинэ төсөл</Button>}
            />

            {diagnosticsError && <p role="alert" className="rounded-lg border border-status-danger/30 bg-status-danger-soft p-4 text-sm text-status-danger">{diagnosticsError}</p>}
            {!loading && !loadError && unlinked.length > 0 && <div className="rounded-xl border border-border bg-surface p-4 text-sm">
                <h2 className="font-semibold text-foreground">Төсөлд холбоогүй бүртгэл</h2>
                <p className="mt-1 text-muted-foreground">Эдгээр бүртгэл байгууллагад байна. Аль төсөлд хамаарахыг баталгаажуулж холбох хүртэл төслийн тайланд орохгүй.</p>
                {unlinked.map(row => <p key={row.shop_id} className="mt-2 text-foreground">{shops.find(shop => shop.id === row.shop_id)?.name || 'Төсөл'}: лид {row.leads.toLocaleString()} · нэгж {row.units.toLocaleString()} · гэрээ {row.contracts.toLocaleString()}</p>)}
            </div>}

            {loading ? <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-brand-strong" /></div>
                : loadError ? <div role="alert" className="rounded-lg border border-status-danger/30 bg-status-danger-soft p-4 text-sm text-status-danger">{loadError} <button onClick={() => void refetch()} className="ml-2 font-semibold underline">Дахин ачаалах</button></div>
                : visible.length === 0 ? <div className="rounded-xl border border-border bg-surface p-10 text-center text-sm text-muted-foreground">Төсөл бүртгэгдээгүй байна.</div>
                : <div className="grid gap-3 sm:grid-cols-2">
                    {visible.map((project) => (
                        <div key={project.id} className="rounded-xl border border-border bg-surface p-5">
                            <div className="flex items-start justify-between gap-3">
                                <div className="flex min-w-0 items-start gap-3">
                                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand-strong"><Building2 className="h-5 w-5" /></span>
                                    <div className="min-w-0">
                                        <h2 className="font-semibold text-foreground">{project.name}</h2>
                                        <p className="mt-1 text-sm text-muted-foreground">{project.members === undefined ? 'Ажлын орчин' : `${project.members} ажилтан хандана`}</p>
                                    </div>
                                </div>
                                <button onClick={() => openEdit(project)} aria-label={`${project.name} төслийг засах`} className="rounded-lg p-2 text-muted-foreground hover:bg-surface-2 hover:text-foreground"><Pencil className="h-4 w-4" /></button>
                            </div>
                            <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                <span className="rounded-full bg-brand-soft px-2.5 py-1 font-medium text-brand-strong">{STATUS[project.status] || project.status}</span>
                                {(project.district || project.location) && <span>{[project.district, project.location].filter(Boolean).join(' · ')}</span>}
                            </div>
                            {project.description && <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">{project.description}</p>}
                            {project.shares_shop && <p role="status" className="mt-3 rounded-lg bg-status-pending-soft px-3 py-2 text-xs text-status-pending">
                                Энэ төсөл «{project.shops?.name || 'хуучин'}» ажлын орчинд өөр төсөлтэй хамт байна. Тусдаа ажлын орчин руу салгах шаардлагатай.
                            </p>}
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
                <Link href="/dashboard/reports/erp" className="mt-2 inline-flex min-h-11 items-center font-medium text-brand-strong hover:underline">ERP тайлан харах →</Link>
            </div>

            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent className="max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>{editingId ? 'Төсөл засах' : 'Шинэ төсөл'}</DialogTitle>
                        <DialogDescription>Төслийн үндсэн мэдээлэл CRM болон тайланд ашиглагдана.</DialogDescription>
                    </DialogHeader>
                    <form onSubmit={save} className="space-y-4">
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
                        {!editingId && <fieldset>
                            <legend className="mb-1 block text-sm font-medium">Хандах ажилтнууд</legend>
                            <p className="mb-2 text-xs text-muted-foreground">Та автоматаар нэмэгдэнэ. Борлуулалтын менежерийг дараа нь «Хэрэглэгчид» эсвэл «Борлуулалтын төлөвлөгөө» хэсгээс нэмж болно.</p>
                            {staff.length ? <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-border p-2">
                                {staff.map(person => <label key={person.id} className="flex min-h-10 items-center gap-2 rounded-md px-2 text-sm hover:bg-surface-2">
                                    <input type="checkbox" checked={memberIds.includes(person.id)} onChange={event => setMemberIds(current => event.target.checked ? [...current, person.id] : current.filter(id => id !== person.id))} />
                                    <span className="min-w-0 flex-1 truncate">{person.full_name || person.email}</span>
                                    <span className="text-xs text-muted-foreground">{ROLE_LABEL[person.role] || person.role}</span>
                                </label>)}
                            </div> : <p className="text-xs text-muted-foreground">Ажилтны жагсаалт уншигдсангүй. Төслийг үүсгээд дараа нь ажилтан нэмнэ үү.</p>}
                        </fieldset>}
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
