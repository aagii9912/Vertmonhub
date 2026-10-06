'use client';

import { useImperativeHandle, useRef, useState } from 'react';
import { BadgeDollarSign, CalendarClock, Check, PhoneCall } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { ubLocalToIso } from '@/lib/utils/date';
import { useAddLeadActivity, type LeadDetail, type LeadRow } from '@/hooks/useLeads';
import { useUpdateViewing } from '@/hooks/useViewings';
import { QUOTE_UNIT_MAX, parseQuoteAmount } from '@/lib/leads/quotes';
import { describeNextStep, followupAtDays } from '@/lib/leads/next-step';
import { getLeadWorkQueues, LEAD_WORK_QUEUES } from '@/lib/leads/work-queue';
import { Button } from '@/components/ui/Button';
import { StatusPill } from '@/components/ui/StatusPill';

type Followup = 1 | 3 | 7 | 'custom' | null;
const FOLLOWUPS: { value: Exclude<Followup, null>; label: string }[] = [
    { value: 1, label: 'Маргааш' },
    { value: 3, label: '3 хоног' },
    { value: 7, label: '7 хоног' },
    { value: 'custom', label: 'Огноо…' },
];

/**
 * Картын «Дараагийн алхам» — юу хийх, хэзээ, хоцорсон эсэх — ба үр дүн бүртгэх хэсэг.
 * «Дууссан» нь үр дүн ба дараагийн алхмыг нэг дор асууна: алхам сонгоогүй бол дууссан алхам
 * цэвэрлэгдэж лид «Дараагийн алхамгүй» жагсаалтад орно. Уулзалтын алхам бол уулзалтыг «болсон»
 * гэж тэмдэглэнэ (Уулзалт хуудасны «Ирсэн»-тэй ижил).
 */
export function NextStepBox({ lead, detail, canWrite }: { lead: LeadRow; detail?: LeadDetail; canWrite: boolean }) {
    const step = describeNextStep(lead);
    const queues = getLeadWorkQueues(lead);
    const flags = LEAD_WORK_QUEUES.filter((q) => queues.includes(q.key) && q.key !== 'overdue' && q.key !== 'no_followup');
    const viewing = step.kind === 'viewing'
        ? detail?.viewings.find((v) => v.status === 'scheduled' && v.scheduled_at === lead.viewing_scheduled_at)
            ?? detail?.viewings.filter((v) => v.status === 'scheduled').sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at))[0]
        : undefined;
    const [done, setDone] = useState(false);
    const composerRef = useRef<ComposerHandle>(null);
    const canFinish = canWrite && (step.kind === 'followup' || (step.kind === 'viewing' && !!viewing));

    return (
        <section aria-label="Дараагийн алхам" className="space-y-3">
            <div className={cn('rounded-xl border p-3', step.overdue ? 'border-status-danger/40 bg-status-danger-soft/40' : 'border-border bg-surface-2/60')}>
                <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                            <span>Дараагийн алхам</span>
                            {step.overdue && <StatusPill variant="danger">{step.overdueDays > 0 ? `${step.overdueDays} өдөр хоцорсон` : 'Хоцорсон'}</StatusPill>}
                            {flags.map((flag) => <StatusPill key={flag.key} variant="pending">{flag.label}</StatusPill>)}
                        </div>
                        <p className={cn('mt-1 text-sm font-medium', step.overdue ? 'text-status-danger' : 'text-foreground')}>
                            {step.kind === 'closed' ? step.action : step.kind === 'none' ? `${step.action} · товлоогүй` : `${step.action} · ${step.when}`}
                        </p>
                    </div>
                    {canFinish && !done && (
                        <Button size="sm" variant="secondary" onClick={() => { setDone(true); composerRef.current?.startDone(step.kind === 'followup'); }}>
                            <Check /> Дууссан
                        </Button>
                    )}
                </div>
            </div>
            {canWrite && step.kind !== 'closed' && (
                <LeadComposer
                    ref={composerRef}
                    leadId={lead.id}
                    done={done}
                    viewingId={step.kind === 'viewing' && done ? viewing?.id ?? null : null}
                    onDoneEnd={() => setDone(false)}
                />
            )}
        </section>
    );
}

interface ComposerHandle { startDone: (asCall: boolean) => void }

/**
 * Тэмдэглэл, дуудлага, үнийн санал + «Дараа» (Маргааш / 3 хоног / 7 хоног / огноо, УБ-ийн 10:00).
 * ⌘↵ давтан дарахад нэг л бүртгэл илгээнэ (дуудлага, үнийн санал KPI-д тоологдоно).
 * «Өнөөдөр»-ийн «Дууссан» мөн үүнийг `done` горимд нээнэ (`initialCall`, `autoFocus`).
 */
export function LeadComposer({ ref, leadId, done, viewingId, onDoneEnd, initialCall = false, autoFocus = false }: {
    ref?: React.Ref<ComposerHandle>;
    leadId: string;
    done: boolean;
    /** «Дууссан» уулзалтын алхамд — уулзалтыг болсон гэж тэмдэглэнэ. */
    viewingId: string | null;
    onDoneEnd: () => void;
    /** Дуудлагын горимд эхлэх (өнөөдөр дуудлага бүртгэгдээгүй follow-up). */
    initialCall?: boolean;
    autoFocus?: boolean;
}) {
    const addActivity = useAddLeadActivity(leadId);
    const updateViewing = useUpdateViewing();
    const noteRef = useRef<HTMLTextAreaElement>(null);
    const [note, setNote] = useState('');
    const [isCall, setIsCall] = useState(initialCall);
    const [isQuote, setIsQuote] = useState(false);
    const [quoteAmount, setQuoteAmount] = useState('');
    const [quoteUnit, setQuoteUnit] = useState('');
    const [followup, setFollowup] = useState<Followup>(null);
    const [customAt, setCustomAt] = useState('');
    const savingRef = useRef(false);

    // «Дууссан» composer-ийг дуудлагын горимд нээж, үр дүнгийн талбарт аваачна.
    useImperativeHandle(ref, () => ({
        startDone: (asCall) => {
            setIsCall(asCall);
            setIsQuote(false);
            requestAnimationFrame(() => noteRef.current?.focus());
        },
    }), []);

    const amountValue = parseQuoteAmount(quoteAmount);
    const meeting = done && !!viewingId;
    const canSave = meeting || (isQuote ? amountValue !== null : !!note.trim() || isCall || (done && followup !== null));
    const reset = () => {
        setNote(''); setIsCall(false); setIsQuote(false); setQuoteAmount(''); setQuoteUnit(''); setFollowup(null); setCustomAt('');
        onDoneEnd();
    };

    const nextAt = (): string | null | undefined => {
        if (followup === 'custom') return customAt ? ubLocalToIso(customAt) : null;
        if (followup) return followupAtDays(followup);
        // «Дууссан»: шинэ алхам сонгоогүй бол дууссан алхмыг цэвэрлэнэ.
        return done ? null : undefined;
    };

    const save = async () => {
        if (!canSave || savingRef.current) return;
        const next = nextAt();
        if (followup === 'custom' && (!next || Date.parse(next) <= Date.now())) {
            toast.error('Дараагийн алхмын огноог одоогоос хойш сонгоно уу');
            return;
        }
        const content = note.trim();
        savingRef.current = true;
        try {
            if (meeting && viewingId) {
                const result = await updateViewing.mutateAsync({ id: viewingId, patch: { status: 'completed', customer_feedback: content || null, ...(next ? { next_followup_at: next } : {}) } });
                if (result?.warning) toast.warning(result.warning);
                else toast.success('Уулзалтын үр дүн бүртгэгдлээ');
            } else if (isQuote && amountValue !== null) {
                await addActivity.mutateAsync({ type: 'quote', amount: amountValue, unit_label: quoteUnit.trim() || null, content, next_followup_at: next });
                toast.success('Үнийн санал бүртгэгдлээ');
            } else {
                await addActivity.mutateAsync({ type: isCall ? 'call' : 'note', content: content || (isCall ? 'Залгав' : 'Алхам дууссан'), next_followup_at: next });
                toast.success(isCall ? 'Дуудлага бүртгэгдлээ' : 'Тэмдэглэл хадгалагдлаа');
            }
            reset();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Хадгалж чадсангүй');
        } finally {
            savingRef.current = false;
        }
    };

    const chip = (active: boolean) => cn(
        'inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition-colors',
        active ? 'border-brand bg-brand-soft text-brand-strong' : 'border-border text-fg-2 hover:border-border-strong hover:text-foreground',
    );

    return (
        <div className={cn('composer-box rounded-xl border bg-surface transition-colors', note || isCall || isQuote || done ? 'border-brand' : 'border-border')}>
            {done && (
                <p className="border-b border-border px-3 py-2 text-xs text-fg-2">
                    {meeting ? 'Уулзалт боллоо — харилцагчийн санал, дараагийн алхмаа бичнэ үү.' : 'Үр дүн, дараагийн алхмаа бүртгэнэ үү. Алхам сонгоогүй бол лид «Дараагийн алхамгүй» жагсаалтад орно.'}
                </p>
            )}
            {isQuote && !meeting && (
                <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
                    <label className="flex items-center gap-1.5 text-xs text-fg-2">
                        Дүн
                        <input
                            aria-label="Үнийн саналын дүн (₮)"
                            value={quoteAmount ? Number(quoteAmount).toLocaleString('en-US') : ''}
                            onChange={(e) => setQuoteAmount(e.target.value.replace(/[^0-9]/g, '').slice(0, 14))}
                            inputMode="numeric"
                            placeholder="450,000,000"
                            className="num h-8 w-36 rounded-lg border border-control bg-surface px-2 text-right text-sm text-foreground placeholder:text-muted-foreground"
                        />
                        <span>₮</span>
                    </label>
                    <input
                        aria-label="Байр/тоот (заавал биш)"
                        value={quoteUnit}
                        onChange={(e) => setQuoteUnit(e.target.value)}
                        maxLength={QUOTE_UNIT_MAX}
                        placeholder="Байр/тоот (заавал биш)"
                        className="h-8 min-w-0 flex-1 rounded-lg border border-control bg-surface px-2 text-sm text-foreground placeholder:text-muted-foreground"
                    />
                </div>
            )}
            <textarea
                aria-label={meeting ? 'Харилцагчийн санал' : 'Тэмдэглэл эсвэл дуудлагын үр дүн'}
                ref={noteRef}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !e.repeat) void save(); }}
                rows={2}
                autoFocus={autoFocus}
                placeholder={meeting ? 'Харилцагч юу гэж хэлсэн бэ?' : isQuote ? 'Саналын тайлбар (заавал биш)…' : 'Үр дүн, тэмдэглэл… (⌘↵ хадгална)'}
                className="block w-full resize-none bg-transparent px-3 pt-2.5 text-sm text-foreground placeholder:text-muted-foreground"
            />
            <div className="flex flex-wrap items-center gap-1.5 px-2.5 pb-2.5">
                {!meeting && (
                    <>
                        <button type="button" aria-pressed={isCall} onClick={() => { setIsCall((v) => !v); setIsQuote(false); }} className={chip(isCall)}>
                            <PhoneCall className="size-3.5" /> Залгав
                        </button>
                        <button type="button" aria-pressed={isQuote} onClick={() => { setIsQuote((v) => !v); setIsCall(false); }} className={chip(isQuote)}>
                            <BadgeDollarSign className="size-3.5" /> Үнийн санал
                        </button>
                    </>
                )}
                <span className="ml-1 text-xs text-muted-foreground">Дараа:</span>
                {FOLLOWUPS.map((f) => (
                    <button key={f.value} type="button" aria-pressed={followup === f.value} onClick={() => setFollowup(followup === f.value ? null : f.value)} className={chip(followup === f.value)}>
                        {f.value === 'custom' && <CalendarClock className="size-3.5" />}{f.label}
                    </button>
                ))}
                {followup === 'custom' && (
                    <input
                        type="datetime-local"
                        aria-label="Дараагийн алхмын огноо (Улаанбаатарын цагаар)"
                        value={customAt}
                        onChange={(e) => setCustomAt(e.target.value)}
                        className="h-8 rounded-lg border border-control bg-surface px-2 text-xs text-foreground"
                    />
                )}
                <div className="ml-auto flex items-center gap-1.5">
                    {done && <Button size="sm" variant="ghost" onClick={reset}>Болих</Button>}
                    <Button size="sm" disabled={addActivity.isPending || updateViewing.isPending || !canSave} onClick={() => void save()}>
                        <Check /> Хадгалах
                    </Button>
                </div>
            </div>
        </div>
    );
}
