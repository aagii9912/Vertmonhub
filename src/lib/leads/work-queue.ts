import { ACTIVE_STATUSES } from './labels';

export const LEAD_WORK_QUEUES = [
    { key: 'unassigned', label: 'Хариуцагчгүй', help: 'Менежерт оноох эсвэл өөрөө хариуцаж авна.' },
    { key: 'uncontacted', label: 'Холбоо бүртгээгүй', help: 'Эхний дуудлагын үр дүнг бүртгэнэ.' },
    { key: 'no_followup', label: 'Дараагийн алхамгүй', help: 'Дахин холбогдох цаг эсвэл уулзалт товлоно.' },
    { key: 'overdue', label: 'Хугацаа хэтэрсэн', help: 'Холбогдох эсвэл товлосон уулзалтын үр дүнг бүртгэнэ.' },
] as const;
export type LeadWorkQueue = typeof LEAD_WORK_QUEUES[number]['key'];
export function isLeadWorkQueue(value: unknown): value is LeadWorkQueue {
    return LEAD_WORK_QUEUES.some(q => q.key === value);
}
type WorkLead = {
    status: string; sales_manager_name?: string | null; last_contact_at?: string | null;
    next_followup_at?: string | null; viewing_scheduled_at?: string | null;
};

/** Тайлан ба жагсаалтын ижил дүрэм. Нэг лид хэд хэдэн анхаарах нөхцөлтэй байж болно. */
export function getLeadWorkQueues(lead: WorkLead, now = new Date()): LeadWorkQueue[] {
    if (!(ACTIVE_STATUSES as string[]).includes(lead.status)) return [];
    const queues: LeadWorkQueue[] = [];
    if (!lead.sales_manager_name) queues.push('unassigned');
    if (!lead.last_contact_at) queues.push('uncontacted');
    const next = lead.next_followup_at || (lead.status === 'viewing_scheduled' ? lead.viewing_scheduled_at : null);
    if (!next) queues.push('no_followup');
    else if (Date.parse(next) < now.getTime()) queues.push('overdue');
    return queues;
}

/** PostgREST `.or()` илэрхийлэл: утгууд зөвхөн тогтмол нэр ба серверийн цагаас үүснэ. */
export function workQueueFilter(queue: LeadWorkQueue, now = new Date()): string {
    const active = `status.in.(${ACTIVE_STATUSES.join(',')})`;
    const conditions: Record<LeadWorkQueue, string> = {
        unassigned: 'or(sales_manager_name.is.null,sales_manager_name.eq."")',
        uncontacted: 'last_contact_at.is.null',
        no_followup: 'next_followup_at.is.null,or(status.neq.viewing_scheduled,viewing_scheduled_at.is.null)',
        overdue: `or(next_followup_at.lt.${now.toISOString()},and(next_followup_at.is.null,status.eq.viewing_scheduled,viewing_scheduled_at.lt.${now.toISOString()}))`,
    };
    return `and(${active},${conditions[queue]})`;
}
