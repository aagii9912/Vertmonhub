'use client';

import React, { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { History, Loader2, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';

interface HistoryRow {
    id: string;
    occurred_at: string;
    actor_name: string | null;
    actor_role: string | null;
    source: string;
    action: string;
    summary: string | null;
    before: Record<string, unknown> | null;
    after: Record<string, unknown> | null;
    status: string;
}

const ACTION_LABEL: Record<string, string> = {
    create: 'Үүсгэв', update: 'Шинэчлэв', delete: 'Устгав', merge: 'Нэгтгэв',
    convert: 'Хөрвүүлэв', upload: 'Байршуулав', export: 'Татав', send: 'Илгээв',
};

/**
 * Тухайн бичлэгийн өөрчлөлтийн түүх — гэрээ/лийд/харилцагчийн дэлгэрэнгүйд
 * хавсаргана. Аудит бичигдэж байгаа ч харах цонх байхгүй байсан асуудлыг
 * (H-26 «dead log») бизнесийн ажлын урсгал дотор шийднэ.
 *
 *   <EntityHistory entity="contract" id={contract.id} />
 */
export function EntityHistory({ entity, id }: { entity: string; id: string }) {
    const { shop } = useAuth();
    const [rows, setRows] = useState<HistoryRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [available, setAvailable] = useState(true);

    useEffect(() => {
        if (!shop?.id || !id) return;
        let cancelled = false;

        (async () => {
            setLoading(true);
            try {
                const res = await fetch(
                    `/api/dashboard/audit/entity?entity=${encodeURIComponent(entity)}&id=${encodeURIComponent(id)}`,
                    { headers: { 'x-shop-id': shop.id } },
                );
                const data = await res.json();
                if (cancelled) return;
                setRows(data.history || []);
                setAvailable(data.available !== false);
            } catch {
                if (!cancelled) setRows([]);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();

        return () => { cancelled = true; };
    }, [shop?.id, entity, id]);

    const fmt = (d: string) => new Date(d).toLocaleString('mn-MN');

    const changedFields = (row: HistoryRow): string[] => {
        const keys = new Set([
            ...Object.keys(row.before || {}),
            ...Object.keys(row.after || {}),
        ]);
        return [...keys];
    };

    if (loading) {
        return (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-6">
                <Loader2 className="w-4 h-4 animate-spin" /> Түүх татаж байна…
            </div>
        );
    }

    if (!available) {
        return (
            <p className="text-sm text-muted-foreground py-4">
                Аудитын хүснэгт хараахан үүсээгүй байна.
            </p>
        );
    }

    if (rows.length === 0) {
        return (
            <p className="text-sm text-muted-foreground py-4">
                Өөрчлөлтийн бичлэг байхгүй.
            </p>
        );
    }

    return (
        <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <History className="w-4 h-4" /> Өөрчлөлтийн түүх
            </div>

            <ol className="relative border-l border-border ml-2 space-y-4">
                {rows.map((row) => {
                    const fields = changedFields(row);
                    return (
                        <li key={row.id} className="ml-4">
                            <span className="absolute -left-[5px] mt-1.5 w-2.5 h-2.5 rounded-full bg-border" />

                            <div className="flex flex-wrap items-center gap-2 text-sm">
                                {row.status === 'success'
                                    ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                                    : row.status === 'denied'
                                        ? <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                                        : <XCircle className="w-3.5 h-3.5 text-destructive" />}
                                <span className="font-medium text-foreground">
                                    {row.actor_name || 'Систем'}
                                </span>
                                <span className="text-muted-foreground">
                                    {ACTION_LABEL[row.action] || row.action}
                                </span>
                                <span className="text-xs text-muted-foreground">{fmt(row.occurred_at)}</span>
                            </div>

                            {row.summary && (
                                <p className="text-sm text-muted-foreground mt-0.5">{row.summary}</p>
                            )}

                            {fields.length > 0 && (
                                <div className="mt-2 space-y-1">
                                    {fields.map((f) => (
                                        <div key={f} className="text-xs flex flex-wrap items-center gap-1.5">
                                            <span className="text-muted-foreground">{f}:</span>
                                            <span className="px-1.5 py-0.5 rounded bg-muted line-through text-muted-foreground break-all">
                                                {String((row.before || {})[f] ?? '—')}
                                            </span>
                                            <span className="text-muted-foreground">→</span>
                                            <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 break-all">
                                                {String((row.after || {})[f] ?? '—')}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </li>
                    );
                })}
            </ol>
        </div>
    );
}

export default EntityHistory;
