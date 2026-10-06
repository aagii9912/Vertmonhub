'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Loader2, Save, TrendingUp, Users, Check, Plus } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { PageHeader } from '@/components/dashboard/PageHeader';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/Select';
import { useAuth } from '@/contexts/AuthContext';
import { formatMNT } from '@/lib/utils/currency';

const ROLE_LABEL: Record<string, string> = { super_admin: 'Super Admin', admin: 'Админ', marketing: 'Маркетинг', viewer: 'Харах эрх' };
const MONTHS = ['1-р', '2-р', '3-р', '4-р', '5-р', '6-р', '7-р', '8-р', '9-р', '10-р', '11-р', '12-р'];
const NO_MONTHS: number[] = Array(12).fill(0);

interface ManagerRow {
    name: string;
    is_active: boolean;
    user_id: string | null;
    year_actual: number;
    project_ids: string[];
}

interface SalesTargetsData {
    teamTarget: number[];
    teamActual: number[];
    managers: ManagerRow[];
    teamMembers: Array<{ id: string; full_name: string; role?: string | null }>;
    projects: Array<{ id: string; name: string }>;
}

const NO_MANAGERS: ManagerRow[] = [];
const NO_TEAM_MEMBERS: SalesTargetsData['teamMembers'] = [];
const NO_PROJECTS: SalesTargetsData['projects'] = [];
const NO_SHOPS: Array<{ id: string; name: string }> = [];

const sum = (arr: number[]) => arr.reduce((a, b) => a + (b || 0), 0);

export default function SalesTargetsAdminPage() {
    const queryClient = useQueryClient();
    const { shop, user } = useAuth();
    const authScope = [shop?.id, user?.id, user?.role] as const;
    const [selectedShopId, setShopId] = useState('');
    const [year, setYear] = useState(new Date().getFullYear());

    // Хадгалаагүй засварууд — серверийн өгөгдлийн дээр давхарлана (null бол серверийнхийг харуулна).
    const [targetDraft, setTargetDraft] = useState<number[] | null>(null);
    const [managersDraft, setManagersDraft] = useState<ManagerRow[] | null>(null);
    const [newManagerName, setNewManagerName] = useState('');
    const [showInactive, setShowInactive] = useState(false);

    const [savingTarget, setSavingTarget] = useState(false);
    const [savingRoster, setSavingRoster] = useState(false);
    const saving = savingTarget || savingRoster;

    const nowYear = new Date().getFullYear();
    const yearOptions = [nowYear - 1, nowYear, nowYear + 1];

    // Shop жагсаалт
    const shopsQuery = useQuery({
        meta: { inlineError: true },
        queryKey: ['admin-shops', 'sales-targets', ...authScope],
        queryFn: async (): Promise<Array<{ id: string; name: string }>> => {
            const res = await fetch('/api/admin/shops');
            const d = await res.json();
            if (!res.ok) throw new Error(d.error || 'Төслүүд ачаалагдсангүй');
            return d.shops || [];
        },
        enabled: !!user?.id,
        staleTime: 0,
        refetchOnWindowFocus: false,
    });
    const shops = shopsQuery.data ?? NO_SHOPS;
    // Анхдагч нь одоо ажиллаж буй төсөл (shop = төсөл).
    const shopId = selectedShopId || (shops.some((s) => s.id === shop?.id) ? shop!.id : shops[0]?.id) || '';

    const targetsQuery = useQuery({
        meta: { inlineError: true },
        queryKey: ['admin-sales-targets', shopId, year, ...authScope],
        queryFn: async (): Promise<SalesTargetsData> => {
            const res = await fetch(`/api/admin/sales-targets?shopId=${shopId}&year=${year}`);
            const d = await res.json();
            if (!res.ok) throw new Error(d.error || 'Төлөвлөгөө ачаалагдсангүй');
            return {
                teamTarget: d.teamTarget || Array(12).fill(0),
                teamActual: d.teamActual || Array(12).fill(0),
                managers: (d.managers || []).map((manager: ManagerRow) => ({ ...manager, project_ids: manager.project_ids || [] })),
                teamMembers: d.teamMembers || [],
                projects: d.projects || [],
            };
        },
        enabled: !!user?.id && !!shopId,
        staleTime: 0,
        refetchOnWindowFocus: false,
    });
    const data = targetsQuery.data;

    // Компани эсвэл он солигдвол өмнөх хүрээний хадгалаагүй засварыг хаяна.
    const scopeKey = `${shopId}:${year}`;
    const [draftScope, setDraftScope] = useState(scopeKey);
    if (draftScope !== scopeKey) {
        setDraftScope(scopeKey);
        setTargetDraft(null);
        setManagersDraft(null);
    }

    const teamTarget = targetDraft ?? data?.teamTarget ?? NO_MONTHS;
    const teamActual = data?.teamActual ?? NO_MONTHS;
    const managers = managersDraft ?? data?.managers ?? NO_MANAGERS;
    const teamMembers = data?.teamMembers ?? NO_TEAM_MEMBERS;
    const projects = data?.projects ?? NO_PROJECTS;

    const shopsError = shopsQuery.data
        ? (shopsQuery.data.length ? null : 'Төсөл бүртгэгдээгүй байна')
        : shopsQuery.error?.message ?? null;
    // Өгөгдөл ачаалагдсан бол дэвсгэрт шинэчлэл унахад (toast) хадгалаагүй засварыг нуухгүй.
    const error = (!shopsQuery.isFetching && shopsError) || (!targetsQuery.data && !targetsQuery.isFetching && targetsQuery.error?.message) || null;
    const scopeReady = !!data && !error;

    function setMonth(idx: number, value: string) {
        const next = [...teamTarget];
        next[idx] = Math.max(0, Number(value.replace(/[^0-9]/g, '')) || 0);
        setTargetDraft(next);
    }

    async function saveTarget() {
        if (!scopeReady || saving) return;
        setSavingTarget(true);
        try {
            const res = await fetch('/api/admin/sales-targets', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ shopId, year, months: teamTarget }),
            });
            if (!res.ok) throw new Error((await res.json()).error || 'Төлөвлөгөө хадгалагдсангүй');
            await targetsQuery.refetch();
            setTargetDraft(null);
            toast.success('Төлөвлөгөө хадгалагдлаа');
        } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : 'Төлөвлөгөө хадгалагдсангүй');
        } finally {
            setSavingTarget(false);
        }
    }

    function toggleManager(name: string) {
        if (!scopeReady || saving) return;
        setManagersDraft((prev) => (prev ?? managers).map((m) => (m.name === name ? { ...m, is_active: !m.is_active } : m)));
    }

    function toggleManagerProject(name: string, projectId: string) {
        if (!scopeReady || saving) return;
        setManagersDraft((prev) => (prev ?? managers).map((manager) => manager.name !== name ? manager : {
            ...manager,
            project_ids: manager.project_ids.includes(projectId)
                ? manager.project_ids.filter((id) => id !== projectId)
                : [...manager.project_ids, projectId],
        }));
    }

    function unlinkManager(name: string) {
        if (!scopeReady || saving) return;
        setManagersDraft((prev) => (prev ?? managers).map((m) => (m.name === name ? { ...m, user_id: null } : m)));
    }

    /** Зөвхөн өөрчлөгдсөн мөрийг илгээнэ — хуучирсан цонх бусдын холбоос, төлөвийг дарахгүй. */
    async function persistRoster(list: ManagerRow[]) {
        const saved = new Map((data?.managers ?? []).map((m) => [m.name, m]));
        const changed = list.filter((m) => {
            const before = saved.get(m.name);
            return !before || before.is_active !== m.is_active || before.user_id !== m.user_id
                || before.project_ids.length !== m.project_ids.length || before.project_ids.some((id) => !m.project_ids.includes(id));
        });
        if (!changed.length) { setManagersDraft(null); return; }
        const res = await fetch('/api/admin/sales-targets', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    shopId,
                    managers: changed.map((m) => ({ name: m.name, is_active: m.is_active, user_id: m.user_id, project_ids: m.project_ids })),
                }),
            });
        if (!res.ok) throw new Error((await res.json()).error || 'Менежерийн жагсаалт хадгалагдсангүй');
        await Promise.all([
                queryClient.invalidateQueries({ queryKey: ['managers', shopId] }),
                queryClient.invalidateQueries({ queryKey: ['director', shopId] }),
                queryClient.invalidateQueries({ queryKey: ['kpi-report', shopId] }),
                queryClient.invalidateQueries({ queryKey: ['my-stats', shopId] }),
                queryClient.invalidateQueries({ queryKey: ['lead-projects', shopId] }),
                queryClient.invalidateQueries({ queryKey: ['leads', 'list', shopId] }),
                queryClient.invalidateQueries({ queryKey: ['leads', 'summary', shopId] }),
        ]);
        await targetsQuery.refetch();
        setManagersDraft(null);
    }

    async function saveRoster() {
        if (!scopeReady || saving) return;
        setSavingRoster(true);
        try {
            await persistRoster(managers);
            toast.success('Менежерийн жагсаалт хадгалагдлаа');
        } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : 'Менежерийн жагсаалт хадгалагдсангүй');
        } finally {
            setSavingRoster(false);
        }
    }

    // Шинэ борлуулалтын менежер нэмэх (ростерт шингээж шууд хадгална)
    async function addManager(name: string, userId: string | null) {
        if (!scopeReady || saving) return;
        const trimmed = name.trim();
        if (!trimmed) return;
        // Хадгалаагүй өөрчлөлтийг нэмэлттэй хамт санамсаргүй хадгалахгүй.
        if (managersDraft) {
            toast.error('Хадгалаагүй өөрчлөлт байна. Эхлээд «Менежерийн бүртгэл хадгалах» дарна уу.');
            return;
        }
        const existing = managers.find((m) => m.name === trimmed);
        if (existing?.is_active && (!userId || existing.user_id === userId)) {
            setNewManagerName('');
            toast.info(`${trimmed} аль хэдийн идэвхтэй менежер байна`);
            return;
        }
        // Нэг төсөлтэй бол сервер тухайн төслийг автоматаар онооно.
        const next = existing
            ? managers.map((m) => (m.name === trimmed ? { ...m, is_active: true, user_id: userId ?? m.user_id } : m))
            : [
                ...managers,
                { name: trimmed, is_active: true, user_id: userId, year_actual: 0, project_ids: projects.length === 1 ? [projects[0].id] : [] },
            ].sort((a, b) => a.name.localeCompare(b.name, 'mn'));
        const previousDraft = managersDraft;
        setManagersDraft(next);
        setNewManagerName('');
        setSavingRoster(true);
        try {
            await persistRoster(next);
            toast.success(existing ? 'Менежер дахин идэвхжлээ' : 'Менежер нэмэгдлээ');
        } catch (cause) {
            setManagersDraft(previousDraft);
            setNewManagerName(trimmed);
            toast.error(cause instanceof Error ? cause.message : 'Менежер нэмэгдсэнгүй');
        } finally {
            setSavingRoster(false);
        }
    }

    const yearTarget = sum(teamTarget);
    const yearActual = sum(teamActual);
    const yearP = yearTarget > 0 ? Math.round((yearActual / yearTarget) * 100) : 0;
    const activeCount = managers.filter((m) => m.is_active).length;
    const visibleManagers = showInactive ? managers : managers.filter((m) => m.is_active);
    const inactiveCount = managers.length - activeCount;

    // Жагсаалтад ороогүй акаунттай гишүүд (шууд менежер болгож нэмэх)
    const unlistedMembers = teamMembers.filter(
        (t) => !managers.some((m) => m.name === t.full_name || (m.user_id && m.user_id === t.id)),
    );

    return (
        <div className="space-y-6">
            <PageHeader
                title="Борлуулалтын төлөвлөгөө"
                subtitle="Багийн сарын төлөвлөгөө (₮), идэвхтэй менежерүүд, төслийн харьяалал."
            />

            {/* Toolbar */}
            <div className="flex flex-wrap items-center gap-3">
                <Select value={shopId} onValueChange={setShopId} disabled={saving}>
                    <SelectTrigger className="h-9 w-56 text-sm" aria-label="Төсөл сонгох">
                        <SelectValue placeholder="Төсөл сонгох" />
                    </SelectTrigger>
                    <SelectContent>
                        {shops.map((s) => (
                            <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <Select value={String(year)} onValueChange={(v) => setYear(Number(v))} disabled={saving}>
                    <SelectTrigger className="h-9 w-28 text-sm" aria-label="Он сонгох">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {yearOptions.map((y) => (
                            <SelectItem key={y} value={String(y)}>{y} он</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            {error ? (
                <div role="alert" className="rounded-lg border border-status-danger/30 bg-status-danger-soft p-4 text-sm text-status-danger">
                    {error} <button onClick={() => void (shopsError ? shopsQuery.refetch() : targetsQuery.refetch())} className="ml-2 font-semibold underline">Дахин ачаалах</button>
                </div>
            ) : !scopeReady ? (
                <div className="flex items-center justify-center py-16">
                    <Loader2 className="h-6 w-6 animate-spin text-brand-strong" />
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                    {/* A) Багийн сарын төлөвлөгөө */}
                    <Card>
                        <CardContent className="space-y-4 py-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm font-semibold text-foreground">Багийн сарын төлөвлөгөө</p>
                                    <p className="text-xs text-muted-foreground">{year} он · дүнг ₮-ээр оруулна</p>
                                </div>
                                <TrendingUp className="h-4 w-4 text-brand-strong" />
                            </div>

                            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                                {teamTarget.map((val, i) => (
                                    <div key={i}>
                                        <label className="mb-1 block text-2xs text-muted-foreground">
                                            {MONTHS[i]} сар
                                            {teamActual[i] > 0 && (
                                                <span className="ml-1 text-status-success">
                                                    ({formatMNT(teamActual[i], { compact: true })})
                                                </span>
                                            )}
                                        </label>
                                        <input
                                            type="text"
                                            inputMode="numeric"
                                            disabled={savingTarget}
                                            value={val ? val.toLocaleString('en-US') : ''}
                                            onChange={(e) => setMonth(i, e.target.value)}
                                            placeholder="0"
                                            className="w-full rounded-md border border-border bg-surface-2 px-2 py-1.5 text-right text-sm tabular-nums text-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40"
                                        />
                                    </div>
                                ))}
                            </div>

                            <div className="flex items-center justify-between rounded-lg bg-surface-2 px-3 py-2.5">
                                <span className="text-sm font-medium text-foreground">Жилийн нийт төлөвлөгөө</span>
                                <span className="text-sm font-semibold text-brand-strong tabular-nums">{formatMNT(yearTarget)}</span>
                            </div>
                            {yearTarget > 0 && (
                                <div className="flex items-center justify-between text-xs text-muted-foreground">
                                    <span>Гүйцэтгэл: {formatMNT(yearActual, { compact: true })}</span>
                                    <span className={yearP >= 100 ? 'font-semibold text-status-success' : ''}>{yearP}%</span>
                                </div>
                            )}

                            <div className="flex justify-end">
                                <Button onClick={saveTarget} disabled={!scopeReady || saving} isLoading={savingTarget} variant="primary" size="sm">
                                    {!savingTarget && <Save className="h-4 w-4" />} Төлөвлөгөө хадгалах
                                </Button>
                            </div>
                        </CardContent>
                    </Card>

                    {/* B) Идэвхтэй менежерүүд */}
                    <Card>
                        <CardContent className="space-y-3 py-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                                        <Users className="h-4 w-4 text-brand-strong" /> Идэвхтэй менежерүүд
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                        {activeCount} идэвхтэй · багийн гүйцэтгэл эдгээрийн нийлбэр
                                    </p>
                                    <p className="mt-1 text-xs text-muted-foreground">
                                        {projects.length === 1
                                            ? `Энд нэмсэн менежер «${projects[0].name}» төслийн өөрт хуваарилсан лидийг хариуцна. Өөр төсөлд нэмэхдээ дээрээс төслөө сонгоно уу.`
                                            : 'Менежер зөвхөн сонгосон төслийн лидийг хариуцна. Нэг менежерт олон төсөл сонгож болно.'}
                                    </p>
                                </div>
                            </div>

                            {visibleManagers.length === 0 ? (
                                <p className="py-8 text-center text-sm text-muted-foreground">
                                    Идэвхтэй менежер байхгүй
                                </p>
                            ) : (
                                <div className="max-h-[32rem] space-y-2 overflow-y-auto">
                                    {visibleManagers.map((m) => (
                                        <div key={m.name} className="rounded-lg border border-border">
                                        <button
                                            type="button"
                                            aria-pressed={m.is_active}
                                            onClick={() => toggleManager(m.name)}
                                            disabled={!scopeReady || saving}
                                            className={`flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left transition-colors ${
                                                m.is_active
                                                    ? 'border-brand/40 bg-brand-soft/30'
                                                    : 'border-border bg-surface-2 opacity-60'
                                            }`}
                                        >
                                            <div className="flex min-w-0 items-center gap-2.5">
                                                <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${
                                                    m.is_active ? 'border-brand bg-brand text-brand-fg' : 'border-border bg-surface'
                                                }`}>
                                                    {m.is_active && <Check className="h-3.5 w-3.5" />}
                                                </span>
                                                <div className="min-w-0">
                                                    <p className="truncate text-sm font-medium text-foreground">{m.name}</p>
                                                    <p className="text-2xs text-muted-foreground">
                                                        {year} борлуулалт: {m.year_actual > 0 ? formatMNT(m.year_actual, { compact: true }) : '—'}
                                                        {m.user_id && ' · акаунттай'}
                                                    </p>
                                                </div>
                                            </div>
                                            <span className={`shrink-0 text-2xs font-medium ${m.is_active ? 'text-brand-strong' : 'text-muted-foreground'}`}>
                                                {m.is_active ? 'Идэвхтэй' : 'Идэвхгүй'}
                                            </span>
                                        </button>
                                        {m.user_id && <div className="flex justify-end px-3 pt-2">
                                            <button type="button" onClick={() => unlinkManager(m.name)} disabled={!scopeReady || saving}
                                                className="text-2xs font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline disabled:opacity-50">
                                                Акаунтын холбоос салгах
                                            </button>
                                        </div>}
                                        {projects.length !== 1 && <fieldset disabled={!scopeReady || saving} className="space-y-2 px-3 pb-3 pt-2">
                                            <legend className="sr-only">{m.name} — төслийн харьяалал</legend>
                                            <p className="text-2xs text-muted-foreground">
                                                {m.project_ids.length ? 'Төслийн харьяалал' : 'Төсөл сонгоогүй — төслийн лид хариуцах эрхгүй'}
                                            </p>
                                            {projects.length ? (
                                                <div className="flex flex-wrap gap-x-4 gap-y-2">
                                                    {projects.map((project) => (
                                                        <label key={project.id} className="inline-flex min-h-7 items-center gap-2 text-xs text-foreground">
                                                            <input
                                                                type="checkbox"
                                                                aria-label={`${m.name}: ${project.name}`}
                                                                checked={m.project_ids.includes(project.id)}
                                                                onChange={() => toggleManagerProject(m.name, project.id)}
                                                                className="h-4 w-4 accent-brand"
                                                            />
                                                            {project.name}
                                                        </label>
                                                    ))}
                                                </div>
                                            ) : <p className="text-xs text-muted-foreground">Энэ ажлын орчинд төсөл бүртгэгдээгүй байна.</p>}
                                        </fieldset>}
                                        </div>
                                    ))}
                                </div>
                            )}

                            {inactiveCount > 0 && (
                                <button
                                    type="button"
                                    aria-expanded={showInactive}
                                    onClick={() => setShowInactive((value) => !value)}
                                    className="text-xs font-medium text-muted-foreground hover:text-foreground"
                                >
                                    {showInactive ? 'Идэвхгүй менежерүүдийг нуух' : `Идэвхгүй менежерүүдийг харах (${inactiveCount})`}
                                </button>
                            )}

                            {/* Шинэ борлуулалтын менежер нэмэх */}
                            <div className="space-y-2 rounded-lg border border-dashed border-border p-3">
                                <p className="text-xs font-medium text-muted-foreground">Шинэ менежер нэмэх</p>
                                <p className="text-2xs text-muted-foreground">Акаунттай ажилтныг товчоор сонговол түүний акаунт холбогдоно. Энэ жагсаалтад гарахын тулд ажилтан энэ төсөлд гишүүн байх ёстой («Хэрэглэгчид» → төсөл нэмэх).</p>
                                {unlistedMembers.length > 0 && (
                                    <div className="flex flex-wrap gap-1.5">
                                        {unlistedMembers.map((t) => (
                                            <button
                                                key={t.id}
                                                onClick={() => addManager(t.full_name, t.id)}
                                                disabled={!scopeReady || saving}
                                                className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-2 px-2.5 py-1 text-xs text-foreground hover:border-brand hover:text-brand-strong disabled:opacity-50"
                                            >
                                                <Plus className="h-3 w-3" /> {t.full_name}
                                                {t.role && t.role !== 'sales_manager' && <span className="text-muted-foreground">· {ROLE_LABEL[t.role] || t.role}</span>}
                                            </button>
                                        ))}
                                    </div>
                                )}
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        disabled={savingRoster}
                                        value={newManagerName}
                                        onChange={(e) => setNewManagerName(e.target.value)}
                                        onKeyDown={(e) => { if (e.key === 'Enter') addManager(newManagerName, null); }}
                                        placeholder="Менежерийн нэр бичих..."
                                        className="flex-1 rounded-md border border-border bg-surface-2 px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground/60 focus-visible:ring-[3px] focus-visible:ring-ring/40"
                                    />
                                    <Button
                                        onClick={() => addManager(newManagerName, null)}
                                        isLoading={savingRoster}
                                        variant="secondary"
                                        size="sm"
                                        disabled={!newManagerName.trim() || !scopeReady || saving}
                                    >
                                        {!savingRoster && <Plus className="h-4 w-4" />} Нэмэх
                                    </Button>
                                </div>
                            </div>

                            {managers.length > 0 && (
                                <div className="flex justify-end">
                                    <Button onClick={saveRoster} disabled={!scopeReady || saving} isLoading={savingRoster} variant="secondary" size="sm">
                                        {!savingRoster && <Save className="h-4 w-4" />} Менежерийн бүртгэл хадгалах
                                    </Button>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>
            )}
        </div>
    );
}
