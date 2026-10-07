'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { CalendarPlus, ExternalLink, FileText, Maximize2, MessageCircle, MoreHorizontal, Phone, UserPen, X } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { formatMNT } from '@/lib/utils/currency';
import { formatRelativeDays, formatShortDate } from '@/lib/utils/date';
import {
    useLeadCategories, useLeadCustomerCard, useLeadDetail, useLeadProjects, useManagers, useUpdateLead,
    type LeadDetail, type LeadRow,
} from '@/hooks/useLeads';
import { useModuleAccess } from '@/hooks/useModuleAccess';
import { useAuth } from '@/contexts/AuthContext';
import { useRegisterAiContext } from '@/lib/ai/context';
import { INTEREST_CHIPS, interestLabel, isAnonymousLead, leadDisplayName, normalizeLeadName, sourceLabel } from '@/lib/leads/labels';
import { propertyStatusLabel, propertyStatusTone } from '@/lib/inventory/labels';
import { Alert } from '@/components/ui/Alert';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { StatusPill } from '@/components/ui/StatusPill';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Tabs';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/Dropdown';
import { Skeleton } from '@/components/dashboard/v2/primitives';
import { CategoryPicker, ManagerPicker, StatusPicker } from './pickers';
import { LeadTimeline } from './LeadTimeline';
import { LeadWorkActions } from './LeadWorkActions';
import { NextStepBox } from './LeadComposer';
import { ContractsTab, MessagesTab, RecentFeed, ServiceLogsTab, mergeContracts, recentFeed } from './LeadCardSections';

/**
 * «Харилцагчийн карт» — нэг хүний бүх зүйл нэг дор: лид, дараагийн алхам ба үр дүн, түүх, мессеж,
 * гэрээ, санал гомдол (UI түвшинд нэгтгэнэ; хүснэгт, API, merge дүрэм хэвээр). Жагсаалтын хажуугийн
 * самбар (`panel`) ба бүтэн хуудас (`page`) хоёулаа энэ компонент. Эрхгүй хэсэг (мессеж, гэрээ,
 * санал гомдол) огт харагдахгүй. Дуудагч `key={leadId}`-тай mount хийнэ (лид солиход ноорог үлдэхгүй).
 */
export function LeadCard({
    leadId,
    canWrite,
    variant = 'panel',
    onClose,
    onOpenLead,
    className,
}: {
    leadId: string;
    canWrite: boolean;
    variant?: 'panel' | 'page';
    onClose?: () => void;
    /** Ижил утастай өөр лидийг нээх. */
    onOpenLead?: (id: string) => void;
    className?: string;
}) {
    const { data, isLoading, isError, error, isFetching, refetch } = useLeadDetail(leadId);
    const card = useLeadCustomerCard(leadId);
    const lead = data?.lead;
    useRegisterAiContext(lead ? { type: 'lead', id: lead.id, label: leadDisplayName(lead) } : null);

    if (isLoading) {
        return (
            <div className={cn('flex flex-col gap-3 p-5', className)} aria-busy="true">
                <Skeleton className="h-10 w-56" /><Skeleton className="h-8 w-40" /><Skeleton className="h-24" /><Skeleton className="h-40" />
            </div>
        );
    }
    if (!lead || !data) {
        return (
            <div className={cn('p-5', className)}>
                <Alert variant="danger">
                    {isError && error instanceof Error ? error.message : 'Лидийн мэдээлэл олдсонгүй.'}
                    <div className="flex gap-2">
                        <Button size="sm" variant="secondary" disabled={isFetching} onClick={() => void refetch()}>Дахин оролдох</Button>
                        {onClose && <Button size="sm" variant="secondary" onClick={onClose}>Хаах</Button>}
                    </div>
                </Alert>
            </div>
        );
    }

    const partialNames: Record<string, string> = { viewings: 'уулзалт', contracts: 'гэрээ', activities: 'түүх', timeline: 'менежерийн түүх', property: 'байр', property_names: 'байрны нэр' };
    const degraded = (isError || !!data.partial?.length) && (
        <Alert variant="warning">
            {isError ? 'Мэдээллийг шинэчилж чадсангүй. Өмнө ачаалсан мэдээлэл харагдаж байна.' : `Дараах мэдээллийг ачаалж чадсангүй: ${data.partial!.map((name) => partialNames[name] || name).join(', ')}. Түүх дутуу байж болно.`}
            <Button size="sm" variant="secondary" disabled={isFetching} onClick={() => void refetch()}>Дахин оролдох</Button>
        </Alert>
    );

    const summary = (
        <>
            <CardHeader lead={lead} canWrite={canWrite} variant={variant} onClose={onClose} />
            {degraded}
            <CardActions lead={lead} card={card.data} canWrite={canWrite} />
            {!lead.sales_manager_name && <LeadWorkActions key={lead.id} lead={lead} canWrite={canWrite} />}
            <NextStepBox lead={lead} detail={data} canWrite={canWrite} />
        </>
    );

    if (variant === 'page') {
        return (
            <div className={cn('grid items-start gap-6 xl:grid-cols-[400px_minmax(0,1fr)]', className)}>
                <div className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-5">
                    {summary}
                    <Facts lead={lead} detail={data} canWrite={canWrite} />
                </div>
                <div className="rounded-2xl border border-border bg-surface p-5">
                    <CardTabs detail={data} card={card} onOpenLead={onOpenLead} withOverview={false} />
                </div>
            </div>
        );
    }

    return (
        <div className={cn('flex h-full min-h-0 flex-col', className)}>
            <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-5">
                {summary}
                <CardTabs detail={data} card={card} onOpenLead={onOpenLead} withOverview canWrite={canWrite} />
            </div>
        </div>
    );
}

/* ── Толгой: нэр (inline засвар), утас, бүтэн хуудас, хаах ──────────────────────────── */

function CardHeader({ lead, canWrite, variant, onClose }: { lead: LeadRow; canWrite: boolean; variant: 'panel' | 'page'; onClose?: () => void }) {
    const update = useUpdateLead();
    const [nameDraft, setNameDraft] = useState<string | null>(null);
    const anonymous = isAnonymousLead(lead);
    const Heading = variant === 'page' ? 'h1' : 'h2';
    // Нэр нэмэх/засах: хоосон эсвэл өөрчлөгдөөгүй бол юу ч илгээхгүй (нэрийг хоосолж болохгүй).
    // «-», «Нэргүй харилцагч» зэрэг орлуулагч нэр хадгалагдахгүй тул чимээгүй хаяхгүй, сануулна.
    const commitName = () => {
        if (nameDraft === null) return;
        const next = normalizeLeadName(nameDraft);
        setNameDraft(null);
        if (!next && nameDraft.trim()) { toast.error('Харилцагчийн жинхэнэ нэрийг оруулна уу. «-», «Нэргүй харилцагч» зэрэг орлуулагч нэр хадгалагдахгүй.'); return; }
        if (next && next !== normalizeLeadName(lead.customer_name)) {
            update.mutate({ id: lead.id, patch: { customer_name: next } }, { onError: (e) => toast.error(e instanceof Error ? e.message : 'Алдаа') });
        }
    };

    return (
        <header className="flex items-start gap-3">
            <Avatar name={anonymous ? null : leadDisplayName(lead)} size="lg" />
            <div className="min-w-0 flex-1">
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
                            if (e.key === 'Escape') { e.stopPropagation(); setNameDraft(null); }
                        }}
                        placeholder="Ж: Г. Энхжин"
                        className="h-9 w-full rounded-lg border border-control bg-surface px-2 text-base font-semibold text-foreground placeholder:font-normal placeholder:text-muted-foreground"
                    />
                ) : (
                    <Heading className={cn('truncate text-lg font-semibold leading-tight', anonymous ? 'text-muted-foreground' : 'text-foreground')}>
                        {canWrite && !anonymous ? (
                            <button type="button" title="Нэр засах" onClick={() => setNameDraft(leadDisplayName(lead))} className="max-w-full truncate rounded-sm text-left hover:underline">
                                {leadDisplayName(lead)}
                            </button>
                        ) : leadDisplayName(lead)}
                    </Heading>
                )}
                <p className="num mt-0.5 text-sm text-fg-2">{lead.customer_phone || 'Утасгүй'}</p>
                {canWrite && anonymous && nameDraft === null && (
                    <Button size="sm" variant="ghost" className="-ml-2 mt-1" onClick={() => setNameDraft('')}>
                        <UserPen /> Нэр нэмэх
                    </Button>
                )}
            </div>
            {variant === 'panel' && (
                <div className="flex shrink-0 items-center gap-1">
                    <Button href={`/dashboard/leads/${lead.id}`} variant="ghost" size="iconSm" aria-label="Бүтэн хуудсаар нээх" title="Бүтэн хуудсаар нээх">
                        <Maximize2 />
                    </Button>
                    {onClose && (
                        <Button variant="ghost" size="iconSm" onClick={onClose} aria-label="Хаах" title="Хаах (Esc)">
                            <X />
                        </Button>
                    )}
                </div>
            )}
        </header>
    );
}

/* ── Үндсэн үйлдэл: төлөв, залгах, уулзалт, бусад ──────────────────────────────────── */

function CardActions({ lead, card, canWrite: writer }: { lead: LeadRow; card?: ReturnType<typeof useLeadCustomerCard>['data']; canWrite: boolean }) {
    const update = useUpdateLead();
    const phoneDigits = lead.customer_phone?.replace(/\D/g, '') || '';
    const conversation = card?.messages?.customerId;
    return (
        <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-1.5">
                <StatusPicker value={lead.status} disabled={!writer} size="md" onChange={(s, reason) => update.mutate({ id: lead.id, patch: { status: s, ...(reason !== undefined ? { lost_reason: reason } : {}) } }, { onError: (e) => toast.error(e instanceof Error ? e.message : 'Алдаа') })} />
                <StatusPill variant="neutral">{sourceLabel(lead.source)}</StatusPill>
            </div>
            <div className="flex items-center gap-2">
                {phoneDigits
                    ? <Button href={`tel:${phoneDigits}`} size="sm" className="flex-1"><Phone /> Залгах</Button>
                    : <Button size="sm" className="flex-1" disabled><Phone /> Утасгүй</Button>}
                {writer && <Button href={`/dashboard/viewings?lead=${lead.id}&new=1`} size="sm" variant="secondary" className="flex-1"><CalendarPlus /> Уулзалт товлох</Button>}
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button size="iconSm" variant="secondary" aria-label="Бусад үйлдэл"><MoreHorizontal /></Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-52">
                        {writer && <DropdownMenuItem asChild><Link href={`/dashboard/contracts/generate?lead=${lead.id}`}><FileText /> Гэрээ үүсгэх</Link></DropdownMenuItem>}
                        {conversation && <DropdownMenuItem asChild><Link href={`/dashboard/inbox/messages?conversation=${encodeURIComponent(conversation)}`}><MessageCircle /> Мессеж рүү очих</Link></DropdownMenuItem>}
                        <DropdownMenuItem asChild><Link href={`/dashboard/leads/${lead.id}`}><ExternalLink /> Бүтэн хуудсаар нээх</Link></DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
        </div>
    );
}

/* ── Табууд ────────────────────────────────────────────────────────────────────────── */

function CardTabs({ detail, card, onOpenLead, withOverview, canWrite = false }: {
    detail: LeadDetail;
    card: ReturnType<typeof useLeadCustomerCard>;
    onOpenLead?: (id: string) => void;
    withOverview: boolean;
    canWrite?: boolean;
}) {
    const { can } = useModuleAccess();
    const extra = card.data;
    // Картын endpoint эрхийг серверт шалгадаг; ачаалагдаагүй үед модулийн эрхээр таамаглана.
    const showMessages = extra ? extra.access.inbox : can('inbox');
    const showService = extra ? extra.access.serviceLogs : can('customer-service');
    const failed = (name: string) => card.isError || !!extra?.partial.includes(name);
    const contracts = mergeContracts(detail, extra);
    const historyCount = detail.timeline ? detail.timeline.events.length : detail.activities.length;
    const messageCount = extra?.messages?.items.length ?? 0;
    const serviceCount = extra?.serviceLogs.length ?? 0;
    const count = (n: number) => n > 0 && <span className="num text-xs text-muted-foreground">{n}</span>;

    return (
        <Tabs defaultValue={withOverview ? 'overview' : 'history'} className="gap-4">
            <TabsList variant="line" className="no-scrollbar w-full justify-start gap-3 overflow-x-auto overflow-y-hidden border-b border-border">
                {withOverview && <TabsTrigger value="overview" className="flex-none px-1">Тойм</TabsTrigger>}
                <TabsTrigger value="history" className="flex-none px-1">Түүх {count(historyCount)}</TabsTrigger>
                {showMessages && <TabsTrigger value="messages" className="flex-none px-1">Мессеж {count(messageCount)}</TabsTrigger>}
                <TabsTrigger value="contracts" className="flex-none px-1">Гэрээ {count(contracts.length)}</TabsTrigger>
                {showService && <TabsTrigger value="service" className="flex-none px-1">Санал гомдол {count(serviceCount)}</TabsTrigger>}
            </TabsList>
            {withOverview && (
                <TabsContent value="overview" className="flex flex-col gap-5">
                    <Facts lead={detail.lead} detail={detail} canWrite={canWrite} />
                    <div>
                        <h3 className="mb-3 text-xs font-medium text-muted-foreground">Сүүлийн үйл явдал</h3>
                        <RecentFeed items={recentFeed(detail, extra)} />
                    </div>
                </TabsContent>
            )}
            <TabsContent value="history">
                <LeadTimeline key={detail.lead.id} detail={detail} onOpenLead={onOpenLead} />
            </TabsContent>
            {showMessages && (
                <TabsContent value="messages">
                    <MessagesTab messages={extra?.messages ?? null} failed={failed('messages') || failed('customer')} />
                </TabsContent>
            )}
            <TabsContent value="contracts">
                <ContractsTab contracts={contracts} failed={!!extra?.access.contracts && failed('contracts')} canOpen={can('contracts')} />
            </TabsContent>
            {showService && (
                <TabsContent value="service">
                    <ServiceLogsTab logs={extra?.serviceLogs ?? []} failed={failed('serviceLogs') || failed('customer')} />
                </TabsContent>
            )}
        </Tabs>
    );
}

/* ── Баримт: төсөл, эх үүсвэр, ангилал, сонирхол, төсөв, хариуцагч ─────────────────── */

function Facts({ lead, detail, canWrite }: { lead: LeadRow; detail: LeadDetail; canWrite: boolean }) {
    const { user } = useAuth();
    const update = useUpdateLead();
    const { data: managers = [] } = useManagers(lead.project_id ?? null);
    const { data: projects = [] } = useLeadProjects();
    const { data: categories = [] } = useLeadCategories();
    const [budgetDraft, setBudgetDraft] = useState<string | null>(null);
    // Shop = төсөл: ганц төсөлтэй бол зөвхөн төсөлгүй хуучин лидэд төсөл оноох сонголт гарна.
    const canEditProject = canWrite && (user?.role === 'admin' || user?.role === 'super_admin') && (projects.length > 1 || !lead.project_id);
    const patch = (p: Parameters<typeof update.mutate>[0]['patch']) => update.mutate({ id: lead.id, patch: p }, { onError: (e) => toast.error(e instanceof Error ? e.message : 'Алдаа') });
    const interestValue = INTEREST_CHIPS.find((c) => (c.rooms && c.rooms === lead.preferred_rooms) || (c.type && c.type === lead.preferred_type))?.label ?? '';
    const inline = 'h-8 -ml-2 rounded-lg bg-transparent px-2 text-sm text-foreground hover:bg-surface-2 focus:bg-surface-2';

    return (
        <div className="flex flex-col gap-4">
            <dl className="grid grid-cols-[136px_minmax(0,1fr)] items-center gap-x-3 gap-y-1.5 text-sm">
                <dt className="text-muted-foreground">Төсөл</dt>
                <dd className="min-w-0 text-foreground">
                    {canEditProject ? (
                        <select aria-label="Лидийн төсөл" value={lead.project_id ?? ''} onChange={(e) => { if (e.target.value) patch({ project_id: e.target.value, sales_manager_name: null }); }} className="h-8 max-w-full rounded-lg border border-control bg-surface px-2 text-sm">
                            <option value="" disabled>Төсөл тодорхойгүй</option>
                            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                    ) : lead.project_id ? projects.find((p) => p.id === lead.project_id)?.name || 'Төсөл' : 'Төсөл тодорхойгүй'}
                </dd>
                <dt className="text-muted-foreground">Хариуцагч</dt>
                <dd className="min-w-0">
                    <ManagerPicker value={lead.sales_manager_name ?? null} options={managers} disabled={!canWrite || user?.role === 'sales_manager' || !lead.project_id} onChange={(n) => patch({ sales_manager_name: n })} />
                    {!lead.project_id && <p className="mt-1 text-xs text-muted-foreground">Төслийг тодорхойлсны дараа менежер хуваарилна.</p>}
                </dd>
                {(categories.length > 0 || !!lead.category_id) && <>
                    <dt className="text-muted-foreground">Ангилал</dt>
                    <dd><CategoryPicker value={lead.category_id ?? null} options={categories} size="md" disabled={!canWrite} onChange={(id) => patch({ category_id: id })} /></dd>
                </>}
                <dt className="text-muted-foreground">Сонирхол</dt>
                <dd>
                    {canWrite ? (
                        <select
                            aria-label="Сонирхол"
                            value={interestValue}
                            onChange={(e) => {
                                const c = INTEREST_CHIPS.find((x) => x.label === e.target.value);
                                patch({ preferred_rooms: c?.rooms ?? null, preferred_type: c?.type ?? (c ? null : lead.preferred_type) });
                            }}
                            className={inline}
                        >
                            <option value="">{interestValue ? '—' : interestLabel(lead)}</option>
                            {INTEREST_CHIPS.map((c) => <option key={c.label} value={c.label}>{c.label}</option>)}
                        </select>
                    ) : <span className="text-foreground">{interestLabel(lead)}</span>}
                </dd>
                <dt className="text-muted-foreground">Төсөв</dt>
                <dd>
                    {canWrite ? (
                        <input
                            aria-label="Төсөв (₮)"
                            value={budgetDraft ?? (lead.budget_max ? `${lead.budget_max.toLocaleString('en-US')} ₮` : '')}
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
                            className={cn('num w-44', inline)}
                        />
                    ) : <span className="num text-foreground">{lead.budget_max ? formatMNT(lead.budget_max) : '—'}</span>}
                </dd>
                <dt className="text-muted-foreground">Сүүлд холбогдсон</dt>
                <dd className="text-fg-2">{lead.last_contact_at ? formatRelativeDays(lead.last_contact_at) : 'Бүртгээгүй'}</dd>
                <dt className="text-muted-foreground">Бүртгэсэн</dt>
                <dd className="text-fg-2">{formatShortDate(lead.created_at)}</dd>
            </dl>

            {(detail.property || detail.viewings.some((v) => v.property_id && v.property_id !== detail.property?.id)) && (
                <div>
                    <h3 className="mb-2 text-xs font-medium text-muted-foreground">Сонирхсон байр</h3>
                    <div className="flex flex-col gap-1.5">
                        {detail.property && (
                            <Link href={`/dashboard/properties/${detail.property.id}`} className="flex items-center gap-3 rounded-lg border border-border px-3 py-2 text-sm hover:bg-surface-2">
                                <span className="font-medium text-foreground">{detail.property.name}</span>
                                {detail.property.rooms && <span className="text-fg-2">{detail.property.rooms} өрөө</span>}
                                <span className="num ml-auto text-foreground">{detail.property.price ? formatMNT(detail.property.price) : ''}</span>
                                <StatusPill variant={propertyStatusTone(detail.property.status)}>{propertyStatusLabel(detail.property.status)}</StatusPill>
                            </Link>
                        )}
                        {detail.viewings.filter((v) => v.property_id && v.property_id !== detail.property?.id).slice(0, 4).map((v) => (
                            <Link key={v.id} href={`/dashboard/properties/${v.property_id}`} className="flex items-center gap-3 rounded-lg border border-border px-3 py-2 text-sm hover:bg-surface-2">
                                <span className="text-foreground">{v.property_name || 'Байр'}</span>
                                <span className="ml-auto text-xs text-muted-foreground">уулзалт · {formatShortDate(v.scheduled_at)}</span>
                            </Link>
                        ))}
                    </div>
                </div>
            )}

            {lead.notes && (
                <p className="rounded-lg bg-surface-2 px-3 py-2.5 text-xs text-fg-2">
                    <span className="font-medium text-foreground">Анхны тэмдэглэл: </span>{lead.notes}
                </p>
            )}
        </div>
    );
}
