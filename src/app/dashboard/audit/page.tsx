'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/Card';
import { useAuth } from '@/contexts/AuthContext';
import {
    ShieldCheck, Loader2, Filter, AlertTriangle, CheckCircle2,
    XCircle, ChevronDown, ChevronRight, Search,
} from 'lucide-react';

interface AuditEntry {
    id: string;
    occurred_at: string;
    actor_id: string | null;
    actor_name: string | null;
    actor_role: string | null;
    source: string;
    entity: string;
    entity_id: string | null;
    action: string;
    summary: string | null;
    before: Record<string, unknown> | null;
    after: Record<string, unknown> | null;
    request_ip: string | null;
    status: string;
    error_message: string | null;
}

const ENTITY_LABEL: Record<string, string> = {
    contract: 'Гэрээ', lead: 'Лийд', customer: 'Харилцагч', property: 'Үл хөдлөх',
    viewing: 'Уулзалт', unit: 'Нэгж', service_log: 'Үйлчилгээний хүсэлт',
    transaction: 'Санхүүгийн гүйлгээ', budget: 'Төсөв', bill: 'Нэхэмжлэх',
    vendor: 'Нийлүүлэгч', survey: 'Судалгаа', survey_response: 'Судалгааны хариулт',
    task: 'Ажил', role: 'Дүр', project: 'Төсөл', export: 'Экспорт', session: 'Нэвтрэлт',
    file: 'Файл', import: 'Импорт', shop: 'Төсөл', handover: 'Хүлээлгэн өгөх акт',
    marketing_channel: 'Маркетингийн суваг', channel_contract: 'Сувгийн гэрээ',
    spend_entry: 'Зарцуулалт', market_indicator: 'Зах зээлийн үзүүлэлт',
    competitor: 'Өрсөлдөгч', landing_content: 'Landing агуулга', ai_settings: 'AI тохиргоо',
    data_cleanup: 'Өгөгдөл цэвэрлэгээ', feedback: 'Санал', message: 'Мессеж',
    sales_target: 'Борлуулалтын төлөвлөгөө', project_mapping: 'Төслийн холболт',
    social_sync: 'Сошиал синк',
};

const ACTION_LABEL: Record<string, string> = {
    create: 'Үүсгэв', update: 'Шинэчлэв', delete: 'Устгав', export: 'Татав',
    login: 'Нэвтрэв', logout: 'Гарав', switch_shop: 'Төсөл сэлгэв',
    role_change: 'Дүр өөрчлөв', import: 'Импортлов', merge: 'Нэгтгэв',
    convert: 'Хөрвүүлэв', upload: 'Байршуулав', send: 'Илгээв', sync: 'Синк хийв',
};

const SOURCE_LABEL: Record<string, string> = {
    ui: 'UI', ai: 'AI', cron: 'Автомат', webhook: 'Webhook', import: 'Импорт', api: 'API',
};

export default function AuditPage() {
    const { shop } = useAuth();
    const [entries, setEntries] = useState<AuditEntry[]>([]);
    const [total, setTotal] = useState(0);
    const [available, setAvailable] = useState(true);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [expanded, setExpanded] = useState<Set<string>>(new Set());

    // Шүүлтүүр
    const [status, setStatus] = useState('');
    const [entity, setEntity] = useState('');
    const [q, setQ] = useState('');
    const [page, setPage] = useState(1);
    const pageSize = 50;

    const load = useCallback(async () => {
        if (!shop?.id) return;
        setLoading(true); setError(null);
        try {
            const sp = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
            if (status) sp.set('status', status);
            if (entity) sp.set('entity', entity);
            if (q.trim()) sp.set('q', q.trim());

            const res = await fetch(`/api/dashboard/audit?${sp}`, { headers: { 'x-shop-id': shop.id } });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Алдаа');
            setEntries(data.entries || []);
            setTotal(data.total || 0);
            setAvailable(data.available !== false);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Алдаа гарлаа');
        } finally {
            setLoading(false);
        }
    }, [shop?.id, page, status, entity, q]);

    useEffect(() => { load(); }, [load]);

    const fmt = (d: string) => new Date(d).toLocaleString('mn-MN');
    const toggle = (id: string) => setExpanded(prev => {
        const next = new Set(prev);
        next.has(id) ? next.delete(id) : next.add(id);
        return next;
    });

    const totalPages = Math.max(1, Math.ceil(total / pageSize));

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-xl md:text-2xl font-bold text-foreground flex items-center gap-2">
                    <ShieldCheck className="w-6 h-6 text-brand-strong" /> Аудитын түүх
                </h1>
                <p className="text-sm text-muted-foreground mt-1">
                    Системд хийгдсэн бүх үйлдэл — хэн, хэзээ, юуг өөрчилсөн.
                    Аудитын бичлэг өөрчлөгдөшгүй (append-only).
                </p>
            </div>

            {/* Шүүлтүүр */}
            <Card>
                <CardContent className="p-4 flex flex-wrap items-end gap-3">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Filter className="w-4 h-4" /> Шүүлтүүр
                    </div>

                    <div className="flex-1 min-w-[200px] relative">
                        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <input
                            value={q}
                            onChange={(e) => { setQ(e.target.value); setPage(1); }}
                            placeholder="Тайлбар, менежер, ID-аар хайх"
                            className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-border bg-background"
                        />
                    </div>

                    <select
                        value={entity}
                        onChange={(e) => { setEntity(e.target.value); setPage(1); }}
                        className="px-3 py-2 text-sm rounded-lg border border-border bg-background"
                    >
                        <option value="">Бүх төрөл</option>
                        {Object.entries(ENTITY_LABEL).map(([k, v]) => (
                            <option key={k} value={k}>{v}</option>
                        ))}
                    </select>

                    <select
                        value={status}
                        onChange={(e) => { setStatus(e.target.value); setPage(1); }}
                        className="px-3 py-2 text-sm rounded-lg border border-border bg-background"
                    >
                        <option value="">Бүх төлөв</option>
                        <option value="success">Амжилттай</option>
                        <option value="denied">Эрхгүй оролдлого</option>
                        <option value="error">Алдаатай</option>
                    </select>
                </CardContent>
            </Card>

            {!available && (
                <Card>
                    <CardContent className="p-6 text-sm text-muted-foreground flex items-start gap-3">
                        <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />
                        <span>
                            <strong className="text-foreground">activity_log хүснэгт хараахан үүсээгүй.</strong>{' '}
                            <code className="text-xs">20260725140000_activity_log.sql</code> migration-ыг тавьсны
                            дараа аудитын түүх энд харагдана.
                        </span>
                    </CardContent>
                </Card>
            )}

            {loading ? (
                <div className="flex items-center justify-center py-16 text-muted-foreground">
                    <Loader2 className="w-5 h-5 animate-spin mr-2" /> Татаж байна…
                </div>
            ) : error ? (
                <Card><CardContent className="p-6 text-sm text-destructive">{error}</CardContent></Card>
            ) : entries.length === 0 ? (
                <Card><CardContent className="p-10 text-center text-sm text-muted-foreground">
                    Бичлэг олдсонгүй.
                </CardContent></Card>
            ) : (
                <Card>
                    <CardContent className="p-0 divide-y divide-border">
                        {entries.map((e) => {
                            const isOpen = expanded.has(e.id);
                            const hasDiff = (e.before && Object.keys(e.before).length > 0)
                                || (e.after && Object.keys(e.after).length > 0);
                            return (
                                <div key={e.id} className="p-4">
                                    <button
                                        onClick={() => hasDiff && toggle(e.id)}
                                        className="w-full text-left flex items-start gap-3"
                                    >
                                        <span className="mt-0.5 shrink-0">
                                            {e.status === 'success'
                                                ? <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                                                : e.status === 'denied'
                                                    ? <AlertTriangle className="w-4 h-4 text-amber-500" />
                                                    : <XCircle className="w-4 h-4 text-destructive" />}
                                        </span>

                                        <div className="flex-1 min-w-0">
                                            <div className="flex flex-wrap items-center gap-2 text-sm">
                                                <span className="font-medium text-foreground">
                                                    {e.actor_name || 'Систем'}
                                                </span>
                                                {e.actor_role && (
                                                    <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                                                        {e.actor_role}
                                                    </span>
                                                )}
                                                <span className="text-muted-foreground">
                                                    {ENTITY_LABEL[e.entity] || e.entity}
                                                </span>
                                                <span className="text-foreground">
                                                    {ACTION_LABEL[e.action] || e.action}
                                                </span>
                                                <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                                                    {SOURCE_LABEL[e.source] || e.source}
                                                </span>
                                            </div>

                                            {e.summary && (
                                                <p className="text-sm text-muted-foreground mt-1">{e.summary}</p>
                                            )}
                                            {e.error_message && (
                                                <p className="text-xs text-destructive mt-1">{e.error_message}</p>
                                            )}

                                            <div className="text-xs text-muted-foreground mt-1 flex flex-wrap gap-3">
                                                <span>{fmt(e.occurred_at)}</span>
                                                {e.request_ip && <span>IP: {e.request_ip}</span>}
                                                {e.entity_id && <span className="truncate max-w-[220px]">ID: {e.entity_id}</span>}
                                            </div>
                                        </div>

                                        {hasDiff && (
                                            <span className="shrink-0 text-muted-foreground">
                                                {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                                            </span>
                                        )}
                                    </button>

                                    {isOpen && hasDiff && (
                                        <div className="mt-3 ml-7 grid gap-3 sm:grid-cols-2">
                                            <div className="rounded-lg border border-border overflow-hidden">
                                                <div className="px-3 py-1.5 text-xs font-medium bg-muted text-muted-foreground">
                                                    Өмнө
                                                </div>
                                                <pre className="p-3 text-xs overflow-x-auto whitespace-pre-wrap break-all">
                                                    {JSON.stringify(e.before ?? {}, null, 2)}
                                                </pre>
                                            </div>
                                            <div className="rounded-lg border border-border overflow-hidden">
                                                <div className="px-3 py-1.5 text-xs font-medium bg-muted text-muted-foreground">
                                                    Дараа
                                                </div>
                                                <pre className="p-3 text-xs overflow-x-auto whitespace-pre-wrap break-all">
                                                    {JSON.stringify(e.after ?? {}, null, 2)}
                                                </pre>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </CardContent>
                </Card>
            )}

            {total > pageSize && (
                <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">
                        Нийт {total.toLocaleString()} бичлэг · {page}/{totalPages} хуудас
                    </span>
                    <div className="flex gap-2">
                        <button
                            disabled={page <= 1}
                            onClick={() => setPage(p => Math.max(1, p - 1))}
                            className="px-3 py-1.5 rounded-lg border border-border disabled:opacity-40"
                        >
                            Өмнөх
                        </button>
                        <button
                            disabled={page >= totalPages}
                            onClick={() => setPage(p => p + 1)}
                            className="px-3 py-1.5 rounded-lg border border-border disabled:opacity-40"
                        >
                            Дараах
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
