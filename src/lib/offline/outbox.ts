/**
 * Офлайн outbox — талбай дээр интернэтгүй үед лид/уулзалтын бүртгэл алдагдахгүй.
 *
 * Сүлжээний алдаатай (fetch өөрөө шидсэн, HTTP хариу ирээгүй) POST-уудыг
 * localStorage-д дараалалд хийж, `online` үед болон апп ачаалахад дахин
 * илгээнэ. Серверийн алдаа (4xx/5xx) дараалалд ОРОХГҮЙ — тэр нь хэрэглэгчид
 * шууд харагдах ёстой.
 */
import { dashboardFetch, getActiveShopId } from '@/lib/api/dashboardFetch';

const KEY = 'vertmonhub_outbox_v1';
const EVENT = 'vertmon:outbox:changed';

export interface OutboxItem {
    id: string;
    url: string;
    method: 'POST' | 'PATCH';
    body: unknown;
    /** Хэрэглэгчид харуулах нэр: «Лид · Г. Энхжин» */
    label: string;
    createdAt: string;
    attempts: number;
    /**
     * Бүртгэх үеийн идэвхтэй shop — flush хийхэд localStorage-ийн ОДООГИЙН shop биш
     * энэ shop руу явна (shop сольсон/өөр хүн нэвтэрсэн бол буруу tenant-д орохгүй).
     */
    shopId?: string | null;
}

/** Үүнээс олон удаа сүлжээний алдаа авсан мөрийг «амжилтгүй» болгож дараалалаас хасна. */
const MAX_ATTEMPTS = 30;

function read(): OutboxItem[] {
    if (typeof window === 'undefined') return [];
    try {
        const raw = localStorage.getItem(KEY);
        const list = raw ? (JSON.parse(raw) as OutboxItem[]) : [];
        return Array.isArray(list) ? list : [];
    } catch {
        return [];
    }
}

function write(list: OutboxItem[]) {
    try {
        localStorage.setItem(KEY, JSON.stringify(list));
    } catch { /* хадгалах боломжгүй — алгасна */ }
    window.dispatchEvent(new CustomEvent(EVENT));
}

export function outboxList(): OutboxItem[] {
    return read();
}

export function onOutboxChange(handler: () => void): () => void {
    if (typeof window === 'undefined') return () => {};
    window.addEventListener(EVENT, handler);
    return () => window.removeEventListener(EVENT, handler);
}

/** Сүлжээний алдаа мөн үү (fetch reject) — серверийн хариу биш. */
export function isNetworkError(e: unknown): boolean {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
    return e instanceof TypeError; // fetch: "Failed to fetch" / "Load failed"
}

export function enqueue(item: Omit<OutboxItem, 'id' | 'createdAt' | 'attempts'>): OutboxItem {
    const full: OutboxItem = {
        ...item,
        shopId: item.shopId ?? getActiveShopId(),
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        createdAt: new Date().toISOString(),
        attempts: 0,
    };
    write([...read(), full]);
    return full;
}

export function remove(id: string) {
    write(read().filter((i) => i.id !== id));
}

let flushing = false;

/**
 * Дарааллыг илгээх. Амжилттай → хасна; серверийн алдаа (4xx) → хасаад
 * `failed`-д буцаана (хэрэглэгчид мэдэгдэнэ); сүлжээний алдаа → үлдээнэ.
 */
export async function flushOutbox(): Promise<{ sent: OutboxItem[]; failed: { item: OutboxItem; error: string }[]; remaining: number }> {
    const sent: OutboxItem[] = [];
    const failed: { item: OutboxItem; error: string }[] = [];
    if (flushing || typeof window === 'undefined') return { sent, failed, remaining: read().length };
    flushing = true;
    try {
        for (const item of read()) {
            if (item.attempts >= MAX_ATTEMPTS) {
                failed.push({ item, error: 'Олон удаа илгээж чадсангүй — дахин бүртгэнэ үү' });
                remove(item.id);
                continue;
            }
            try {
                // Бүртгэх үеийн shop руу (dashboardFetch shopId override); байхгүй бол одоогийнх.
                const res = await dashboardFetch(item.url, {
                    method: item.method,
                    body: JSON.stringify(item.body),
                    ...(item.shopId ? { shopId: item.shopId } : {}),
                });
                if (res.ok) {
                    sent.push(item);
                    remove(item.id);
                } else if (res.status >= 400 && res.status < 500) {
                    const detail = await res.json().catch(() => null as { error?: string } | null);
                    failed.push({ item, error: detail?.error || `Хүсэлт амжилтгүй (${res.status})` });
                    remove(item.id);
                } else {
                    bump(item.id);
                }
            } catch {
                bump(item.id);
            }
        }
    } finally {
        flushing = false;
    }
    return { sent, failed, remaining: read().length };
}

function bump(id: string) {
    write(read().map((i) => (i.id === id ? { ...i, attempts: i.attempts + 1 } : i)));
}
