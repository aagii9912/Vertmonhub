'use client';

import { useState, useEffect, useCallback } from 'react';
import { Target, Loader2, Save, Trash2, Plus, TrendingUp, X } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/Select';
import { formatMNT } from '@/lib/utils/currency';

const MONTHS = ['1-р', '2-р', '3-р', '4-р', '5-р', '6-р', '7-р', '8-р', '9-р', '10-р', '11-р', '12-р'];

interface ManagerRow {
    sales_manager: string;
    user_id: string | null;
    targets: number[];
    actuals: number[];
    counts: number[];
}

interface TeamMember {
    id: string;
    full_name: string;
}

const sum = (arr: number[]) => arr.reduce((a, b) => a + (b || 0), 0);

export default function SalesTargetsAdminPage() {
    const [shops, setShops] = useState<Array<{ id: string; name: string }>>([]);
    const [shopId, setShopId] = useState('');
    const [year, setYear] = useState(new Date().getFullYear());
    const [managers, setManagers] = useState<ManagerRow[]>([]);
    const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
    const [loading, setLoading] = useState(false);

    const [editing, setEditing] = useState<ManagerRow | null>(null);
    const [saving, setSaving] = useState(false);
    const [newName, setNewName] = useState('');

    const nowYear = new Date().getFullYear();
    const yearOptions = [nowYear - 1, nowYear, nowYear + 1];

    // Shop жагсаалт
    useEffect(() => {
        (async () => {
            try {
                const res = await fetch('/api/admin/shops');
                const d = await res.json();
                const list = d.shops || [];
                setShops(list);
                if (list.length && !shopId) setShopId(list[0].id);
            } catch { /* ignore */ }
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const loadData = useCallback(async () => {
        if (!shopId) return;
        setLoading(true);
        setEditing(null);
        try {
            const res = await fetch(`/api/admin/sales-targets?shopId=${shopId}&year=${year}`);
            const d = await res.json();
            setManagers(d.managers || []);
            setTeamMembers(d.teamMembers || []);
        } catch {
            setManagers([]);
        } finally {
            setLoading(false);
        }
    }, [shopId, year]);

    useEffect(() => { loadData(); }, [loadData]);

    function startEdit(m: ManagerRow) {
        setEditing({ ...m, targets: [...m.targets] });
    }

    function startAdd(name: string, userId: string | null) {
        const trimmed = name.trim();
        if (!trimmed) return;
        const existing = managers.find((m) => m.sales_manager === trimmed);
        if (existing) { startEdit(existing); return; }
        setEditing({
            sales_manager: trimmed,
            user_id: userId,
            targets: Array(12).fill(0),
            actuals: Array(12).fill(0),
            counts: Array(12).fill(0),
        });
        setNewName('');
    }

    function setMonth(idx: number, value: string) {
        if (!editing) return;
        const targets = [...editing.targets];
        targets[idx] = Math.max(0, Number(value.replace(/[^0-9]/g, '')) || 0);
        setEditing({ ...editing, targets });
    }

    async function save() {
        if (!editing) return;
        setSaving(true);
        try {
            const res = await fetch('/api/admin/sales-targets', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    shopId,
                    year,
                    sales_manager: editing.sales_manager,
                    user_id: editing.user_id,
                    months: editing.targets,
                }),
            });
            if (res.ok) {
                await loadData();
            }
        } finally {
            setSaving(false);
        }
    }

    async function remove(name: string) {
        if (!confirm(`"${name}"-ийн ${year} оны төлөвлөгөөг устгах уу?`)) return;
        await fetch(`/api/admin/sales-targets?shopId=${shopId}&manager=${encodeURIComponent(name)}&year=${year}`, {
            method: 'DELETE',
        });
        await loadData();
    }

    // Төлөвлөгөө оруулаагүй багийн гишүүд (шинээр нэмэх сонголтод)
    const unlistedMembers = teamMembers.filter(
        (t) => !managers.some((m) => m.sales_manager === t.full_name || m.user_id === t.id),
    );

    return (
        <div className="space-y-6">
            {/* Гарчиг */}
            <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-soft">
                    <Target className="h-5 w-5 text-brand" />
                </div>
                <div>
                    <h1 className="text-xl font-semibold text-foreground">Борлуулалтын төлөвлөгөө</h1>
                    <p className="text-sm text-muted-foreground">
                        Менежер бүрийн сарын төлөвлөгөө (₮). Улирал/жил нь сарын нийлбэрээр бодогдоно.
                    </p>
                </div>
            </div>

            {/* Toolbar: Shop + Year */}
            <div className="flex flex-wrap items-center gap-3">
                <Select value={shopId} onValueChange={setShopId}>
                    <SelectTrigger className="h-9 w-56 text-sm" aria-label="Компани сонгох">
                        <SelectValue placeholder="Компани сонгох" />
                    </SelectTrigger>
                    <SelectContent>
                        {shops.map((s) => (
                            <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
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

            {loading ? (
                <div className="flex items-center justify-center py-16">
                    <Loader2 className="h-6 w-6 animate-spin text-brand" />
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                    {/* Менежерийн жагсаалт */}
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <h2 className="text-sm font-semibold text-foreground">Менежерүүд</h2>
                            <span className="text-xs text-muted-foreground">{managers.length} менежер</span>
                        </div>

                        {managers.length === 0 && (
                            <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">
                                Энэ компанид төлөвлөгөө оруулаагүй байна. Доороос менежер нэмнэ үү.
                            </CardContent></Card>
                        )}

                        {managers.map((m) => {
                            const yTarget = sum(m.targets);
                            const yActual = sum(m.actuals);
                            const p = yTarget > 0 ? Math.round((yActual / yTarget) * 100) : 0;
                            const isActive = editing?.sales_manager === m.sales_manager;
                            return (
                                <Card
                                    key={m.sales_manager}
                                    className={`cursor-pointer transition-colors ${isActive ? 'border-brand ring-1 ring-brand/40' : 'hover:border-border-strong'}`}
                                >
                                    <CardContent className="flex items-center justify-between gap-3 py-3">
                                        <button className="min-w-0 flex-1 text-left" onClick={() => startEdit(m)}>
                                            <p className="truncate text-sm font-medium text-foreground">{m.sales_manager}</p>
                                            <p className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                                                <span>Төлөвлөгөө: {yTarget > 0 ? formatMNT(yTarget, { compact: true }) : '—'}</span>
                                                {yTarget > 0 && (
                                                    <span className={`flex items-center gap-0.5 ${p >= 100 ? 'text-status-success' : ''}`}>
                                                        <TrendingUp className="h-3 w-3" /> {p}%
                                                    </span>
                                                )}
                                            </p>
                                        </button>
                                        <button
                                            onClick={() => remove(m.sales_manager)}
                                            className="rounded-md p-1.5 text-muted-foreground hover:bg-status-danger-soft hover:text-status-danger"
                                            title="Устгах"
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </button>
                                    </CardContent>
                                </Card>
                            );
                        })}

                        {/* Шинэ менежер нэмэх */}
                        <Card>
                            <CardContent className="space-y-2 py-3">
                                <p className="text-xs font-medium text-muted-foreground">Шинэ менежер нэмэх</p>
                                {unlistedMembers.length > 0 && (
                                    <div className="flex flex-wrap gap-1.5">
                                        {unlistedMembers.map((t) => (
                                            <button
                                                key={t.id}
                                                onClick={() => startAdd(t.full_name, t.id)}
                                                className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-2 px-2.5 py-1 text-xs text-foreground hover:border-brand hover:text-brand"
                                            >
                                                <Plus className="h-3 w-3" /> {t.full_name}
                                            </button>
                                        ))}
                                    </div>
                                )}
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        value={newName}
                                        onChange={(e) => setNewName(e.target.value)}
                                        onKeyDown={(e) => { if (e.key === 'Enter') startAdd(newName, null); }}
                                        placeholder="Менежерийн нэр бичих..."
                                        className="flex-1 rounded-md border border-border bg-surface-2 px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground/60 focus-visible:ring-[3px] focus-visible:ring-ring/40"
                                    />
                                    <Button onClick={() => startAdd(newName, null)} variant="secondary" size="sm" disabled={!newName.trim()}>
                                        <Plus className="h-4 w-4" /> Нэмэх
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Сарын төлөвлөгөө засварлагч */}
                    <div>
                        {editing ? (
                            <Card className="sticky top-4">
                                <CardContent className="space-y-4 py-4">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="text-sm font-semibold text-foreground">{editing.sales_manager}</p>
                                            <p className="text-xs text-muted-foreground">{year} оны сарын төлөвлөгөө (₮)</p>
                                        </div>
                                        <button onClick={() => setEditing(null)} className="rounded-md p-1.5 text-muted-foreground hover:bg-surface-2" title="Хаах">
                                            <X className="h-4 w-4" />
                                        </button>
                                    </div>

                                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                                        {editing.targets.map((val, i) => (
                                            <div key={i}>
                                                <label className="mb-1 block text-2xs text-muted-foreground">
                                                    {MONTHS[i]} сар
                                                    {editing.actuals[i] > 0 && (
                                                        <span className="ml-1 text-status-success">
                                                            ({formatMNT(editing.actuals[i], { compact: true })})
                                                        </span>
                                                    )}
                                                </label>
                                                <input
                                                    type="text"
                                                    inputMode="numeric"
                                                    value={val ? val.toLocaleString('en-US') : ''}
                                                    onChange={(e) => setMonth(i, e.target.value)}
                                                    placeholder="0"
                                                    className="w-full rounded-md border border-border bg-surface-2 px-2 py-1.5 text-right text-sm tabular-nums text-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40"
                                                />
                                            </div>
                                        ))}
                                    </div>

                                    {/* Нийлбэр */}
                                    <div className="flex items-center justify-between rounded-lg bg-surface-2 px-3 py-2.5">
                                        <span className="text-sm font-medium text-foreground">Жилийн нийт төлөвлөгөө</span>
                                        <span className="text-sm font-semibold text-brand tabular-nums">
                                            {formatMNT(sum(editing.targets))}
                                        </span>
                                    </div>

                                    <div className="flex justify-end gap-2">
                                        <Button onClick={() => setEditing(null)} variant="ghost" size="sm">Болих</Button>
                                        <Button onClick={save} isLoading={saving} variant="primary" size="sm">
                                            {!saving && <Save className="h-4 w-4" />} Хадгалах
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>
                        ) : (
                            <Card>
                                <CardContent className="flex flex-col items-center justify-center gap-2 py-16 text-center">
                                    <Target className="h-8 w-8 text-muted-foreground/40" />
                                    <p className="text-sm text-muted-foreground">
                                        Зүүн талаас менежер сонгож, сарын төлөвлөгөө оруулна уу
                                    </p>
                                </CardContent>
                            </Card>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
