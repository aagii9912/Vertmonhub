/** Офлайн лидийг эзэмшигч хэрэглэгч, байгууллагаар тусгаарлаж хадгална. */
import { dashboardFetch } from '@/lib/api/dashboardFetch';

const KEY = 'vertmonhub_outbox_v1';
const EVENT = 'vertmon:outbox:changed';
const MAX_ATTEMPTS = 30;

export interface OutboxScope { userId: string; shopId: string; }
export interface OutboxItem {
    id: string;
    url: string;
    method: 'POST' | 'PATCH';
    body: unknown;
    label: string;
    createdAt: string;
    attempts: number;
    /** Хуучин owner-гүй мөрийг хадгална, автоматаар илгээхгүй. */
    userId?: string;
    shopId?: string | null;
    paused?: boolean;
    error?: string;
}

function read(): OutboxItem[] {
    if (typeof window === 'undefined') return [];
    const raw = localStorage.getItem(KEY);
    const list: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(list)) throw new Error('Офлайн бүртгэлийг уншиж чадсангүй. Хадгалсан мэдээллийг арилгаагүй.');
    return list as OutboxItem[];
}

function write(list: OutboxItem[]) {
    // Хадгалалт амжилтгүй бол дуудагчид мэдэгдэнэ; формыг амжилттай гэж хаахгүй.
    localStorage.setItem(KEY, JSON.stringify(list));
    window.dispatchEvent(new CustomEvent(EVENT));
}

const belongsTo = (item: OutboxItem, scope: OutboxScope) => item.userId === scope.userId && item.shopId === scope.shopId;

export function outboxList(scope: OutboxScope): OutboxItem[] {
    return read().filter((item) => belongsTo(item, scope));
}

export function onOutboxChange(handler: () => void): () => void {
    window.addEventListener(EVENT, handler);
    window.addEventListener('storage', handler);
    return () => {
        window.removeEventListener(EVENT, handler);
        window.removeEventListener('storage', handler);
    };
}

export function isNetworkError(e: unknown): boolean {
    return (typeof navigator !== 'undefined' && navigator.onLine === false) || e instanceof TypeError;
}

export function enqueue(item: Pick<OutboxItem, 'url' | 'method' | 'body' | 'label'>, scope: OutboxScope): OutboxItem {
    if (!scope.userId || !scope.shopId) throw new Error('Хэрэглэгч, байгууллагыг тодорхойлж чадсангүй. Формын мэдээллээ хадгалаад дахин нэвтэрнэ үү.');
    const full: OutboxItem = { ...item, ...scope, id: crypto.randomUUID(), createdAt: new Date().toISOString(), attempts: 0 };
    write([...read(), full]);
    return full;
}

export function remove(id: string, scope: OutboxScope) {
    write(read().filter((item) => item.id !== id || !belongsTo(item, scope)));
}

export function retryOutboxItem(id: string, scope: OutboxScope) {
    write(read().map((item) => item.id === id && belongsTo(item, scope)
        ? { ...item, attempts: 0, paused: false, error: undefined } : item));
}

let flushing = false;

/** Амжилттай илгээгдсэн мөрийг л устгана. Алдаатай мөрүүд дахин оролдох хүртэл үлдэнэ. */
export async function flushOutbox(scope: OutboxScope, isCurrentScope: () => boolean) {
    const sent: OutboxItem[] = [];
    const failed: { item: OutboxItem; error: string }[] = [];
    if (flushing || !isCurrentScope()) return { sent, failed };
    flushing = true;
    try {
        for (const item of outboxList(scope)) {
            if (!isCurrentScope()) break;
            if (item.paused || item.attempts >= MAX_ATTEMPTS) continue;
            let error = 'Илгээж чадсангүй. Бүртгэл энэ төхөөрөмжид хадгалагдсан.';
            let pause = false;
            let response: Response | undefined;
            try {
                response = await dashboardFetch(item.url, { method: item.method, body: JSON.stringify(item.body), shopId: scope.shopId });
            } catch {
                error = 'Сүлжээнд холбогдож чадсангүй. Бүртгэл энэ төхөөрөмжид хадгалагдсан.';
            }
            if (response?.ok) {
                remove(item.id, scope);
                sent.push(item);
                continue;
            }
            if (response) {
                const detail = await response.json().catch(() => null as { error?: string } | null);
                error = response.status === 401 ? 'Дахин нэвтрээд «Дахин илгээх» дарна уу.'
                    : response.status === 429 ? 'Хэт олон хүсэлт илгээсэн. Түр хүлээгээд дахин илгээнэ үү.'
                    : detail?.error || `Илгээж чадсангүй (${response.status}). Бүртгэл хадгалагдсан.`;
                pause = response.status >= 400 && response.status < 500;
            }
            const attempts = item.attempts + 1;
            pause ||= attempts >= MAX_ATTEMPTS;
            const message = error;
            write(read().map((current) => current.id === item.id && belongsTo(current, scope)
                ? { ...current, attempts, paused: pause, error: message } : current));
            if (pause) failed.push({ item, error: message });
            if (response?.status === 401 || response?.status === 429) {
                write(read().map((current) => belongsTo(current, scope) ? { ...current, paused: true, error: message } : current));
                break;
            }
        }
    } finally {
        flushing = false;
    }
    return { sent, failed };
}
