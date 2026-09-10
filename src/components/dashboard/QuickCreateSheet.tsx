'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ChevronRight, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { dashboardFetch, dashboardMutate } from '@/lib/api/dashboardFetch';
import { onQuickCreate, type QuickCreateKind } from '@/lib/navigation/commandPalette';
import { INTEREST_CHIPS, SOURCES, SOURCE_LABEL } from '@/lib/leads/labels';
import { enqueue, isNetworkError } from '@/lib/offline/outbox';

/**
 * Түргэн бүртгэл — «Шинэ» товч, N товчлуур, гар утасны «+» бүгд үүнийг нээнэ.
 *
 * Гол зарчим: хуудас солихгүй. Заавал гурван талбар (нэр, утас, сонирхол),
 * бусад нь «Нэмэлт мэдээлэл» доор хумигдана. Утас давхцвал ХАДГАЛАХААС ӨМНӨ
 * анхааруулна — v1-д давхардсан лид чимээгүй үүсдэг байсан.
 */

interface DuplicateLead {
    id: string;
    customer_name: string | null;
    sales_manager_name: string | null;
    created_at: string;
}

export function QuickCreateSheet() {
    const [open, setOpen] = useState(false);
    const [kind, setKind] = useState<QuickCreateKind>('lead');

    useEffect(() => {
        return onQuickCreate((k) => {
            setKind(k);
            setOpen(true);
        });
    }, []);

    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setOpen(false);
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open]);

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Түргэн бүртгэл">
            <button
                type="button"
                aria-label="Хаах"
                onClick={() => setOpen(false)}
                className="absolute inset-0 bg-[rgba(21,24,30,0.28)] animate-in fade-in duration-150"
            />
            <div
                className={cn(
                    'absolute inset-y-0 right-0 flex w-full flex-col bg-surface shadow-xl',
                    'sm:w-[440px] sm:border-l sm:border-border',
                    'animate-in slide-in-from-right duration-200',
                )}
            >
                {kind === 'meeting' ? (
                    <MeetingRedirect onClose={() => setOpen(false)} />
                ) : (
                    <LeadForm onClose={() => setOpen(false)} />
                )}
            </div>
        </div>
    );
}

/* ------------------------------------------------------------------ */

function LeadForm({ onClose }: { onClose: () => void }) {
    const router = useRouter();
    const qc = useQueryClient();
    const nameRef = useRef<HTMLInputElement>(null);

    const [name, setName] = useState('');
    const [phone, setPhone] = useState('');
    const [interest, setInterest] = useState<string>('');
    const [source, setSource] = useState('phone');
    const [showMore, setShowMore] = useState(false);
    const [email, setEmail] = useState('');
    const [budget, setBudget] = useState('');
    const [notes, setNotes] = useState('');
    const [saving, setSaving] = useState(false);
    const [duplicate, setDuplicate] = useState<DuplicateLead | null>(null);

    useEffect(() => {
        nameRef.current?.focus();
    }, []);

    // Утас бүрэн болмогц давхардлыг шалгана (400ms debounce).
    useEffect(() => {
        const digits = phone.replace(/\D/g, '');
        if (digits.length < 8) {
            setDuplicate(null);
            return;
        }
        let cancelled = false;
        const t = setTimeout(async () => {
            try {
                const res = await dashboardFetch(`/api/dashboard/leads?phone=${encodeURIComponent(digits)}&limit=1`);
                if (!res.ok || cancelled) return;
                const json = await res.json().catch(() => null);
                const hit: DuplicateLead | undefined = Array.isArray(json?.leads) ? json.leads[0] : undefined;
                if (!cancelled) setDuplicate(hit ?? null);
            } catch {
                /* давхардлын шалгалт бүтэлгүйтвэл чимээгүй өнгөрнө */
            }
        }, 400);
        return () => {
            cancelled = true;
            clearTimeout(t);
        };
    }, [phone]);

    const submit = useCallback(
        async (thenSchedule: boolean) => {
            if (!name.trim()) {
                toast.error('Нэр оруулна уу');
                nameRef.current?.focus();
                return;
            }
            setSaving(true);
            const budgetMax = budget ? Number(budget.replace(/\D/g, '')) : null;
            const payload = {
                customer_name: name.trim(),
                customer_phone: phone.trim() || null,
                customer_email: email.trim() || null,
                source,
                preferred_rooms: INTEREST_CHIPS.find((c) => c.label === interest)?.rooms ?? null,
                preferred_type: INTEREST_CHIPS.find((c) => c.label === interest)?.type ?? null,
                budget_max: budgetMax && budgetMax > 0 ? budgetMax : null,
                notes: notes.trim() || null,
            };
            try {
                const created = await dashboardMutate<{ lead?: { id: string } }>('/api/dashboard/leads', 'POST', payload);
                toast.success('Лид бүртгэгдлээ');
                void qc.invalidateQueries({ queryKey: ['leads'] });
                void qc.invalidateQueries({ queryKey: ['nav-counts'] });
                void qc.invalidateQueries({ queryKey: ['my-stats'] });
                onClose();
                if (thenSchedule) {
                    const id = created?.lead?.id;
                    router.push(id ? `/dashboard/viewings?lead=${id}` : '/dashboard/viewings');
                }
            } catch (e) {
                if (isNetworkError(e)) {
                    // Талбай дээр интернэтгүй: алдахгүй, холбогдмогц илгээнэ.
                    enqueue({ url: '/api/dashboard/leads', method: 'POST', body: payload, label: `Лид · ${payload.customer_name}` });
                    toast.success('Интернэтгүй байна — лид хадгалагдлаа, холбогдмогц илгээнэ');
                    onClose();
                } else {
                    toast.error(e instanceof Error ? e.message : 'Хадгалж чадсангүй');
                }
            } finally {
                setSaving(false);
            }
        },
        [name, phone, email, source, interest, budget, notes, qc, onClose, router],
    );

    // ⌘↵ — хадгалах
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                void submit(false);
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [submit]);

    return (
        <>
            <header className="flex h-[52px] shrink-0 items-center gap-3 border-b border-border px-5">
                <h2 className="text-[16px] font-semibold text-foreground">Шинэ лид</h2>
                <div className="ml-auto flex items-center gap-2">
                    <kbd className="mono-label hidden rounded border border-border bg-surface-2 px-1.5 text-[10.5px] leading-5 text-muted-foreground sm:inline">
                        Esc
                    </kbd>
                    <button
                        type="button"
                        onClick={onClose}
                        className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground focus-ring"
                        aria-label="Хаах"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>
            </header>

            <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-5">
                <Field label="Нэр" required>
                    <input
                        ref={nameRef}
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Ж: Г. Энхжин"
                        className="h-[34px] w-full rounded-md border border-border-strong bg-surface px-2.5 text-[13px] text-foreground outline-none transition-shadow placeholder:text-muted-foreground focus:border-brand focus:shadow-[0_0_0_3px_var(--brand-soft)]"
                    />
                </Field>

                <Field label="Утас" required>
                    <input
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        inputMode="tel"
                        placeholder="9911 2233"
                        className="mono-label h-[34px] w-full rounded-md border border-border-strong bg-surface px-2.5 text-[13px] text-foreground outline-none transition-shadow placeholder:font-sans placeholder:text-muted-foreground focus:border-brand focus:shadow-[0_0_0_3px_var(--brand-soft)]"
                    />
                    {duplicate && (
                        <div className="mt-2 flex items-start gap-2 rounded-md bg-status-pending-soft px-2.5 py-2 text-[12px] text-status-pending">
                            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                            <div className="min-w-0 flex-1">
                                <div>
                                    Энэ дугаар бүртгэлтэй:{' '}
                                    <strong className="font-semibold">{duplicate.customer_name || 'Нэргүй'}</strong>
                                    {duplicate.sales_manager_name ? ` · ${duplicate.sales_manager_name}` : ''}
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => {
                                    onClose();
                                    router.push(`/dashboard/leads?lead=${duplicate.id}`);
                                }}
                                className="shrink-0 font-medium text-brand underline-offset-2 hover:underline"
                            >
                                Нээх
                            </button>
                        </div>
                    )}
                </Field>

                <Field label="Сонирхол">
                    <div className="flex flex-wrap gap-1.5">
                        {INTEREST_CHIPS.map(({ label: v }) => (
                            <button
                                key={v}
                                type="button"
                                onClick={() => setInterest(interest === v ? '' : v)}
                                className={cn(
                                    'h-[26px] rounded-md border px-2.5 text-[12px] transition-colors focus-ring',
                                    interest === v
                                        ? 'border-brand bg-brand-soft text-brand'
                                        : 'border-border bg-surface text-fg-2 hover:border-border-strong',
                                )}
                            >
                                {v}
                            </button>
                        ))}
                    </div>
                </Field>

                <Field label="Эх үүсвэр">
                    <select
                        value={source}
                        onChange={(e) => setSource(e.target.value)}
                        className="h-[34px] w-full rounded-md border border-border-strong bg-surface px-2 text-[13px] text-foreground outline-none focus:border-brand focus:shadow-[0_0_0_3px_var(--brand-soft)]"
                    >
                        {SOURCES.map((v) => (
                            <option key={v} value={v}>
                                {SOURCE_LABEL[v]}
                            </option>
                        ))}
                    </select>
                </Field>

                <button
                    type="button"
                    onClick={() => setShowMore((v) => !v)}
                    className="flex items-center gap-2 rounded-md py-1 text-left transition-colors hover:text-foreground focus-ring"
                >
                    <ChevronRight className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', showMore && 'rotate-90')} />
                    <span className="text-[13px] font-medium text-fg-2">Нэмэлт мэдээлэл</span>
                    <span className="ml-auto text-[11.5px] text-muted-foreground">Заавал биш</span>
                </button>

                {showMore && (
                    <div className="flex flex-col gap-4 border-l border-border pl-4">
                        <Field label="И-мэйл">
                            <input
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                type="email"
                                placeholder="name@example.com"
                                className="h-[34px] w-full rounded-md border border-border-strong bg-surface px-2.5 text-[13px] outline-none placeholder:text-muted-foreground focus:border-brand focus:shadow-[0_0_0_3px_var(--brand-soft)]"
                            />
                        </Field>
                        <Field label="Төсөв (₮)">
                            <input
                                value={budget}
                                onChange={(e) => setBudget(e.target.value)}
                                inputMode="numeric"
                                placeholder="330 000 000"
                                className="mono-label h-[34px] w-full rounded-md border border-border-strong bg-surface px-2.5 text-[13px] outline-none placeholder:font-sans placeholder:text-muted-foreground focus:border-brand focus:shadow-[0_0_0_3px_var(--brand-soft)]"
                            />
                        </Field>
                        <Field label="Тэмдэглэл">
                            <textarea
                                value={notes}
                                onChange={(e) => setNotes(e.target.value)}
                                rows={3}
                                placeholder="12-р давхраас дээш хүсэж байна…"
                                className="w-full resize-none rounded-md border border-border-strong bg-surface px-2.5 py-2 text-[13px] outline-none placeholder:text-muted-foreground focus:border-brand focus:shadow-[0_0_0_3px_var(--brand-soft)]"
                            />
                        </Field>
                    </div>
                )}
            </div>

            <footer className="flex shrink-0 items-center gap-2 border-t border-border p-4">
                <button
                    type="button"
                    onClick={onClose}
                    className="h-[34px] rounded-md px-3 text-[13px] text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground focus-ring"
                >
                    Болих
                </button>
                <div className="ml-auto flex items-center gap-2">
                    <button
                        type="button"
                        disabled={saving}
                        onClick={() => void submit(true)}
                        className="h-[34px] rounded-md border border-border-strong bg-surface px-3 text-[12.5px] font-medium text-foreground transition-colors hover:bg-surface-2 disabled:opacity-50 focus-ring"
                    >
                        Хадгалаад уулзалт товлох
                    </button>
                    <button
                        type="button"
                        disabled={saving}
                        onClick={() => void submit(false)}
                        className="flex h-[34px] items-center gap-2 rounded-md bg-brand px-3 text-[12.5px] font-medium text-brand-fg transition-colors hover:bg-brand-strong disabled:opacity-60 focus-ring"
                    >
                        {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                        Хадгалах
                        <kbd className="mono-label text-[10.5px] opacity-75">⌘↵</kbd>
                    </button>
                </div>
            </footer>
        </>
    );
}

function MeetingRedirect({ onClose }: { onClose: () => void }) {
    const router = useRouter();
    useEffect(() => {
        onClose();
        router.push('/dashboard/viewings?new=1');
    }, [onClose, router]);
    return null;
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
    return (
        <label className="flex flex-col gap-1.5">
            <span className="text-[11.5px] font-medium text-muted-foreground">
                {label}
                {required && <span className="ml-0.5 text-status-danger">*</span>}
            </span>
            {children}
        </label>
    );
}
