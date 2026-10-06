'use client';

import React, { useRef, useState } from 'react';
import Link from 'next/link';
import { Phone, CalendarPlus, FileText, StickyNote, X, ExternalLink, PhoneCall, Check, UserPen, BadgeDollarSign } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { formatMNT } from '@/lib/utils/currency';
import { formatShortDate, formatTime, formatRelativeDays } from '@/lib/utils/date';
import { useLeadDetail, useUpdateLead, useAddLeadActivity, useLeadProjects, useLeadCategories, useManagers } from '@/hooks/useLeads';
import { INTEREST_CHIPS, sourceLabel, interestLabel, isAnonymousLead, leadDisplayName, normalizeLeadName } from '@/lib/leads/labels';
import { QUOTE_UNIT_MAX, parseQuoteAmount } from '@/lib/leads/quotes';
import { LeadTimeline } from './LeadTimeline';
import { propertyStatusLabel, propertyStatusTone } from '@/lib/inventory/labels';
import { Pill, Skeleton, GhostButton } from '@/components/dashboard/v2/primitives';
import { StatusPicker, ManagerPicker, CategoryPicker } from './pickers';
import { useRegisterAiContext } from '@/lib/ai/context';
import { LeadWorkActions } from './LeadWorkActions';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Лидийн хажуугийн панел — жагсаалтаас гаралгүй бүх ажлыг хийнэ:
 * статус/менежер/сонирхол/төсөв inline, уулзалт товлох, гэрээ үүсгэх,
 * тэмдэглэл + дуудлага бүртгэх, түүх, сонирхсон байр.
 * Дуудагч `key={leadId}`-тай mount хийнэ: лид солиход ноорог (тэмдэглэл, үнийн санал) болон
 * түүхийн шүүлтүүр өмнөх лидээс үлдэхгүй (кэшлэгдсэн лид skeleton-гүй шууд нээгддэг).
 */
export function LeadPanel({
    leadId,
    canWrite,
    onClose,
    onOpenLead,
    className,
}: {
    leadId: string;
    canWrite: boolean;
    onClose?: () => void;
    /** Ижил утастай өөр лидийг нээх (жагсаалтын сонголт). */
    onOpenLead?: (id: string) => void;
    className?: string;
}) {
    const { user } = useAuth();
    const { data, isLoading, isError, error, isFetching, refetch } = useLeadDetail(leadId);
    const update = useUpdateLead();
    const addActivity = useAddLeadActivity(leadId);
    const noteRef = useRef<HTMLTextAreaElement>(null);
    const [note, setNote] = useState('');
    const [isCall, setIsCall] = useState(false);
    // «Үнийн санал»: ₮ дүн (цифр) + байр/тоот — дуудлагатай зэрэг сонгогдохгүй.
    const [isQuote, setIsQuote] = useState(false);
    const [quoteAmount, setQuoteAmount] = useState('');
    const [quoteUnit, setQuoteUnit] = useState('');
    const [followup, setFollowup] = useState<number | null>(null); // хоног
    const [budgetDraft, setBudgetDraft] = useState<string | null>(null);
    const [nameDraft, setNameDraft] = useState<string | null>(null);

    const lead = data?.lead;
    const { data: managers = [] } = useManagers(lead?.project_id ?? null);
    const { data: projects = [] } = useLeadProjects();
    const { data: categories = [] } = useLeadCategories();
    // Shop = төсөл: ганц төсөлтэй бол зөвхөн төсөлгүй хуучин лидэд төсөл оноох сонголт гарна.
    const canEditProject = canWrite && (user?.role === 'admin' || user?.role === 'super_admin')
        && (projects.length > 1 || !lead?.project_id);
    useRegisterAiContext(lead ? { type: 'lead', id: lead.id, label: leadDisplayName(lead) } : null);

    const amountValue = parseQuoteAmount(quoteAmount);
    const canSave = isQuote ? amountValue !== null : !!note.trim() || isCall;
    // ⌘↵ давтан дарах/барих үед нэг бүртгэл л илгээнэ (дуудлага, үнийн санал KPI-д тоологдоно).
    const savingRef = useRef(false);
    const saveNote = async () => {
        const content = note.trim();
        if (!canSave || savingRef.current) return;
        savingRef.current = true;
        try {
            const next = followup ? new Date(Date.now() + followup * 86_400_000) : undefined;
            if (next) next.setHours(10, 0, 0, 0);
            const next_followup_at = next ? next.toISOString() : undefined;
            if (isQuote && amountValue !== null) {
                await addActivity.mutateAsync({ type: 'quote', amount: amountValue, unit_label: quoteUnit.trim() || null, content, next_followup_at });
            } else {
                await addActivity.mutateAsync({ type: isCall ? 'call' : 'note', content: content || 'Залгав', next_followup_at });
            }
            toast.success(isQuote ? 'Үнийн санал бүртгэгдлээ' : isCall ? 'Дуудлага бүртгэгдлээ' : 'Тэмдэглэл хадгалагдлаа');
            setNote(''); setIsCall(false); setIsQuote(false); setQuoteAmount(''); setQuoteUnit(''); setFollowup(null);
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Хадгалж чадсангүй');
        } finally {
            savingRef.current = false;
        }
    };

    const patch = (p: Parameters<typeof update.mutate>[0]['patch']) => update.mutate({ id: leadId, patch: p }, { onError: (e) => toast.error(e instanceof Error ? e.message : 'Алдаа') });

    if (isLoading) {
        return (
            <div className={cn('flex flex-col gap-3 p-4', className)}>
                <Skeleton className="h-6 w-48" /><Skeleton className="h-32" /><Skeleton className="h-9" /><Skeleton className="h-40" />
            </div>
        );
    }

    if (!lead) {
        return <div className={cn('p-4', className)}><Alert variant="danger">
            {isError && error instanceof Error ? error.message : 'Лидийн мэдээлэл олдсонгүй.'}
            <div className="flex gap-2">
                <Button size="sm" variant="secondary" disabled={isFetching} onClick={() => void refetch()}>Дахин оролдох</Button>
                {onClose && <Button size="sm" variant="secondary" onClick={onClose}>Хаах</Button>}
            </div>
        </Alert></div>;
    }
    const partialNames: Record<string, string> = { viewings: 'уулзалт', contracts: 'гэрээ', activities: 'түүх', timeline: 'менежерийн түүх', property: 'байр', property_names: 'байрны нэр' };

    const phoneDigits = lead.customer_phone?.replace(/\D/g, '') || '';
    const interestValue = INTEREST_CHIPS.find((c) => (c.rooms && c.rooms === lead.preferred_rooms) || (c.type && c.type === lead.preferred_type))?.label ?? '';
    const anonymous = isAnonymousLead(lead);
    // Нэр нэмэх/засах: хоосон эсвэл өөрчлөгдөөгүй бол юу ч илгээхгүй (нэрийг хоосолж болохгүй).
    // «-», «Нэргүй харилцагч» зэрэг орлуулагч нэр хадгалагдахгүй тул чимээгүй хаяхгүй, сануулна.
    const commitName = () => {
        if (nameDraft === null) return;
        const next = normalizeLeadName(nameDraft);
        setNameDraft(null);
        if (!next && nameDraft.trim()) { toast.error('Харилцагчийн жинхэнэ нэрийг оруулна уу. «-», «Нэргүй харилцагч» зэрэг орлуулагч нэр хадгалагдахгүй.'); return; }
        if (next && next !== normalizeLeadName(lead.customer_name)) patch({ customer_name: next });
    };

    return (
        <div className={cn('flex h-full min-h-0 flex-col', className)}>
            {/* Толгой */}
            <header className="flex h-[52px] shrink-0 items-center gap-2.5 border-b border-border px-4">
                {nameDraft !== null ? (
                    <input
                        aria-label="Харилцагчийн нэр"
                        data-inline-edit
                        autoFocus
                        value={nameDraft}
                        maxLength={200}
                        onChange={(e) => setNameDraft(e.target.value)}
                        onBlur={commitName}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') { e.preventDefault(); commitName(); }
                            if (e.key === 'Escape') { e.stopPropagation(); setNameDraft(null); } // Sheet хаагдахгүй: LeadsPage data-inline-edit-ийг алгасна
                        }}
                        placeholder="Ж: Г. Энхжин"
                        className="h-8 min-w-0 flex-1 rounded-md border border-brand bg-surface px-2 text-[14px] font-semibold text-foreground outline-none shadow-[0_0_0_3px_var(--brand-soft)] placeholder:font-normal placeholder:text-muted-foreground"
                    />
                ) : (
                    <h2 className={cn('min-w-0 truncate text-[16px] font-semibold', anonymous ? 'text-muted-foreground' : 'text-foreground')}>
                        {canWrite && !anonymous ? (
                            <button type="button" title="Нэр засах" onClick={() => setNameDraft(leadDisplayName(lead))} className="max-w-full truncate rounded-sm text-left hover:underline focus-ring">
                                {leadDisplayName(lead)}
                            </button>
                        ) : leadDisplayName(lead)}
                    </h2>
                )}
                {canWrite && anonymous && nameDraft === null && (
                    <GhostButton onClick={() => setNameDraft('')} className="shrink-0">
                        <UserPen className="h-3.5 w-3.5" /> Нэр нэмэх
                    </GhostButton>
                )}
                <StatusPicker value={lead.status} disabled={!canWrite} size="md" onChange={(s, reason) => patch({ status: s, ...(reason !== undefined ? { lost_reason: reason } : {}) })} />
                {onClose && (
                    <button type="button" onClick={onClose} className="ml-auto flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-surface-2 hover:text-foreground focus-ring" aria-label="Хаах">
                        <X className="h-4 w-4" />
                    </button>
                )}
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto">
                {(isError || !!data?.partial?.length) && <Alert variant="warning" className="m-3 w-auto">
                    {isError ? 'Мэдээллийг шинэчилж чадсангүй. Өмнө ачаалсан мэдээлэл харагдаж байна.' : `Дараах мэдээллийг ачаалж чадсангүй: ${data!.partial!.map((name) => partialNames[name] || name).join(', ')}. Түүх дутуу байж болно.`}
                    <Button size="sm" variant="secondary" disabled={isFetching} onClick={() => void refetch()}>Дахин оролдох</Button>
                </Alert>}
                <LeadWorkActions key={lead.id} lead={lead} canWrite={canWrite} />
                {/* Баримт */}
                <div className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-2 border-b border-border px-4 py-3 text-[12.5px]">
                    <Label>Төсөл</Label>
                    <div className="text-foreground">{canEditProject ? <select aria-label="Лидийн төсөл" value={lead.project_id ?? ''} onChange={e => { if (e.target.value) patch({ project_id: e.target.value, sales_manager_name: null }); }} className="h-7 max-w-full rounded-md border border-border bg-surface px-2 text-[12.5px] focus-ring">
                        <option value="" disabled>Төсөл тодорхойгүй</option>
                        {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select> : lead.project_id ? projects.find(p => p.id === lead.project_id)?.name || 'Төсөл' : 'Төсөл тодорхойгүй'}</div>
                    <Label>Утас</Label>
                    <div className="flex items-center gap-2">
                        <span className="mono-label text-foreground">{lead.customer_phone || '—'}</span>
                        {phoneDigits && <a href={`tel:${phoneDigits}`} className="flex h-6 w-6 items-center justify-center rounded-md text-brand-strong hover:bg-brand-soft" aria-label="Залгах"><Phone className="h-3.5 w-3.5" /></a>}
                    </div>
                    <Label>Эх үүсвэр</Label>
                    <div className="text-foreground">{sourceLabel(lead.source)}</div>
                    {(categories.length > 0 || !!lead.category_id) && <>
                        <Label>Ангилал</Label>
                        <div><CategoryPicker value={lead.category_id ?? null} options={categories} size="md" disabled={!canWrite} onChange={(id) => patch({ category_id: id })} /></div>
                    </>}
                    <Label>Сонирхол</Label>
                    <div>
                        {canWrite ? (
                            <select
                                aria-label="Сонирхол"
                                value={interestValue}
                                onChange={(e) => {
                                    const c = INTEREST_CHIPS.find((x) => x.label === e.target.value);
                                    patch({ preferred_rooms: c?.rooms ?? null, preferred_type: c?.type ?? (c ? null : lead.preferred_type) });
                                }}
                                className="-ml-1 h-6 rounded-md bg-transparent px-1 text-[12.5px] text-foreground outline-none hover:bg-surface-2 focus:bg-surface-2"
                            >
                                <option value="">{interestValue ? '—' : interestLabel(lead) === '—' ? '—' : interestLabel(lead)}</option>
                                {INTEREST_CHIPS.map((c) => <option key={c.label} value={c.label}>{c.label}</option>)}
                            </select>
                        ) : (
                            <span className="text-foreground">{interestLabel(lead)}</span>
                        )}
                        {lead.property_id && data?.property && <span className="mono-label ml-1 text-muted-foreground">· {data.property.name}</span>}
                    </div>
                    <Label>Төсөв</Label>
                    <div>
                        {canWrite ? (
                            <input
                                aria-label="Төсөв (₮)"
                                value={budgetDraft ?? (lead.budget_max ? String(lead.budget_max) : '')}
                                onFocus={() => setBudgetDraft(lead.budget_max ? String(lead.budget_max) : '')}
                                onChange={(e) => setBudgetDraft(e.target.value)}
                                onBlur={() => {
                                    if (budgetDraft === null) return;
                                    const n = Number(budgetDraft.replace(/\D/g, ''));
                                    const val = n > 0 ? n : null;
                                    if (val !== (lead.budget_max ?? null)) patch({ budget_max: val });
                                    setBudgetDraft(null);
                                }}
                                placeholder="—"
                                inputMode="numeric"
                                className="mono-label -ml-1 h-6 w-40 rounded-md bg-transparent px-1 text-[12.5px] text-foreground outline-none placeholder:text-muted-foreground hover:bg-surface-2 focus:bg-surface-2"
                            />
                        ) : (
                            <span className="mono-label text-foreground">{lead.budget_max ? formatMNT(lead.budget_max) : '—'}</span>
                        )}
                    </div>
                    <Label>Менежер</Label>
                    <div><ManagerPicker value={lead.sales_manager_name ?? null} options={managers} disabled={!canWrite || user?.role === 'sales_manager' || !lead.project_id} onChange={(n) => patch({ sales_manager_name: n })} />{!lead.project_id && <p className="mt-1 text-xs text-muted-foreground">Төслийг тодорхойлсны дараа менежер хуваарилна.</p>}</div>
                    <Label>Дараагийн алхам</Label>
                    <div className="text-foreground">{nextStep(lead)}</div>
                    <Label>Сүүлд холбогдсон</Label>
                    <div className="mono-label text-fg-2">{lead.last_contact_at ? formatRelativeDays(lead.last_contact_at) : 'Бүртгээгүй'}</div>
                </div>

                {/* Үйлдэл */}
                <div className="flex flex-wrap gap-2 border-b border-border px-4 py-3">
                    <Link href={`/dashboard/viewings?lead=${lead.id}&new=1`} className="inline-flex h-[30px] items-center gap-1.5 rounded-md bg-brand px-2.5 text-[12.5px] font-medium text-brand-fg hover:bg-brand-hover focus-ring">
                        <CalendarPlus className="h-4 w-4" /> Уулзалт товлох
                    </Link>
                    <button type="button" onClick={() => noteRef.current?.focus()} className="inline-flex h-[30px] items-center gap-1.5 rounded-md border border-border-strong bg-surface px-2.5 text-[12.5px] font-medium text-foreground hover:bg-surface-2 focus-ring">
                        <StickyNote className="h-4 w-4" /> Тэмдэглэл
                    </button>
                    <Link href={`/dashboard/contracts/generate?lead=${lead.id}`} className="inline-flex h-[30px] items-center gap-1.5 rounded-md border border-border-strong bg-surface px-2.5 text-[12.5px] font-medium text-foreground hover:bg-surface-2 focus-ring">
                        <FileText className="h-4 w-4" /> Гэрээ үүсгэх
                    </Link>
                </div>

                {/* Тэмдэглэл бичих */}
                {canWrite && (
                    <div className="border-b border-border px-4 py-3">
                        <div className={cn('rounded-md border bg-surface transition-shadow', note || isCall || isQuote ? 'border-brand shadow-[0_0_0_3px_var(--brand-soft)]' : 'border-border-strong')}>
                            {isQuote && (
                                <div className="flex flex-wrap items-center gap-2 border-b border-border px-2.5 py-2">
                                    <label className="flex items-center gap-1.5 text-[12px] text-fg-2">
                                        Дүн
                                        <input
                                            aria-label="Үнийн саналын дүн (₮)"
                                            value={quoteAmount ? Number(quoteAmount).toLocaleString('en-US') : ''}
                                            onChange={(e) => setQuoteAmount(e.target.value.replace(/[^0-9]/g, '').slice(0, 14))}
                                            inputMode="numeric"
                                            placeholder="450,000,000"
                                            className="num h-7 w-36 rounded-md border border-border bg-surface px-2 text-right text-[12.5px] text-foreground outline-none placeholder:text-muted-foreground focus-ring"
                                        />
                                        <span>₮</span>
                                    </label>
                                    <input
                                        aria-label="Байр/тоот (заавал биш)"
                                        value={quoteUnit}
                                        onChange={(e) => setQuoteUnit(e.target.value)}
                                        maxLength={QUOTE_UNIT_MAX}
                                        placeholder="Байр/тоот (заавал биш)"
                                        className="h-7 min-w-0 flex-1 rounded-md border border-border bg-surface px-2 text-[12.5px] text-foreground outline-none placeholder:text-muted-foreground focus-ring"
                                    />
                                </div>
                            )}
                            <textarea
                                aria-label="Тэмдэглэл эсвэл дуудлагын үр дүн"
                                ref={noteRef}
                                value={note}
                                onChange={(e) => setNote(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !e.repeat) void saveNote(); }}
                                rows={2}
                                placeholder={isQuote ? 'Саналын тайлбар (заавал биш)…' : 'Тэмдэглэл бичих… (⌘↵ хадгална)'}
                                className="w-full resize-none bg-transparent px-2.5 pt-2 text-[13px] outline-none placeholder:text-muted-foreground"
                            />
                            <div className="flex flex-wrap items-center gap-1.5 px-2 pb-2">
                                <button type="button" aria-pressed={isCall} onClick={() => { setIsCall((v) => !v); setIsQuote(false); }} className={cn('inline-flex h-6 items-center gap-1 rounded-md border px-2 text-[11.5px] focus-ring', isCall ? 'border-brand bg-brand-soft text-brand-strong' : 'border-border text-fg-2 hover:border-border-strong')}>
                                    <PhoneCall className="h-3 w-3" /> Залгав
                                </button>
                                <button type="button" aria-pressed={isQuote} onClick={() => { setIsQuote((v) => !v); setIsCall(false); }} className={cn('inline-flex h-6 items-center gap-1 rounded-md border px-2 text-[11.5px] focus-ring', isQuote ? 'border-brand bg-brand-soft text-brand-strong' : 'border-border text-fg-2 hover:border-border-strong')}>
                                    <BadgeDollarSign className="h-3 w-3" /> Үнийн санал
                                </button>
                                <span className="mx-1 text-[11px] text-muted-foreground">Дараа:</span>
                                {[1, 3, 7].map((d) => (
                                    <button key={d} type="button" onClick={() => setFollowup(followup === d ? null : d)} className={cn('h-6 rounded-md border px-2 text-[11.5px] focus-ring', followup === d ? 'border-brand bg-brand-soft text-brand-strong' : 'border-border text-fg-2 hover:border-border-strong')}>
                                        {d === 1 ? 'Маргааш' : `${d} хоног`}
                                    </button>
                                ))}
                                <button type="button" disabled={addActivity.isPending || !canSave} onClick={() => void saveNote()} className="ml-auto inline-flex h-7 items-center gap-1 rounded-md bg-brand px-2.5 text-[12px] font-medium text-brand-fg hover:bg-brand-hover disabled:opacity-50 focus-ring">
                                    <Check className="h-3.5 w-3.5" /> Хадгалах
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Түүх — менежерүүдийн Time-line */}
                {data && (
                    <div className="px-4 py-3">
                        <LeadTimeline key={data.lead.id} detail={data} onOpenLead={onOpenLead} />
                    </div>
                )}

                {/* Сонирхсон байр */}
                {(data?.property || (data?.viewings.some((v) => v.property_id && v.property_id !== data.property?.id) ?? false)) && (
                    <div className="border-t border-border px-4 py-3">
                        <div className="mb-2 text-[12.5px] font-semibold text-foreground">Сонирхсон байр</div>
                        <div className="flex flex-col gap-1">
                            {data?.property && (
                                <Link href={`/dashboard/properties/${data.property.id}`} className="flex items-center gap-3 rounded-md border border-border px-3 py-2 hover:bg-surface-2">
                                    <span className="mono-label text-[12.5px] text-foreground">{data.property.name}</span>
                                    {data.property.rooms && <span className="text-[12px] text-fg-2">{data.property.rooms} өрөө</span>}
                                    {data.property.size_sqm && <span className="mono-label text-[12px] text-fg-2">{data.property.size_sqm} м²</span>}
                                    <span className="num ml-auto text-[12.5px] text-foreground">{data.property.price ? formatMNT(data.property.price) : ''}</span>
                                    <Pill tone={propertyStatusTone(data.property.status)}>
                                        {propertyStatusLabel(data.property.status)}
                                    </Pill>
                                </Link>
                            )}
                            {data?.viewings.filter((v) => v.property_id && v.property_id !== data.property?.id).slice(0, 4).map((v) => (
                                <Link key={v.id} href={`/dashboard/properties/${v.property_id}`} className="flex items-center gap-3 rounded-md border border-border px-3 py-2 hover:bg-surface-2">
                                    <span className="mono-label text-[12.5px] text-foreground">{v.property_name || 'Байр'}</span>
                                    <span className="ml-auto text-[12px] text-muted-foreground">уулзалт · {formatShortDate(v.scheduled_at)}</span>
                                    <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                                </Link>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {lead.notes && (
                <div className="shrink-0 border-t border-border px-4 py-2 text-[12px] text-muted-foreground">
                    <span className="font-medium text-fg-2">Анхны тэмдэглэл: </span>{lead.notes}
                </div>
            )}
            <GhostButton className="hidden" aria-hidden />
        </div>
    );
}

function Label({ children }: { children: React.ReactNode }) {
    return <span className="pt-0.5 text-[12px] text-muted-foreground">{children}</span>;
}

export function nextStep(lead: { next_followup_at?: string | null; viewing_scheduled_at?: string | null; status: string }): string {
    const now = Date.now();
    if (lead.next_followup_at) {
        const d = new Date(lead.next_followup_at);
        const overdue = d.getTime() < now - 86_400_000;
        return `${overdue ? 'Залгах · хоцорсон' : 'Залгах'} ${isToday(d) ? formatTime(d) : formatShortDate(d)}`;
    }
    if (lead.viewing_scheduled_at && new Date(lead.viewing_scheduled_at).getTime() > now - 86_400_000) {
        const d = new Date(lead.viewing_scheduled_at);
        return `Уулзалт ${isToday(d) ? formatTime(d) : formatShortDate(d)}`;
    }
    if (lead.status === 'offered') return 'Хариу авах';
    if (lead.status === 'negotiating') return 'Хэлэлцээ үргэлжлүүлэх';
    if (lead.status === 'new') return 'Залгах';
    if (lead.status === 'closed_won') return 'Гэрээтэй';
    return '—';
}

function isToday(d: Date) {
    const n = new Date();
    return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
}
