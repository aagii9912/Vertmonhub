'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CalendarPlus, ChevronRight, ListPlus, Loader2, UserPlus, X } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { dashboardFetch, dashboardMutate } from '@/lib/api/dashboardFetch';
import { canQuickCreate, onQuickCreate, type QuickCreateKind } from '@/lib/navigation/commandPalette';
import {
    ANONYMOUS_LEAD_CONTACT, ANONYMOUS_LEAD_LABEL, INTEREST_CHIPS, LEAD_NAME_OR_ANONYMOUS, SOURCES, SOURCE_LABEL, UNCATEGORIZED_LABEL,
    hasAnonymousLeadContact, leadDisplayName, normalizeLeadName,
} from '@/lib/leads/labels';
import { enqueue, isNetworkError } from '@/lib/offline/outbox';
import { REMIND_OPTIONS, TaskCreateSchema } from '@/lib/tasks/input';
import { ubLocalToIso } from '@/lib/utils/date';
import { useAuth } from '@/contexts/AuthContext';
import { useModuleAccess } from '@/hooks/useModuleAccess';
import { useLeadCategories, useLeadProjects } from '@/hooks/useLeads';
import { useCreateTask } from '@/hooks/useMyTasks';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/Sheet';

/**
 * Түргэн бүртгэл — «+ Шинэ», N товчлуур, ⌘K бүгд үүнийг нээнэ (баруун талын 440px sheet).
 * Дээд талын солигч: Лид / Уулзалт / Ажил. Уулзалт энд форм биш — Уулзалт хуудасны товлох
 * цонх руу шилжинэ (?new=1). Таниагүй төрөл (жишээ нь гэрээ) лидийн формоор нээгдэнэ.
 *
 * Лид: хуудас солихгүй. Төсөл, нэр, утас, сонирхлоо сонгоно, бусад нь «Нэмэлт мэдээлэл» доор
 * хумигдана. Утас давхцвал ХАДГАЛАХААС ӨМНӨ анхааруулна — v1-д давхардсан лид чимээгүй үүсдэг байсан.
 * Нэрээ хэлээгүй харилцагчийг «Нэр тодорхойгүй»-гээр нэргүй хадгална; тэр үед утас (эсвэл
 * и-мэйл) заавал — сервер `resolveLeadIdentity` мөн адил шалгана.
 * Ажил (kind = 'task'): хувийн ажлын форм — «Миний ажлууд»-тай нэг API.
 */

type FormKind = 'lead' | 'task';

const KINDS: { kind: QuickCreateKind; label: string; icon: typeof UserPlus }[] = [
    { kind: 'lead', label: 'Лид', icon: UserPlus },
    { kind: 'meeting', label: 'Уулзалт', icon: CalendarPlus },
    { kind: 'task', label: 'Ажил', icon: ListPlus },
];

const MEETING_HREF = '/dashboard/viewings?new=1';

interface DuplicateLead {
    id: string;
    customer_name: string | null;
    sales_manager_name: string | null;
    created_at: string;
}

export function QuickCreateSheet() {
    const router = useRouter();
    const access = useModuleAccess();
    const [open, setOpen] = useState(false);
    const [kind, setKind] = useState<FormKind>('lead');
    const close = useCallback(() => setOpen(false), []);
    // Уулзалт — Уулзалт хуудасны товлох цонх (тэр хуудсан дээр байсан ч дахин нээгдэнэ).
    const openMeeting = useCallback(() => {
        setOpen(false);
        router.push(MEETING_HREF);
    }, [router]);

    useEffect(() => onQuickCreate((requested) => {
        if (requested === 'meeting') {
            openMeeting();
            return;
        }
        setKind(requested === 'task' ? 'task' : 'lead');
        setOpen(true);
    }), [openMeeting]);

    // «+ Шинэ»-тэй ижил эрхийн дүрэм; нээгдсэн төрөл үргэлж харагдана.
    const options = KINDS.filter((o) => o.kind === kind || canQuickCreate(o.kind, access));

    return (
        <Sheet open={open} onOpenChange={setOpen}>
            <SheetContent side="right" showCloseButton={false} aria-describedby={undefined} className="w-full gap-0 p-0 sm:max-w-[440px]">
                <SheetTitle className="sr-only">Түргэн бүртгэл</SheetTitle>
                <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border px-5">
                    <h2 className="text-base font-semibold text-foreground">{kind === 'task' ? 'Шинэ ажил' : 'Шинэ лид'}</h2>
                    <div className="ml-auto flex items-center gap-2">
                        <kbd className="mono-label rounded border border-border bg-surface-2 px-1.5 text-xs leading-5 text-muted-foreground">Esc</kbd>
                        <Button variant="ghost" size="iconSm" onClick={close} aria-label="Хаах"><X /></Button>
                    </div>
                </header>
                {options.length > 1 && (
                    <div className="shrink-0 border-b border-border px-5 py-3">
                        <div role="group" aria-label="Бүртгэлийн төрөл" className="flex items-center gap-1 rounded-xl bg-surface-2 p-1">
                            {options.map(({ kind: option, label, icon: Icon }) => {
                                const active = option === kind;
                                const meeting = option === 'meeting';
                                return (
                                    <button
                                        key={option}
                                        type="button"
                                        // Уулзалт нь солих биш, шилжих үйлдэл — дарагдсан төлөвгүй.
                                        aria-pressed={meeting ? undefined : active}
                                        title={meeting ? 'Уулзалт хуудсан дээр товлоно' : undefined}
                                        onClick={() => (meeting ? openMeeting() : setKind(option === 'task' ? 'task' : 'lead'))}
                                        className={cn(
                                            'flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg px-3 text-sm font-medium transition-colors',
                                            active ? 'bg-surface text-foreground shadow-[inset_0_0_0_1px_var(--border)]' : 'text-fg-2 hover:text-foreground',
                                        )}
                                    >
                                        <Icon className="size-4" />
                                        {label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                )}
                {kind === 'task' ? <TaskForm onClose={close} /> : <LeadForm onClose={close} />}
            </SheetContent>
        </Sheet>
    );
}

/* ------------------------------------------------------------------ */

const inputCls = 'h-9 w-full rounded-lg border border-control bg-surface px-3 text-sm text-foreground placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:bg-surface-2';
const selectCls = 'h-9 w-full rounded-lg border border-control bg-surface px-2.5 text-sm text-foreground disabled:cursor-not-allowed disabled:opacity-60';
const textareaCls = 'w-full resize-none rounded-lg border border-control bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground';
const chipCls = (active: boolean) => cn(
    'inline-flex h-8 items-center rounded-lg border px-2.5 text-xs font-medium transition-colors',
    active ? 'border-brand bg-brand-soft text-brand-strong' : 'border-border bg-surface text-fg-2 hover:border-border-strong hover:text-foreground',
);

function LeadForm({ onClose }: { onClose: () => void }) {
    const { user, shop } = useAuth();
    const router = useRouter();
    const qc = useQueryClient();
    const nameRef = useRef<HTMLInputElement>(null);
    const phoneRef = useRef<HTMLInputElement>(null);
    const projectRef = useRef<HTMLSelectElement>(null);
    const { data: projects = [], isLoading: projectsLoading, error: projectsError, refetch: refetchProjects } = useLeadProjects();
    const { data: allCategories = [] } = useLeadCategories();
    // Шинэ лидэд зөвхөн идэвхтэй ангилал (заавал биш; төсөлд ангилал үүсгээгүй бол талбар харагдахгүй).
    const categories = allCategories.filter((c) => c.is_active);
    /** Давхар submit хамгаалалт (state биш ref — ⌘↵ хоёр дарахад closure хоцордог) */
    const submittingRef = useRef(false);

    const [name, setName] = useState('');
    const [anonymous, setAnonymous] = useState(false);
    const [requestId] = useState(() => crypto.randomUUID());
    const [phone, setPhone] = useState('');
    const [chosenProjectId, setProjectId] = useState('');
    // Shop = төсөл: ганц төсөлтэй бол автоматаар сонгоно (сонгох талбар харагдахгүй).
    const soleProject = projects.length === 1 ? projects[0].id : null;
    const projectId = soleProject ?? chosenProjectId;
    const [interest, setInterest] = useState<string>('');
    const [categoryId, setCategoryId] = useState('');
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

    // «Нэр тодорхойгүй»: нэрийг цэвэрлэж утас руу шилжинэ; буцаахад нэр рүү.
    const toggleAnonymous = (on: boolean) => {
        setAnonymous(on);
        if (on) {
            setName('');
            phoneRef.current?.focus();
        } else {
            requestAnimationFrame(() => nameRef.current?.focus());
        }
    };

    // Утас бүрэн болмогц давхардлыг шалгана (400ms debounce).
    useEffect(() => {
        const digits = phone.replace(/\D/g, '');
        setDuplicate(null);
        if (digits.length < 8 || !projectId) {
            return;
        }
        let cancelled = false;
        const t = setTimeout(async () => {
            try {
                const res = await dashboardFetch(`/api/dashboard/leads?phone=${encodeURIComponent(digits)}&project=${encodeURIComponent(projectId)}&limit=1`);
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
    }, [phone, projectId]);

    const submit = useCallback(
        async (thenSchedule: boolean) => {
            if (!projects.some(p => p.id === projectId)) {
                toast.error('Төсөл сонгоно уу');
                projectRef.current?.focus();
                return;
            }
            if (!anonymous && !normalizeLeadName(name)) {
                toast.error(LEAD_NAME_OR_ANONYMOUS);
                nameRef.current?.focus();
                return;
            }
            if (anonymous && !hasAnonymousLeadContact(phone, email)) {
                toast.error(ANONYMOUS_LEAD_CONTACT);
                phoneRef.current?.focus();
                return;
            }
            // ⌘↵-г хоёр дарахад давхар POST явдаг байсан (state-ийн `saving` closure хоцордог)
            if (submittingRef.current) return;
            submittingRef.current = true;
            setSaving(true);
            const budgetMax = budget ? Number(budget.replace(/\D/g, '')) : null;
            const payload = {
                // Idempotency: timeout-ын дараа outbox дахин илгээхэд сервер давхар лид үүсгэхгүй
                client_request_id: requestId,
                project_id: projectId,
                customer_name: anonymous ? null : name.trim(),
                anonymous,
                customer_phone: phone.trim() || null,
                customer_email: email.trim() || null,
                source,
                preferred_rooms: INTEREST_CHIPS.find((c) => c.label === interest)?.rooms ?? null,
                preferred_type: INTEREST_CHIPS.find((c) => c.label === interest)?.type ?? null,
                budget_max: budgetMax && budgetMax > 0 ? budgetMax : null,
                notes: notes.trim() || null,
                category_id: categoryId || null,
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
                    router.push(id ? `/dashboard/viewings?lead=${id}&new=1` : '/dashboard/viewings?new=1');
                }
            } catch (e) {
                if (isNetworkError(e)) {
                    // Талбай дээр интернэтгүй: алдахгүй, холбогдмогц илгээнэ.
                    try {
                        enqueue({ url: '/api/dashboard/leads', method: 'POST', body: payload, label: `Лид · ${leadDisplayName(payload.customer_name)}` }, { userId: user?.id || '', shopId: shop?.id || '' });
                        toast.success('Интернэтгүй байна — лид энэ төхөөрөмжид хадгалагдлаа');
                        onClose();
                    } catch {
                        toast.error('Лидийг төхөөрөмжид хадгалж чадсангүй. Формын мэдээлэл хэвээр байна; хуулж аваад дахин оролдоно уу.');
                    }
                } else {
                    toast.error(e instanceof Error ? e.message : 'Хадгалж чадсангүй');
                }
            } finally {
                submittingRef.current = false;
                setSaving(false);
            }
        },
        [name, anonymous, phone, email, source, interest, categoryId, budget, notes, qc, onClose, router, user, shop, requestId, projectId, projects],
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
            <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-5">
                {!soleProject && <Field label="Төсөл" required>
                    <select ref={projectRef} aria-label="Төсөл" required value={projectId} onChange={(e) => setProjectId(e.target.value)} disabled={projectsLoading || !!projectsError} className={selectCls}>
                        <option value="">{projectsLoading ? 'Төсөл ачаалж байна…' : 'Төсөл сонгох'}</option>
                        {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                    {projectsError ? <p role="alert" className="text-xs text-status-danger">Төслүүдийг уншиж чадсангүй. <button type="button" className="underline" onClick={() => void refetchProjects()}>Дахин оролдох</button></p> : !projectsLoading && !projects.length && <p role="status" className="text-xs text-muted-foreground">Лид бүртгэх төслийн эрх олгогдоогүй байна.</p>}
                </Field>}
                <div className="flex flex-col gap-2">
                    <Field label="Нэр" required={!anonymous}>
                        <input
                            ref={nameRef}
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            disabled={anonymous}
                            placeholder={anonymous ? ANONYMOUS_LEAD_LABEL : 'Ж: Г. Энхжин'}
                            className={inputCls}
                        />
                    </Field>
                    {/* Field нь <label> — checkbox-ийг дотор нь биш, тусдаа мөрөнд байрлуулна. */}
                    <label htmlFor="quick-lead-anonymous" className="flex w-fit cursor-pointer select-none items-center gap-2 text-sm text-fg-2">
                        <Checkbox id="quick-lead-anonymous" checked={anonymous} onCheckedChange={(checked) => toggleAnonymous(checked === true)} />
                        Нэр тодорхойгүй — нэргүй хадгалах
                    </label>
                </div>

                <Field label="Утас" required={anonymous}>
                    <input
                        ref={phoneRef}
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        inputMode="tel"
                        placeholder="9911 2233"
                        className={cn(inputCls, 'num')}
                    />
                    {anonymous && <span className="text-xs text-muted-foreground">Нэргүй лидийг утас (эсвэл и-мэйл)-аар нь танина.</span>}
                    {duplicate && (
                        <div role="status" className="mt-1 flex items-start gap-2 rounded-lg bg-status-pending-soft px-3 py-2 text-xs text-status-pending">
                            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                            <div className="min-w-0 flex-1">
                                Энэ дугаар бүртгэлтэй:{' '}
                                <strong className="font-semibold">{leadDisplayName(duplicate)}</strong>
                                {duplicate.sales_manager_name ? ` · ${duplicate.sales_manager_name}` : ''}
                            </div>
                            <button
                                type="button"
                                onClick={() => {
                                    onClose();
                                    router.push(`/dashboard/leads?lead=${duplicate.id}`);
                                }}
                                className="shrink-0 font-medium text-brand-strong underline-offset-2 hover:underline"
                            >
                                Нээх
                            </button>
                        </div>
                    )}
                </Field>

                <div className="flex flex-col gap-1.5">
                    <span id="quick-lead-interest" className="text-xs font-medium text-muted-foreground">Сонирхол</span>
                    <div className="flex flex-wrap gap-1.5" role="group" aria-labelledby="quick-lead-interest">
                        {INTEREST_CHIPS.map(({ label: v }) => (
                            <button key={v} type="button" aria-pressed={interest === v} onClick={() => setInterest(interest === v ? '' : v)} className={chipCls(interest === v)}>
                                {v}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Ангилал (заавал биш). Чипүүдийг <label>-д ороохгүй — шошгыг дарахад эхний чип сонгогдохгүй. */}
                {categories.length > 0 && categories.length <= 8 && (
                    <div className="flex flex-col gap-1.5">
                        <span id="quick-lead-category" className="text-xs font-medium text-muted-foreground">Ангилал</span>
                        <div className="flex flex-wrap gap-1.5" role="group" aria-labelledby="quick-lead-category">
                            {categories.map((c) => (
                                <button
                                    key={c.id}
                                    type="button"
                                    aria-pressed={categoryId === c.id}
                                    title={c.description ?? undefined}
                                    onClick={() => setCategoryId(categoryId === c.id ? '' : c.id)}
                                    className={chipCls(categoryId === c.id)}
                                >
                                    {c.name}
                                </button>
                            ))}
                        </div>
                    </div>
                )}
                {categories.length > 8 && (
                    <Field label="Ангилал">
                        <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={selectCls}>
                            <option value="">{UNCATEGORIZED_LABEL}</option>
                            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                    </Field>
                )}

                <Field label="Эх үүсвэр">
                    <select value={source} onChange={(e) => setSource(e.target.value)} className={selectCls}>
                        {SOURCES.map((v) => (
                            <option key={v} value={v}>
                                {SOURCE_LABEL[v]}
                            </option>
                        ))}
                    </select>
                </Field>

                <button
                    type="button"
                    aria-expanded={showMore}
                    onClick={() => setShowMore((v) => !v)}
                    className="flex items-center gap-2 rounded-lg py-1 text-left transition-colors hover:text-foreground"
                >
                    <ChevronRight className={cn('size-4 shrink-0 text-muted-foreground transition-transform', showMore && 'rotate-90')} />
                    <span className="text-sm font-medium text-fg-2">Нэмэлт мэдээлэл</span>
                    <span className="ml-auto text-xs text-muted-foreground">Заавал биш</span>
                </button>

                {showMore && (
                    <div className="flex flex-col gap-4 border-l border-border pl-4">
                        <Field label="И-мэйл">
                            <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="name@example.com" className={inputCls} />
                        </Field>
                        <Field label="Төсөв (₮)">
                            <input value={budget} onChange={(e) => setBudget(e.target.value)} inputMode="numeric" placeholder="330 000 000" className={cn(inputCls, 'num')} />
                        </Field>
                        <Field label="Тэмдэглэл">
                            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="12-р давхраас дээш хүсэж байна…" className={textareaCls} />
                        </Field>
                    </div>
                )}
            </div>

            <footer className="flex shrink-0 items-center gap-2 border-t border-border px-5 py-4">
                <Button size="sm" variant="ghost" onClick={onClose}>Болих</Button>
                <div className="ml-auto flex items-center gap-2">
                    <Button size="sm" variant="secondary" disabled={saving} onClick={() => void submit(true)}>
                        Хадгалаад уулзалт товлох
                    </Button>
                    <Button size="sm" disabled={saving} onClick={() => void submit(false)}>
                        {saving && <Loader2 className="animate-spin" />}
                        Хадгалах
                        <kbd className="mono-label text-xs opacity-75">⌘↵</kbd>
                    </Button>
                </div>
            </footer>
        </>
    );
}

type TaskErrors = Partial<Record<'title' | 'note' | 'form', string>>;

/**
 * «Ажил нэмэх» — хувийн ажил (user_tasks). «Миний ажлууд» хуудастай ижил талбар,
 * ижил шалгалт (TaskCreateSchema), ижил API ба query шинэчлэл (useCreateTask).
 * Дуусах хугацааг Улаанбаатарын цагаар уншина; алдааг талбарын доор харуулна.
 */
function TaskForm({ onClose }: { onClose: () => void }) {
    const { mutateAsync, isPending } = useCreateTask();
    const titleRef = useRef<HTMLInputElement>(null);
    const noteRef = useRef<HTMLTextAreaElement>(null);
    /** Давхар submit хамгаалалт (state биш ref — ⌘↵ хоёр дарахад closure хоцордог) */
    const submittingRef = useRef(false);

    const [title, setTitle] = useState('');
    const [due, setDue] = useState('');
    const [remind, setRemind] = useState<string>('none');
    const [note, setNote] = useState('');
    const [errors, setErrors] = useState<TaskErrors>({});

    useEffect(() => {
        titleRef.current?.focus();
    }, []);

    const submit = useCallback(async () => {
        if (submittingRef.current) return;
        const dueAt = ubLocalToIso(due);
        const parsed = TaskCreateSchema.safeParse({
            title,
            note: note.trim() || null,
            dueAt,
            remindAt: dueAt && remind !== 'none' ? new Date(Date.parse(dueAt) - Number(remind) * 60_000).toISOString() : null,
        });
        if (!parsed.success) {
            const next: TaskErrors = {};
            for (const issue of parsed.error.issues) {
                const key = issue.path[0] === 'title' || issue.path[0] === 'note' ? issue.path[0] : 'form';
                next[key] ??= issue.message;
            }
            setErrors(next);
            if (next.title) titleRef.current?.focus();
            else if (next.note) noteRef.current?.focus();
            return;
        }
        submittingRef.current = true;
        setErrors({});
        try {
            await mutateAsync(parsed.data);
            toast.success('Ажил нэмэгдлээ');
            onClose();
        } catch (e) {
            setErrors({ form: e instanceof Error ? e.message : 'Ажил нэмж чадсангүй. Дахин оролдоно уу.' });
        } finally {
            submittingRef.current = false;
        }
    }, [title, due, remind, note, mutateAsync, onClose]);

    // ⌘↵ — хадгалах
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                void submit();
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [submit]);

    return (
        <form noValidate onSubmit={(e) => { e.preventDefault(); void submit(); }} className="flex min-h-0 flex-1 flex-col">
            <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-5">
                <Field label="Гарчиг" required error={errors.title} errorId="quick-task-title-error">
                    <input
                        ref={titleRef}
                        value={title}
                        onChange={(e) => {
                            setTitle(e.target.value);
                            if (errors.title) setErrors((prev) => ({ ...prev, title: undefined }));
                        }}
                        aria-label="Гарчиг"
                        required
                        maxLength={300}
                        aria-invalid={!!errors.title}
                        aria-describedby={errors.title ? 'quick-task-title-error' : undefined}
                        placeholder="Ж: Б. Болдод үнийн санал илгээх"
                        className={inputCls}
                    />
                </Field>

                <Field label="Дуусах хугацаа">
                    <input
                        type="datetime-local"
                        value={due}
                        onChange={(e) => {
                            setDue(e.target.value);
                            if (!e.target.value) setRemind('none');
                        }}
                        aria-label="Дуусах хугацаа"
                        className={cn(inputCls, 'num')}
                    />
                    <span className="text-xs text-muted-foreground">Улаанбаатарын цагаар · заавал биш</span>
                </Field>

                <Field label="Сануулга">
                    <select value={remind} onChange={(e) => setRemind(e.target.value)} disabled={!due} aria-label="Сануулга" className={selectCls}>
                        {REMIND_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>
                                {o.label}
                            </option>
                        ))}
                    </select>
                    {!due && <span className="text-xs text-muted-foreground">Сануулга тавихын тулд хугацаа сонгоно уу</span>}
                </Field>

                <Field label="Тэмдэглэл" error={errors.note} errorId="quick-task-note-error">
                    <textarea
                        ref={noteRef}
                        value={note}
                        onChange={(e) => {
                            setNote(e.target.value);
                            if (errors.note) setErrors((prev) => ({ ...prev, note: undefined }));
                        }}
                        aria-label="Тэмдэглэл"
                        rows={3}
                        maxLength={4000}
                        aria-invalid={!!errors.note}
                        aria-describedby={errors.note ? 'quick-task-note-error' : undefined}
                        placeholder="Дэлгэрэнгүй тэмдэглэл — заавал биш"
                        className={textareaCls}
                    />
                </Field>

                {errors.form && <p role="alert" className="text-xs text-status-danger">{errors.form}</p>}
            </div>

            <footer className="flex shrink-0 items-center gap-2 border-t border-border px-5 py-4">
                <Button type="button" size="sm" variant="ghost" onClick={onClose}>Болих</Button>
                <Button type="submit" size="sm" className="ml-auto" disabled={isPending}>
                    {isPending && <Loader2 className="animate-spin" />}
                    Хадгалах
                    <kbd className="mono-label text-xs opacity-75">⌘↵</kbd>
                </Button>
            </footer>
        </form>
    );
}

function Field({ label, required, error, errorId, children }: { label: string; required?: boolean; error?: string; errorId?: string; children: React.ReactNode }) {
    const field = (
        <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">
                {label}
                {required && <span className="ml-0.5 text-status-danger">*</span>}
            </span>
            {children}
        </label>
    );
    if (!error) return field;
    // Алдааг шошгоны гадна — талбарын нэрэнд орохгүй, aria-describedby-гоор холбогдоно.
    return (
        <div className="flex flex-col gap-1">
            {field}
            <p id={errorId} role="alert" className="text-xs text-status-danger">{error}</p>
        </div>
    );
}
