import { formatTime, ubDateStr, UB_OFFSET_MS } from '@/lib/utils/date';
import { ACTIVE_STATUSES } from './labels';

/**
 * Лидийн «Дараагийн алхам» — жагсаалт, карт, Өнөөдөр нэг дүрмээр. Хоцорсон эсэх нь
 * `work-queue`-тэй ижил: товлосон цаг одооноос өмнө бол хоцорсон (24 цагийн хүлээлтгүй).
 * Өдрийн тоо Улаанбаатарын хуанлиар.
 */

type NextStepLead = {
    status: string;
    next_followup_at?: string | null;
    viewing_scheduled_at?: string | null;
};

export interface NextStep {
    kind: 'followup' | 'viewing' | 'none' | 'closed';
    /** Юу хийх: «Залгах», «Уулзалт», «Хариу авах»… */
    action: string;
    at: string | null;
    overdue: boolean;
    /** УБ-ийн хуанлийн өдрөөр хэдэн өдөр хоцорсон (хоцроогүй бол 0). */
    overdueDays: number;
    /** Богино хугацаа: «Өнөөдөр 14:00», «Маргааш 10:00», «10/09 10:00», «2 өдөр хоцорсон». */
    when: string;
}

const DAY_MS = 86_400_000;
const ubDay = (d: Date) => Math.floor((d.getTime() + UB_OFFSET_MS) / DAY_MS);
const monthDay = (d: Date) => ubDateStr(d).slice(5).replace('-', '/');

/** Огноогүй үеийн санал болгох алхам (төлөвөөс). */
function idleAction(status: string): string {
    if (status === 'offered') return 'Хариу авах';
    if (status === 'negotiating') return 'Хэлэлцээ үргэлжлүүлэх';
    if (status === 'new') return 'Залгах';
    return 'Товлоогүй';
}

export function describeNextStep(lead: NextStepLead, now = new Date()): NextStep {
    if (!(ACTIVE_STATUSES as string[]).includes(lead.status)) {
        return { kind: 'closed', action: lead.status === 'closed_won' ? 'Гэрээтэй' : 'Хаагдсан', at: null, overdue: false, overdueDays: 0, when: '—' };
    }
    const followup = lead.next_followup_at || null;
    const at = followup || (lead.status === 'viewing_scheduled' ? lead.viewing_scheduled_at || null : null);
    const date = at ? new Date(at) : null;
    if (!date || Number.isNaN(date.getTime())) {
        return { kind: 'none', action: idleAction(lead.status), at: null, overdue: false, overdueDays: 0, when: 'Товлоогүй' };
    }
    const kind = followup ? 'followup' : 'viewing';
    const action = kind === 'viewing' ? 'Уулзалт' : 'Залгах';
    const overdue = date.getTime() < now.getTime();
    const dayDiff = ubDay(date) - ubDay(now);
    const time = formatTime(date);
    const when = overdue
        ? dayDiff < 0 ? `${-dayDiff} өдөр хоцорсон` : `Өнөөдөр ${time} · хоцорсон`
        : dayDiff === 0 ? `Өнөөдөр ${time}`
        : dayDiff === 1 ? `Маргааш ${time}`
        : `${monthDay(date)} ${time}`;
    return { kind, action, at, overdue, overdueDays: overdue ? Math.max(0, -dayDiff) : 0, when };
}

/** Улаанбаатарын `days` өдрийн дараах 10:00 цаг (ISO) — «Маргааш / 3 хоног / 7 хоног» сонголтод. */
export function followupAtDays(days: number, now = new Date()): string {
    const day = ubDateStr(new Date(now.getTime() + days * DAY_MS));
    return new Date(`${day}T10:00:00+08:00`).toISOString();
}
