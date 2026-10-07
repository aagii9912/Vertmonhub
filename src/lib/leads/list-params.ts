import { LEAD_VIEWS, type LeadView } from './labels';
import { isLeadWorkQueue, type LeadWorkQueue } from './work-queue';

/**
 * Лидийн жагсаалтын шүүлтүүр URL-д хадгалагдана (холбоос хуваалцах, дахин ачаалах, хадгалсан харагдац).
 * Анхдагч утга URL-д бичигдэхгүй — шүүлтүүргүй хуудас үргэлж `/dashboard/leads`.
 */

export const LEAD_SORT_KEYS = ['created_at', 'last_contact_at', 'customer_name', 'next_followup_at'] as const;
export type LeadSortKey = typeof LEAD_SORT_KEYS[number];

export interface LeadListFilters {
    view: LeadView;
    queue?: LeadWorkQueue;
    status: string;
    source: string;
    manager: string;
    project: string;
    category: string;
    period: string;
    q: string;
    sort: LeadSortKey;
    dir: 'asc' | 'desc';
    page: number;
}

const PERIODS = ['week', 'month', 'quarter', 'year'];
const TEXT_KEYS = ['status', 'source', 'manager', 'project', 'category'] as const;

/** Анхаарах жагсаалт бүрийн анхдагч эрэмбэ: хугацаа хэтэрсэн нь хамгийн их хоцорсноор, бусад нь хуучнаас. */
export function defaultSort(queue?: LeadWorkQueue): Pick<LeadListFilters, 'sort' | 'dir'> {
    if (queue === 'overdue') return { sort: 'next_followup_at', dir: 'asc' };
    return queue ? { sort: 'created_at', dir: 'asc' } : { sort: 'created_at', dir: 'desc' };
}

export function emptyLeadFilters(queue?: LeadWorkQueue): LeadListFilters {
    return {
        view: 'all', queue, status: 'all', source: 'all', manager: 'all', project: 'all', category: 'all',
        period: 'all', q: '', ...defaultSort(queue), page: 1,
    };
}

export function parseLeadFilters(sp: URLSearchParams): LeadListFilters {
    const queueParam = sp.get('queue');
    const queue = isLeadWorkQueue(queueParam) ? queueParam : undefined;
    const filters = emptyLeadFilters(queue);
    const view = sp.get('view');
    if (LEAD_VIEWS.some((v) => v.key === view)) filters.view = view as LeadView;
    for (const key of TEXT_KEYS) {
        const value = sp.get(key)?.trim();
        if (value) filters[key] = value.slice(0, 200);
    }
    const period = sp.get('period');
    if (period && PERIODS.includes(period)) filters.period = period;
    filters.q = (sp.get('q') ?? '').trim().slice(0, 200);
    const sort = sp.get('sort');
    if ((LEAD_SORT_KEYS as readonly string[]).includes(sort ?? '')) filters.sort = sort as LeadSortKey;
    const dir = sp.get('dir');
    if (dir === 'asc' || dir === 'desc') filters.dir = dir;
    const page = Number(sp.get('page'));
    if (Number.isInteger(page) && page > 1) filters.page = Math.min(page, 10_000);
    return filters;
}

/** URL query (анхдагч утгагүй). `lead` зэрэг бусад параметрийг дуудагч өөрөө нэмнэ. */
export function serializeLeadFilters(f: LeadListFilters): URLSearchParams {
    const sp = new URLSearchParams();
    if (f.queue) sp.set('queue', f.queue);
    if (f.view !== 'all') sp.set('view', f.view);
    for (const key of TEXT_KEYS) if (f[key] !== 'all') sp.set(key, f[key]);
    if (f.period !== 'all') sp.set('period', f.period);
    if (f.q) sp.set('q', f.q);
    const base = defaultSort(f.queue);
    if (f.sort !== base.sort || f.dir !== base.dir) { sp.set('sort', f.sort); sp.set('dir', f.dir); }
    if (f.page > 1) sp.set('page', String(f.page));
    return sp;
}

/** Хуудас, эрэмбээс бусад шүүлтүүр идэвхтэй эсэх («Цэвэрлэх», «Харагдац хадгалах»). */
export function hasLeadFilters(f: LeadListFilters): boolean {
    return !!f.queue || f.view !== 'all' || TEXT_KEYS.some((key) => f[key] !== 'all') || f.period !== 'all' || !!f.q;
}

/** Хадгалсан харагдацад: хуудасгүй query. */
export function viewQuery(f: LeadListFilters): string {
    return serializeLeadFilters({ ...f, page: 1 }).toString();
}
