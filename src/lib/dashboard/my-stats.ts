/**
 * «Миний самбар» (менежерийн хувийн дашбоард)-ын цэвэр aggregation туслахууд.
 * DB-гүй PURE функцууд — unit-тестэд шууд ордог; /api/dashboard/my-stats route
 * эдгээрийг татсан мөрүүд дээрээ ажиллуулна.
 */

/** Хаагдсан (идэвхгүй) лидийн статусууд. */
export const CLOSED_LEAD_STATUSES = ['closed_won', 'closed_lost'] as const;

export interface LeadLite {
    id: string;
    status: string;
    created_at?: string | null;
    next_followup_at?: string | null;
    customer_name?: string | null;
    customer_phone?: string | null;
}

export interface ViewingLite {
    id: string;
    scheduled_at: string;
    status?: string | null;
    property_name?: string | null;
    customer_name?: string | null;
}

/** Лидүүдийг статусаар нь тоолно. */
export function groupLeadsByStatus(leads: LeadLite[]): Record<string, number> {
    const out: Record<string, number> = {};
    for (const lead of leads) {
        const status = lead.status || 'new';
        out[status] = (out[status] || 0) + 1;
    }
    return out;
}

/** Идэвхтэй (хаагдаагүй) лидийн тоо. */
export function countActiveLeads(leads: LeadLite[]): number {
    return leads.filter((l) => !(CLOSED_LEAD_STATUSES as readonly string[]).includes(l.status)).length;
}

/** Тухайн хугацаанаас хойш үүссэн лидийн тоо. */
export function countLeadsCreatedSince(leads: LeadLite[], since: Date): number {
    const t = since.getTime();
    return leads.filter((l) => l.created_at && new Date(l.created_at).getTime() >= t).length;
}

export interface DashTask {
    type: 'followup' | 'viewing';
    id: string;
    title: string;
    subtitle: string;
    dueAt: string;
    overdue: boolean;
    href: string;
}

function startOfDay(d: Date): Date {
    const out = new Date(d);
    out.setHours(0, 0, 0, 0);
    return out;
}

function endOfDay(d: Date): Date {
    const out = startOfDay(d);
    out.setDate(out.getDate() + 1);
    return out;
}

/**
 * Менежерийн «Хийх ажлууд»: өнөөдөр/хоцорсон follow-up-ууд + өнөөдрийн уулзалтууд,
 * dueAt-аар өсөхөөр эрэмбэлэгдсэн.
 * • followup: next_followup_at нь өнөөдрийн эцсээс өмнөх, хаагдаагүй лид;
 *   overdue = өнөөдрөөс өмнөх өдөр байсан.
 * • viewing: өнөөдөр товлогдсон, цуцлагдаагүй уулзалт; overdue = цаг нь өнгөрсөн.
 */
export function buildTaskList(leads: LeadLite[], viewings: ViewingLite[], now: Date): DashTask[] {
    const dayStart = startOfDay(now);
    const dayEnd = endOfDay(now);
    const tasks: DashTask[] = [];

    for (const lead of leads) {
        if (!lead.next_followup_at) continue;
        if ((CLOSED_LEAD_STATUSES as readonly string[]).includes(lead.status)) continue;
        const due = new Date(lead.next_followup_at);
        if (due.getTime() >= dayEnd.getTime()) continue;
        tasks.push({
            type: 'followup',
            id: lead.id,
            title: lead.customer_name || 'Лид',
            subtitle: lead.customer_phone ? `Холбогдох · ${lead.customer_phone}` : 'Холбогдох',
            dueAt: due.toISOString(),
            overdue: due.getTime() < dayStart.getTime(),
            href: '/dashboard/leads',
        });
    }

    for (const viewing of viewings) {
        if (!viewing.scheduled_at) continue;
        if (viewing.status && viewing.status !== 'scheduled') continue;
        const at = new Date(viewing.scheduled_at);
        if (at.getTime() < dayStart.getTime() || at.getTime() >= dayEnd.getTime()) continue;
        tasks.push({
            type: 'viewing',
            id: viewing.id,
            title: viewing.property_name || viewing.customer_name || 'Үзүүлэлт',
            subtitle: viewing.customer_name ? `Уулзалт · ${viewing.customer_name}` : 'Уулзалт',
            dueAt: at.toISOString(),
            overdue: at.getTime() < now.getTime(),
            href: '/dashboard/viewings',
        });
    }

    return tasks.sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime());
}

/** Уулзалтуудыг [from, to) цонхонд (цуцлагдсаныг хасаад) тоолно. */
export function countViewingsBetween(viewings: ViewingLite[], from: Date, to: Date): number {
    const f = from.getTime();
    const t = to.getTime();
    return viewings.filter((v) => {
        if (!v.scheduled_at) return false;
        if (v.status === 'cancelled') return false;
        const at = new Date(v.scheduled_at).getTime();
        return at >= f && at < t;
    }).length;
}
