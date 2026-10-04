/**
 * Лидийн менежерүүдийн Time-line — client-safe, pure (2026-10-04 уулзалт, №5).
 *
 * Нэг лидэд хэн, хэзээ холбогдсон (дуудлага, уулзалт, үнийн санал), хэн хариуцагч байсныг
 * дарааллаар нь гаргаж, менежер бүрийн товчоо ба зөрчлийн сануулгыг тооцно. Зөвхөн
 * тэмдэглэнэ — хэнийг ч хаахгүй (хязгаарлагдсан менежерийг RPC аль хэдийн хаадаг).
 *
 * • Менежерт оноох: lead_activities.created_by → sales_managers.user_id, дараа нь бүртгэлийн нэртэй
 *   яг таарсан created_by_name (KPI-ийн `attributeCall`-тай ижил дүрэм). Таараагүй (админ, бусад
 *   ажилтан) үйлдэл түүхэнд нэрээрээ харагдах ч менежерийн товчоо, зөрчилд орохгүй.
 * • Холбоо барилт = дуудлага, уулзалт (цуцалсан/ирээгүйгээс бусад), үнийн санал. Тэмдэглэл харагдана,
 *   зөрчил үүсгэхгүй. Үнийн санал гэрээний дүн, орлого биш.
 * • Хариуцагчийг 'manager' үйлдлүүдээс ({from,to} эсвэл {action:'claim',to}) сэргээнэ; үйлдэлгүй бол
 *   лидийн одоогийн хариуцагч.
 * • Зөрчил: хариуцагч биш менежер холбогдсон; TIMELINE_CONFLICT_WINDOW_DAYS хоногт 2+ менежер
 *   холбогдсон; ижил байр/тоотод менежерүүдийн сүүлийн үнийн санал зөрүүтэй; ижил утастай өөр
 *   менежерийн лид.
 * • Хуучин (үйлдлийн түүхгүй) уулзалт property_viewings-ээс, гэрээ property_contracts-оос нэмэгдэнэ.
 */
import { attributeCall, type ActivityRosterEntry } from '@/lib/sales/activity';
import { hasRealContractFields } from '@/lib/leads/contracts';
import { sourceLabel, statusLabel } from '@/lib/leads/labels';
import { quoteContent, quoteUnitKey } from '@/lib/leads/quotes';
import { formatMNT } from '@/lib/utils/currency';
import { UB_OFFSET_MS, ubDateStr } from '@/lib/utils/date';

/** «Зэрэг холбогдсон» гэж үзэх хугацаа (хоног) — нэг тогтмол. */
export const TIMELINE_CONFLICT_WINDOW_DAYS = 14;
const WINDOW_MS = TIMELINE_CONFLICT_WINDOW_DAYS * 86_400_000;

export type TimelineKind =
    | 'created' | 'assigned' | 'claimed' | 'call' | 'note' | 'meeting' | 'status' | 'quote' | 'contract' | 'system';
export type TimelineSource = 'activity' | 'viewing' | 'contract' | 'lead';

export interface TimelineEvent {
    id: string;
    /** ISO timestamp. */
    at: string;
    /** Гэрээний огноо (DATE) — цаггүй. */
    dateOnly: boolean;
    kind: TimelineKind;
    /** Хэн бүртгэсэн (менежерийн канон нэр, ажилтны нэр эсвэл null). */
    actor: string | null;
    /** Товчоо, зөрчилд тооцох бүртгэлийн менежер (админ/бусад ажилтан бол null). */
    manager: string | null;
    /** Тухайн үеийн хариуцагч (хариуцагч солигдсон үйлдэлд — шинэ хариуцагч). */
    owner: string | null;
    /** Хариуцагч биш менежерийн холбоо барилт. */
    offOwner: boolean;
    /** Дуудлага / уулзалт / үнийн санал. */
    contact: boolean;
    title: string;
    detail: string | null;
    amount: number | null;
    unitLabel: string | null;
    scheduledAt: string | null;
    /** Уулзалтын property_viewings.id (нэг уулзалтын товлох/болсон үйлдлийг нэг уулзалт гэж тоолно). */
    viewingId: string | null;
    ownerChange: { from: string | null; to: string | null } | null;
    source: TimelineSource;
}

export interface TimelineManager {
    name: string;
    isOwner: boolean;
    isActive: boolean;
    /** Анхны / сүүлийн холбоо барилт (холбогдоогүй бол null). */
    firstAt: string | null;
    lastAt: string | null;
    calls: number;
    meetings: number;
    quotes: number;
    notes: number;
    lastQuote: { amount: number; unitLabel: string | null; at: string } | null;
}

export type TimelineConflictKind = 'quote_mismatch' | 'duplicate_phone' | 'non_owner_contact' | 'parallel_managers';

export interface TimelineConflict {
    kind: TimelineConflictKind;
    managers: string[];
    at: string | null;
    message: string;
}

export interface TimelineDuplicateLead {
    id: string;
    name: string;
    anonymous: boolean;
    status: string | null;
    sales_manager_name: string | null;
    created_at: string | null;
}

/**
 * Ижил утастай өөр лидүүд (тухайн төсөл = shop дотор). Хязгаарлагдсан менежерт `masked`:
 * зөвхөн тоо ба бусад хариуцагчийн нэр — лидийн id, харилцагчийн мэдээлэл БАЙХГҮЙ.
 */
export interface TimelineDuplicates {
    count: number;
    managers: string[];
    masked: boolean;
    leads: TimelineDuplicateLead[];
    /** Хайлтын дээд хязгаарт хүрсэн (тоо доод үнэлгээ). */
    truncated?: boolean;
}

export interface LeadTimeline {
    /** Шинэ нь дээр. */
    events: TimelineEvent[];
    managers: TimelineManager[];
    conflicts: TimelineConflict[];
    duplicates: TimelineDuplicates | null;
    owner: string | null;
    windowDays: number;
    /** Ачаалж чадаагүй эх сурвалж (activities, viewings, contracts, roster, profiles, duplicates). */
    partial: string[];
}

export interface TimelineLeadInput {
    id: string;
    created_at: string;
    source?: string | null;
    sales_manager_name?: string | null;
}

export interface TimelineActivityInput {
    id: string;
    type: string;
    content: string | null;
    meta: Record<string, unknown> | null;
    created_by?: string | null;
    created_by_name: string | null;
    created_at: string;
}

export interface TimelineViewingInput {
    id: string;
    scheduled_at: string | null;
    status: string | null;
    created_at?: string | null;
    completed_at?: string | null;
    sales_manager_name?: string | null;
}

export interface TimelineContractInput {
    id: string;
    contract_number: string | null;
    contract_status: string | null;
    contract_date: string | null;
    created_at?: string | null;
    total_price: number | string | null;
    unit_number?: string | null;
    block_name?: string | null;
    sales_manager?: string | null;
}

export interface TimelineProfile { id: string; full_name: string | null }

export interface BuildLeadTimelineInput {
    lead: TimelineLeadInput;
    activities: TimelineActivityInput[];
    viewings?: TimelineViewingInput[];
    contracts?: TimelineContractInput[];
    roster: ActivityRosterEntry[];
    profiles?: TimelineProfile[];
    duplicates?: TimelineDuplicates | null;
    partial?: string[];
}

const CONTACT_MEETING_EXCLUDED = new Set(['cancelled', 'no_show']);

const text = (value: unknown): string | null => (typeof value === 'string' && value.trim() ? value.trim() : null);
const time = (iso: string) => {
    const t = Date.parse(iso);
    return Number.isNaN(t) ? 0 : t;
};

/** Огноо-л (DATE) мөрийг УБ-ийн шөнө дунд болгоно (серверийн бүсээс үл хамаарна). */
function ubDateInstant(date: string): string {
    return new Date(Date.parse(`${date}T00:00:00Z`) - UB_OFFSET_MS).toISOString();
}

function viewingTitle(status: string | null | undefined): string {
    if (status === 'completed') return 'Уулзалт болов';
    if (status === 'cancelled') return 'Уулзалт цуцлагдав';
    if (status === 'no_show') return 'Уулзалтад ирээгүй';
    return 'Уулзалт товлов';
}

type Draft = Omit<TimelineEvent, 'owner' | 'offOwner'> & { order: number };

export function buildLeadTimeline(input: BuildLeadTimelineInput): LeadTimeline {
    const { lead, roster } = input;
    const currentOwner = text(lead.sales_manager_name);
    const rosterByName = new Map(roster.map((entry) => [entry.name, entry]));
    const profileName = new Map((input.profiles ?? []).map((p) => [p.id, text(p.full_name)]));
    const managerByName = (name: string | null | undefined) => {
        const value = text(name);
        return value && rosterByName.has(value) ? value : null;
    };
    const viewingManager = new Map((input.viewings ?? []).map((v) => [v.id, managerByName(v.sales_manager_name)]));

    const activities = [...input.activities].sort((a, b) => time(a.created_at) - time(b.created_at) || a.id.localeCompare(b.id));
    const managerChanges = activities.filter((a) => a.type === 'manager');
    const first = managerChanges[0];
    const firstMeta = (first?.meta ?? {}) as Record<string, unknown>;
    // Анхны хариуцагч: эхний шилжүүлгийн «from» (claim бол хариуцагчгүй байсан); шилжүүлэггүй бол одоогийнх.
    const initialOwner = first ? (firstMeta.action === 'claim' ? null : text(firstMeta.from)) : currentOwner;

    const drafts: Draft[] = [];
    let order = 0;
    drafts.push({
        id: `lead:${lead.id}`, at: lead.created_at, dateOnly: false, kind: 'created', actor: null, manager: null, contact: false,
        title: 'Лид үүсгэв', detail: [lead.source ? sourceLabel(lead.source) : null, initialOwner ? `Хариуцагч: ${initialOwner}` : null].filter(Boolean).join(' · ') || null,
        amount: null, unitLabel: null, scheduledAt: null, viewingId: null, ownerChange: null, source: 'lead', order: order++,
    });

    const viewingIdsWithHistory = new Set<string>();
    for (const a of activities) {
        const meta = (a.meta ?? {}) as Record<string, unknown>;
        const attributed = attributeCall({ created_by: a.created_by ?? null, created_by_name: a.created_by_name }, roster);
        const actor = attributed ?? text(a.created_by_name) ?? (a.created_by ? profileName.get(a.created_by) ?? null : null);
        const content = text(a.content);
        const base = {
            id: a.id, at: a.created_at, dateOnly: false, actor, manager: attributed, contact: false, detail: null as string | null,
            amount: null as number | null, unitLabel: null as string | null, scheduledAt: null as string | null, viewingId: null as string | null,
            ownerChange: null as TimelineEvent['ownerChange'], source: 'activity' as const, order: order++,
        };
        switch (a.type) {
            case 'manager': {
                const claim = meta.action === 'claim';
                const to = text(meta.to);
                const from = claim ? null : text(meta.from);
                drafts.push({ ...base, kind: claim ? 'claimed' : 'assigned', ownerChange: { from, to },
                    title: claim ? `${to ?? actor ?? 'Менежер'} лидийг хариуцаж авав` : `Хариуцагч: ${from ?? '—'} → ${to ?? '—'}` });
                break;
            }
            case 'call':
                drafts.push({ ...base, kind: 'call', contact: true, title: content ?? 'Залгав' });
                break;
            case 'quote': {
                const amount = Number(meta.amount);
                const valid = Number.isFinite(amount) && amount > 0;
                const unit = text(meta.unit_label);
                drafts.push({
                    ...base, kind: 'quote', contact: true, amount: valid ? amount : null, unitLabel: unit,
                    title: valid ? `Үнийн санал · ${formatMNT(amount)}${unit ? ` · ${unit}` : ''}` : 'Үнийн санал',
                    detail: content && (!valid || content !== quoteContent(amount, unit)) ? content : null,
                });
                break;
            }
            case 'meeting': {
                const viewingId = text(meta.viewing_id);
                if (viewingId) viewingIdsWithHistory.add(viewingId);
                const status = text(meta.status);
                drafts.push({
                    ...base, kind: 'meeting', contact: !status || !CONTACT_MEETING_EXCLUDED.has(status),
                    // Админ товлосон уулзалт уулзалтын менежерт (property_viewings.sales_manager_name) тооцогдоно.
                    manager: attributed ?? (viewingId ? viewingManager.get(viewingId) ?? null : null),
                    title: content ?? 'Уулзалт', scheduledAt: text(meta.scheduled_at), viewingId,
                });
                break;
            }
            case 'note':
                drafts.push({ ...base, kind: 'note', title: content ?? 'Тэмдэглэл' });
                break;
            case 'status': {
                const to = text(meta.to);
                drafts.push({ ...base, kind: 'status', title: `Статус: ${content ?? (to ? statusLabel(to) : '—')}` });
                break;
            }
            case 'contract':
                drafts.push({ ...base, kind: 'contract', title: content ?? 'Гэрээ' });
                break;
            default:
                drafts.push({ ...base, kind: 'system', title: content ?? 'Систем' });
        }
    }

    // Түүхгүй (хуучин) уулзалт: тухайн үеийн хариуцагчаар тамгалагдсан тул «хариуцагч биш» гэж үзэхгүй.
    for (const v of input.viewings ?? []) {
        if (viewingIdsWithHistory.has(v.id)) continue;
        const at = (v.status === 'completed' && text(v.completed_at)) || text(v.created_at) || text(v.scheduled_at);
        if (!at) continue;
        const manager = managerByName(v.sales_manager_name);
        drafts.push({
            id: `viewing:${v.id}`, at, dateOnly: false, kind: 'meeting', actor: text(v.sales_manager_name), manager,
            contact: !CONTACT_MEETING_EXCLUDED.has(v.status ?? ''), title: viewingTitle(v.status), detail: null,
            amount: null, unitLabel: null, scheduledAt: text(v.scheduled_at), viewingId: v.id, ownerChange: null, source: 'viewing', order: order++,
        });
    }

    for (const c of input.contracts ?? []) {
        if (!hasRealContractFields(c)) continue;
        const date = text(c.contract_date);
        const created = text(c.created_at);
        if (!date && !created) continue;
        // Гэрээний өдөр бүртгэгдсэн бол яг цагийг, үгүй бол тухайн өдрийн УБ-ийн эхлэлийг авна.
        const sameDay = !!date && !!created && ubDateStr(new Date(created)) === date;
        const at = date && !sameDay ? ubDateInstant(date) : created!;
        const unit = [text(c.block_name), text(c.unit_number)].filter(Boolean).join(' ');
        drafts.push({
            id: `contract:${c.id}`, at, dateOnly: !!date && !sameDay, kind: 'contract', actor: text(c.sales_manager),
            manager: managerByName(c.sales_manager), contact: false, title: `Гэрээ ${text(c.contract_number) ?? ''}`.trim(),
            detail: [unit || null, formatMNT(Number(c.total_price))].filter(Boolean).join(' · '),
            amount: null, unitLabel: null, scheduledAt: null, viewingId: null, ownerChange: null, source: 'contract', order: order++,
        });
    }

    // Хариуцагчийг цагийн дарааллаар дагана.
    drafts.sort((a, b) => time(a.at) - time(b.at) || a.order - b.order);
    let owner = initialOwner;
    const ascending: TimelineEvent[] = drafts.map(({ order: _order, ...draft }) => {
        if (draft.ownerChange) owner = draft.ownerChange.to;
        const offOwner = draft.contact && draft.source === 'activity' && !!draft.manager && !!owner && draft.manager !== owner;
        return { ...draft, owner, offOwner };
    });

    const managers = summarizeManagers(ascending, currentOwner, rosterByName);
    const duplicates = input.duplicates ?? null;
    const conflicts = [
        ...quoteConflicts(ascending),
        ...duplicateConflicts(duplicates, currentOwner),
        ...nonOwnerConflicts(ascending),
        ...parallelConflicts(ascending),
    ];

    return {
        events: ascending.reverse(),
        managers,
        conflicts,
        duplicates,
        owner: currentOwner,
        windowDays: TIMELINE_CONFLICT_WINDOW_DAYS,
        partial: [...new Set(input.partial ?? [])],
    };
}

function summarizeManagers(events: TimelineEvent[], currentOwner: string | null, rosterByName: Map<string, ActivityRosterEntry>): TimelineManager[] {
    const rows = new Map<string, TimelineManager & { meetingKeys: Set<string> }>();
    const row = (name: string) => {
        let r = rows.get(name);
        if (!r) {
            r = { name, isOwner: name === currentOwner, isActive: !!rosterByName.get(name)?.is_active, firstAt: null, lastAt: null,
                calls: 0, meetings: 0, quotes: 0, notes: 0, lastQuote: null, meetingKeys: new Set() };
            rows.set(name, r);
        }
        return r;
    };
    if (currentOwner) row(currentOwner);
    for (const e of events) {
        if (!e.manager || !['call', 'meeting', 'quote', 'note'].includes(e.kind)) continue;
        const r = row(e.manager);
        if (e.kind === 'note') { r.notes++; continue; }
        if (!e.contact) continue;
        r.firstAt ??= e.at;
        r.lastAt = e.at;
        if (e.kind === 'call') r.calls++;
        if (e.kind === 'meeting') r.meetingKeys.add(e.viewingId ?? e.id);
        if (e.kind === 'quote') {
            r.quotes++;
            if (e.amount !== null) r.lastQuote = { amount: e.amount, unitLabel: e.unitLabel, at: e.at };
        }
    }
    return [...rows.values()]
        .map(({ meetingKeys, ...r }) => ({ ...r, meetings: meetingKeys.size }))
        .sort((a, b) => Number(b.isOwner) - Number(a.isOwner)
            || (b.lastAt ? time(b.lastAt) : -1) - (a.lastAt ? time(a.lastAt) : -1)
            || a.name.localeCompare(b.name, 'mn'));
}

/** Байр/тоот бүрд менежер бүрийн СҮҮЛИЙН санал; 2+ менежерийн дүн өөр бол зөрүү. */
function quoteConflicts(events: TimelineEvent[]): TimelineConflict[] {
    const byUnit = new Map<string, { label: string | null; latest: Map<string, TimelineEvent> }>();
    for (const e of events) {
        if (e.kind !== 'quote' || !e.manager || e.amount === null) continue;
        const key = quoteUnitKey(e.unitLabel);
        const group = byUnit.get(key) ?? { label: e.unitLabel, latest: new Map() };
        group.latest.set(e.manager, e);
        byUnit.set(key, group);
    }
    const out: TimelineConflict[] = [];
    for (const { label, latest } of byUnit.values()) {
        const quotes = [...latest.values()].sort((a, b) => time(a.at) - time(b.at));
        if (quotes.length < 2 || new Set(quotes.map((q) => q.amount)).size < 2) continue;
        out.push({
            kind: 'quote_mismatch',
            managers: quotes.map((q) => q.manager!),
            at: quotes[quotes.length - 1].at,
            message: `Үнийн санал зөрүүтэй${label ? ` (${label})` : ''}: ${quotes.map((q) => `${q.manager} ${formatMNT(q.amount)}`).join(' · ')}`,
        });
    }
    return out;
}

function duplicateConflicts(duplicates: TimelineDuplicates | null, currentOwner: string | null): TimelineConflict[] {
    if (!duplicates || duplicates.count < 1) return [];
    const others = duplicates.managers.filter((name) => name !== currentOwner);
    if (!others.length) return [];
    const count = `${duplicates.count}${duplicates.truncated ? '+' : ''}`;
    return [{
        kind: 'duplicate_phone', managers: others, at: null,
        message: `Энэ утсаар өөр ${count} лид бүртгэлтэй (${others.join(', ')})`,
    }];
}

function nonOwnerConflicts(events: TimelineEvent[]): TimelineConflict[] {
    const byManager = new Map<string, TimelineEvent[]>();
    for (const e of events) if (e.offOwner && e.manager) byManager.set(e.manager, [...(byManager.get(e.manager) ?? []), e]);
    return [...byManager.entries()].map(([manager, list]) => {
        const last = list[list.length - 1];
        return {
            kind: 'non_owner_contact' as const,
            managers: [manager, ...(last.owner ? [last.owner] : [])],
            at: last.at,
            message: `${manager} хариуцагч биш (хариуцагч: ${last.owner ?? '—'}) байхад ${list.length} удаа холбогдсон`,
        };
    });
}

/** Дараалсан хоёр холбоо барилт өөр менежерийнх бөгөөд цонхонд багтвал «зэрэг холбогдсон». */
function parallelConflicts(events: TimelineEvent[]): TimelineConflict[] {
    const contacts = events.filter((e) => e.contact && e.manager);
    const involved = new Set<string>();
    let at: string | null = null;
    for (let i = 1; i < contacts.length; i++) {
        const prev = contacts[i - 1];
        const next = contacts[i];
        if (prev.manager !== next.manager && time(next.at) - time(prev.at) <= WINDOW_MS) {
            involved.add(prev.manager!);
            involved.add(next.manager!);
            at = next.at;
        }
    }
    if (involved.size < 2) return [];
    const managers = [...involved];
    return [{
        kind: 'parallel_managers', managers, at,
        message: `${managers.length} менежер ${TIMELINE_CONFLICT_WINDOW_DAYS} хоногийн дотор холбогдсон: ${managers.join(', ')}`,
    }];
}

/** AI-д өгөх товч хувилбар (prefetch 6000 тэмдэгтэд багтана). */
export function compactLeadTimeline(timeline: LeadTimeline, recent = 12) {
    return {
        owner: timeline.owner,
        window_days: timeline.windowDays,
        managers: timeline.managers.map((m) => ({
            name: m.name, is_owner: m.isOwner, first_contact: m.firstAt, last_contact: m.lastAt,
            calls: m.calls, meetings: m.meetings, quotes: m.quotes,
            ...(m.lastQuote ? { last_quote: { amount: m.lastQuote.amount, unit: m.lastQuote.unitLabel } } : {}),
        })),
        conflicts: timeline.conflicts.map((c) => ({ kind: c.kind, message: c.message })),
        duplicates: timeline.duplicates ? { count: timeline.duplicates.count, managers: timeline.duplicates.managers } : null,
        recent_events: timeline.events.slice(0, recent).map((e) => ({
            at: e.at, kind: e.kind, actor: e.actor, owner: e.owner,
            ...(e.offOwner ? { off_owner: true } : {}),
            ...(e.amount !== null ? { amount: e.amount, unit: e.unitLabel } : {}),
            title: e.title.slice(0, 100),
        })),
        ...(timeline.partial.length ? { partial: timeline.partial } : {}),
        note: 'Үнийн санал нь гэрээний дүн, орлого биш. Зөрчил нь анхааруулга — хэнийг ч буруутгахгүй.',
    };
}
