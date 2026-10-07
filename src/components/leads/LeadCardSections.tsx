'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, CalendarCheck, CircleDot, FileSignature, LifeBuoy, MessageCircle, PhoneCall, Sparkles, StickyNote, BadgeDollarSign, UserCheck, ArrowRightLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatMNT } from '@/lib/utils/currency';
import { formatShortDate, formatTime } from '@/lib/utils/date';
import { contractStatusLabel } from '@/lib/contracts/labels';
import { SERVICE_LOG_STATUS_META, serviceLogTypeLabel, type ServiceLogStatus } from '@/lib/service-logs/labels';
import { slaState } from '@/lib/service-logs/sla';
import type { LeadDetail } from '@/hooks/useLeads';
import type { CardContract, CardMessages, CardServiceLog, LeadCustomerCard } from '@/lib/leads/customer-card-load';
import type { TimelineKind } from '@/lib/leads/timeline';
import { StatusPill } from '@/components/ui/StatusPill';

const MESSAGE_WINDOW_MS = 24 * 60 * 60 * 1000;

const when = (iso: string) => `${formatShortDate(iso)} ${formatTime(iso)}`;

function SectionNote({ children, tone = 'muted' }: { children: React.ReactNode; tone?: 'muted' | 'warning' }) {
    return (
        <p role="status" className={cn('rounded-lg px-3 py-2.5 text-xs', tone === 'warning' ? 'bg-status-pending-soft text-status-pending' : 'bg-surface-2 text-muted-foreground')}>
            {children}
        </p>
    );
}

/* ── Сүүлийн үйл явдал: лидийн түүх + мессеж + санал гомдол нэг урсгалд ─────────────── */

const KIND_ICON: Record<TimelineKind, React.ComponentType<{ className?: string }>> = {
    created: Sparkles, assigned: UserCheck, claimed: UserCheck, call: PhoneCall, note: StickyNote,
    meeting: CalendarCheck, status: ArrowRightLeft, quote: BadgeDollarSign, contract: FileSignature, system: CircleDot,
};

interface FeedItem { id: string; at: string; icon: React.ComponentType<{ className?: string }>; title: string; meta: string | null; detail: string | null }

export function recentFeed(detail: LeadDetail, card: LeadCustomerCard | undefined, limit = 5): FeedItem[] {
    const items: FeedItem[] = [];
    if (detail.timeline) {
        for (const e of detail.timeline.events) items.push({ id: e.id, at: e.at, icon: KIND_ICON[e.kind] ?? CircleDot, title: e.title, meta: e.actor, detail: e.detail });
    } else {
        for (const a of detail.activities) items.push({ id: a.id, at: a.created_at, icon: a.type === 'call' ? PhoneCall : StickyNote, title: a.type === 'call' ? 'Залгасан' : 'Тэмдэглэл', meta: a.created_by_name ?? null, detail: a.content ?? null });
    }
    for (const [i, m] of (card?.messages?.items ?? []).entries()) {
        if (m.from !== 'customer') continue;
        items.push({ id: `message:${i}`, at: m.at, icon: MessageCircle, title: card?.messages?.channel === 'instagram' ? 'Instagram' : 'Messenger', meta: null, detail: m.text });
    }
    for (const s of card?.serviceLogs ?? []) items.push({ id: `service:${s.id}`, at: s.created_at, icon: LifeBuoy, title: `Санал гомдол · ${serviceLogTypeLabel(s.type)}`, meta: s.manager_name, detail: s.subject });
    return items.sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
}

export function RecentFeed({ items }: { items: FeedItem[] }) {
    if (!items.length) return <SectionNote>Одоогоор бүртгэгдсэн үйл явдал алга.</SectionNote>;
    return (
        <ol aria-label="Сүүлийн үйл явдал" className="space-y-3">
            {items.map((item) => (
                <li key={item.id} className="flex gap-3">
                    <span aria-hidden className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-surface-2 text-fg-2">
                        <item.icon className="size-3.5" />
                    </span>
                    <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground">{item.title}</p>
                        <p className="text-xs text-muted-foreground">{when(item.at)}{item.meta ? ` · ${item.meta}` : ''}</p>
                        {item.detail && <p className="mt-0.5 line-clamp-2 text-xs text-fg-2">«{item.detail}»</p>}
                    </div>
                </li>
            ))}
        </ol>
    );
}

/* ── Мессеж ───────────────────────────────────────────────────────────────────────── */

export function MessagesTab({ messages, failed }: { messages: CardMessages | null; failed: boolean }) {
    // Таб нээгдэх үеийн цаг — 24 цагийн цонхыг render бүрт дахин тооцохгүй.
    const [now] = useState(() => Date.now());
    if (failed) return <SectionNote tone="warning">Мессежийг ачаалж чадсангүй. Дахин нээж үзнэ үү.</SectionNote>;
    if (!messages) return <SectionNote>Энэ утастай харилцагч Messenger, Instagram-аар бичээгүй байна.</SectionNote>;
    const last = messages.lastCustomerAt ? Date.parse(messages.lastCustomerAt) : null;
    const open = last !== null && now - last < MESSAGE_WINDOW_MS;
    const hoursLeft = last !== null ? Math.max(0, Math.ceil((last + MESSAGE_WINDOW_MS - now) / 3_600_000)) : 0;
    return (
        <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
                {messages.channel === 'messenger' ? (
                    open
                        ? <StatusPill variant="success">Хариулах боломжтой · {hoursLeft} цаг үлдсэн</StatusPill>
                        : <StatusPill variant="neutral">24 цаг өнгөрсөн — Meta-гийн дүрмээр хариулахгүй</StatusPill>
                ) : <StatusPill variant="neutral">Instagram — хариуг Instagram-аас бичнэ</StatusPill>}
                <Link href={`/dashboard/inbox/messages?conversation=${encodeURIComponent(messages.customerId)}`} className="inline-flex items-center gap-1 text-xs font-medium text-brand-strong hover:underline">
                    Мессеж рүү очих <ArrowUpRight className="size-3.5" />
                </Link>
            </div>
            {messages.items.length === 0 ? <SectionNote>Мессеж алга.</SectionNote> : (
                <ol role="log" aria-label="Харилцагчийн мессеж" className="space-y-2">
                    {messages.items.map((m, i) => (
                        <li key={i} className={cn('flex flex-col gap-0.5', m.from === 'customer' ? 'items-start' : 'items-end')}>
                            <span className={cn('max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm', m.from === 'customer' ? 'rounded-bl-md bg-surface-2 text-foreground' : m.from === 'staff' ? 'rounded-br-md bg-brand-soft text-foreground' : 'rounded-br-md border border-border text-fg-2')}>
                                {m.text}
                            </span>
                            <span className="text-xs text-muted-foreground">{m.from === 'customer' ? 'Харилцагч' : m.from === 'staff' ? 'Ажилтан' : 'Автомат'} · {when(m.at)}</span>
                        </li>
                    ))}
                </ol>
            )}
        </div>
    );
}

/* ── Гэрээ ────────────────────────────────────────────────────────────────────────── */

type ContractRow = Pick<CardContract, 'id' | 'contract_number' | 'contract_status' | 'contract_date' | 'total_price' | 'paid_amount' | 'balance' | 'unit_number' | 'block_name'> & { matched_by?: CardContract['matched_by'] };

/** Лидийн гэрээ (lead_id) ба ижил утастай гэрээг нэгтгэнэ — давхардлыг id-аар хасна. */
export function mergeContracts(detail: LeadDetail, card: LeadCustomerCard | undefined): ContractRow[] {
    const rows = new Map<string, ContractRow>();
    for (const c of detail.contracts) rows.set(c.id, { ...c, matched_by: 'lead' });
    for (const c of card?.contracts ?? []) if (!rows.has(c.id)) rows.set(c.id, c);
    return [...rows.values()].sort((a, b) => (b.contract_date ?? '').localeCompare(a.contract_date ?? ''));
}

export function ContractsTab({ contracts, failed, canOpen }: { contracts: ContractRow[]; failed: boolean; canOpen: boolean }) {
    return (
        <div className="space-y-2">
            {failed && <SectionNote tone="warning">Ижил утастай гэрээг хайж чадсангүй — зөвхөн лидэд холбогдсон гэрээ харагдаж байна.</SectionNote>}
            {contracts.length === 0 && !failed && <SectionNote>Энэ харилцагчид гэрээ бүртгэгдээгүй байна.</SectionNote>}
            {contracts.map((c) => {
                const unit = [c.block_name, c.unit_number].filter(Boolean).join('-');
                const body = (
                    <>
                        <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-medium text-foreground">{c.contract_number || 'Дугааргүй гэрээ'}{unit ? ` · ${unit}` : ''}</span>
                            <StatusPill variant={c.contract_status === 'active' ? 'success' : 'neutral'}>{contractStatusLabel(c.contract_status)}</StatusPill>
                        </div>
                        <dl className="mt-2 grid grid-cols-3 gap-2 text-xs">
                            <div><dt className="text-muted-foreground">Үнэ</dt><dd className="num text-foreground">{formatMNT(c.total_price)}</dd></div>
                            {/* Төлсөн дүн тодорхойгүй (NULL) бол 0 биш «—». */}
                            <div><dt className="text-muted-foreground">Төлсөн</dt><dd className="num text-foreground">{formatMNT(c.paid_amount)}</dd></div>
                            <div><dt className="text-muted-foreground">Үлдэгдэл</dt><dd className="num text-foreground">{formatMNT(c.balance)}</dd></div>
                        </dl>
                        <p className="mt-1.5 text-xs text-muted-foreground">
                            {c.contract_date ? formatShortDate(c.contract_date) : 'Огноогүй'}{c.matched_by === 'phone' ? ' · утсаар таарсан' : ''}
                        </p>
                    </>
                );
                return canOpen
                    ? <Link key={c.id} href={`/dashboard/contracts/${c.id}`} className="block rounded-xl border border-border p-3 transition-colors hover:bg-surface-2">{body}</Link>
                    : <div key={c.id} className="rounded-xl border border-border p-3">{body}</div>;
            })}
        </div>
    );
}

/* ── Санал гомдол ─────────────────────────────────────────────────────────────────── */

export function ServiceLogsTab({ logs, failed }: { logs: CardServiceLog[]; failed: boolean }) {
    if (failed) return <SectionNote tone="warning">Санал гомдлыг ачаалж чадсангүй.</SectionNote>;
    const now = new Date();
    return (
        <div className="space-y-2">
            {logs.length === 0 && <SectionNote>Энэ харилцагчаас санал гомдол бүртгэгдээгүй байна.</SectionNote>}
            {logs.map((s) => {
                const meta = SERVICE_LOG_STATUS_META[s.status as ServiceLogStatus];
                const sla = slaState({ priority: s.priority, created_at: s.created_at, status: s.status, resolved_at: s.resolved_at }, now);
                return (
                    <div key={s.id} className="rounded-xl border border-border p-3">
                        <div className="flex items-center justify-between gap-2">
                            <span className="min-w-0 truncate text-sm font-medium text-foreground">{s.subject || serviceLogTypeLabel(s.type)}</span>
                            <StatusPill variant={meta?.tone ?? 'neutral'}>{meta?.label ?? s.status ?? '—'}</StatusPill>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                            {serviceLogTypeLabel(s.type)} · {when(s.created_at)}{s.manager_name ? ` · ${s.manager_name}` : ''}
                            {sla?.kind === 'overdue' && <span className="text-status-danger"> · хугацаа хэтэрсэн</span>}
                        </p>
                    </div>
                );
            })}
            <Link href="/dashboard/customer-service" className="inline-flex items-center gap-1 text-xs font-medium text-brand-strong hover:underline">
                Санал гомдол хуудас <ArrowUpRight className="size-3.5" />
            </Link>
        </div>
    );
}
