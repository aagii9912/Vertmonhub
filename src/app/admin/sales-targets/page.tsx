'use client';

import { useState, useEffect, useCallback } from 'react';
import { Target, Loader2, Save, TrendingUp, Users, Check } from 'lucide-react';
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
    name: string;
    is_active: boolean;
    user_id: string | null;
    year_actual: number;
}

const sum = (arr: number[]) => arr.reduce((a, b) => a + (b || 0), 0);

export default function SalesTargetsAdminPage() {
    const [shops, setShops] = useState<Array<{ id: string; name: string }>>([]);
    const [shopId, setShopId] = useState('');
    const [year, setYear] = useState(new Date().getFullYear());

    const [teamTarget, setTeamTarget] = useState<number[]>(Array(12).fill(0));
    const [teamActual, setTeamActual] = useState<number[]>(Array(12).fill(0));
    const [managers, setManagers] = useState<ManagerRow[]>([]);

    const [loading, setLoading] = useState(false);
    const [savingTarget, setSavingTarget] = useState(false);
    const [savingRoster, setSavingRoster] = useState(false);

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
        try {
            const res = await fetch(`/api/admin/sales-targets?shopId=${shopId}&year=${year}`);
            const d = await res.json();
            setTeamTarget(d.teamTarget || Array(12).fill(0));
            setTeamActual(d.teamActual || Array(12).fill(0));
            setManagers(d.managers || []);
        } catch {
            setManagers([]);
        } finally {
            setLoading(false);
        }
    }, [shopId, year]);

    useEffect(() => { loadData(); }, [loadData]);

    function setMonth(idx: number, value: string) {
        const next = [...teamTarget];
        next[idx] = Math.max(0, Number(value.replace(/[^0-9]/g, '')) || 0);
        setTeamTarget(next);
    }

    async function saveTarget() {
        setSavingTarget(true);
        try {
            await fetch('/api/admin/sales-targets', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ shopId, year, months: teamTarget }),
            });
            await loadData();
        } finally {
            setSavingTarget(false);
        }
    }

    function toggleManager(name: string) {
        setManagers((prev) => prev.map((m) => (m.name === name ? { ...m, is_active: !m.is_active } : m)));
    }

    async function saveRoster() {
        setSavingRoster(true);
        try {
            await fetch('/api/admin/sales-targets', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    shopId,
                    managers: managers.map((m) => ({ name: m.name, is_active: m.is_active, user_id: m.user_id })),
                }),
            });
            await loadData();
        } finally {
            setSavingRoster(false);
        }
    }

    const yearTarget = sum(teamTarget);
    const yearActual = sum(teamActual);
    const yearP = yearTarget > 0 ? Math.round((yearActual / yearTarget) * 100) : 0;
    const activeCount = managers.filter((m) => m.is_active).length;

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
                        Багийн сарын төлөвлөгөө (₮) + идэвхтэй менежерүүд. Улирал/жил = сарын нийлбэр.
                    </p>
                </div>
            </div>

            {/* Toolbar */}
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
                    {/* A) Багийн сарын төлөвлөгөө */}
                    <Card>
                        <CardContent className="space-y-4 py-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm font-semibold text-foreground">Багийн сарын төлөвлөгөө</p>
                                    <p className="text-xs text-muted-foreground">{year} он · дүнг ₮-ээр оруулна</p>
                                </div>
                                <TrendingUp className="h-4 w-4 text-brand" />
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
                                <span className="text-sm font-semibold text-brand tabular-nums">{formatMNT(yearTarget)}</span>
                            </div>
                            {yearTarget > 0 && (
                                <div className="flex items-center justify-between text-xs text-muted-foreground">
                                    <span>Гүйцэтгэл: {formatMNT(yearActual, { compact: true })}</span>
                                    <span className={yearP >= 100 ? 'font-semibold text-status-success' : ''}>{yearP}%</span>
                                </div>
                            )}

                            <div className="flex justify-end">
                                <Button onClick={saveTarget} isLoading={savingTarget} variant="primary" size="sm">
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
                                        <Users className="h-4 w-4 text-brand" /> Идэвхтэй менежерүүд
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                        {activeCount}/{managers.length} идэвхтэй · багийн гүйцэтгэл эдгээрийн нийлбэр
                                    </p>
                                </div>
                            </div>

                            {managers.length === 0 ? (
                                <p className="py-8 text-center text-sm text-muted-foreground">
                                    Гэрээнд менежер бүртгэгдээгүй байна
                                </p>
                            ) : (
                                <div className="max-h-[22rem] space-y-1.5 overflow-y-auto">
                                    {managers.map((m) => (
                                        <button
                                            key={m.name}
                                            onClick={() => toggleManager(m.name)}
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
                                            <span className={`shrink-0 text-2xs font-medium ${m.is_active ? 'text-brand' : 'text-muted-foreground'}`}>
                                                {m.is_active ? 'Идэвхтэй' : 'Идэвхгүй'}
                                            </span>
                                        </button>
                                    ))}
                                </div>
                            )}

                            <div className="flex justify-end">
                                <Button onClick={saveRoster} isLoading={savingRoster} variant="secondary" size="sm" disabled={managers.length === 0}>
                                    {!savingRoster && <Save className="h-4 w-4" />} Идэвхтэй жагсаалт хадгалах
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}
        </div>
    );
}
