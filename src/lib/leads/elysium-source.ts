/**
 * Elysium.mn-ийн Supabase `event_leads` уншигч (зөвхөн сервер, зөвхөн SELECT).
 * `ELYSIUM_SUPABASE_URL` + `ELYSIUM_SUPABASE_SERVICE_KEY` (Elysium-ийн service key эсвэл
 * зөвхөн event_leads унших эрхтэй role-ийн түлхүүр). Түлхүүрийг лог, хариунд хэзээ ч гаргахгүй.
 * `event_leads` RLS-тэй, policy-гүй тул anon түлхүүрээр уншигдахгүй.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { fetchAllRows } from '@/lib/utils/pagination';
import { logger } from '@/lib/utils/logger';
import { EventLeadRowSchema, type EventLeadRow } from './elysium';

const SOURCE_TIMEOUT_MS = 20_000;
const COLUMNS = 'id,created_at,name,phone,email,message,source,event_name,event_slug';

const clean = (value: string | undefined) => value?.trim() || undefined;

export class ElysiumSourceError extends Error {}

/** Татан авалтын эх сурвалж тохируулсан эсэх (нууцыг буцаахгүй). */
export function elysiumSourceConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
    return !!clean(env.ELYSIUM_SUPABASE_URL) && !!clean(env.ELYSIUM_SUPABASE_SERVICE_KEY);
}

function sourceClient(): SupabaseClient {
    const url = clean(process.env.ELYSIUM_SUPABASE_URL);
    const key = clean(process.env.ELYSIUM_SUPABASE_SERVICE_KEY);
    if (!url || !key) throw new ElysiumSourceError('Elysium-ийн өгөгдлийн сангийн холболт тохируулаагүй байна.');
    return createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false },
        // Elysium удаан хариулбал cron-ыг гацаахгүй.
        global: { fetch: (input, init) => fetch(input, { ...init, signal: init?.signal ?? AbortSignal.timeout(SOURCE_TIMEOUT_MS) }) },
    });
}

/**
 * `since` (оруулаад) … `until` (оруулаад) хооронд үүссэн бүх мөр, created_at + id-ээр
 * тогтвортой эрэмбэлж 1,000-аар хуудаслана. `since` null бол бүх түүх.
 * Бүтэц өөрчлөгдсөн мөр байвал чимээгүй алгасахгүй — алдаа шиднэ.
 */
export async function fetchEventLeads(range: { since: string | null; until: string }): Promise<EventLeadRow[]> {
    const client = sourceClient();
    let raw: unknown[];
    try {
        raw = await fetchAllRows<unknown>((from, to) => {
            let query = client.from('event_leads').select(COLUMNS).lte('created_at', range.until);
            if (range.since) query = query.gte('created_at', range.since);
            return query.order('created_at', { ascending: true }).order('id', { ascending: true }).range(from, to);
        });
    } catch (error) {
        logger.warn('[Elysium source] event_leads read failed', { message: error instanceof Error ? error.message : 'unknown' });
        throw new ElysiumSourceError('Elysium-ийн хүсэлтүүдийг уншиж чадсангүй. Холболтын түлхүүр, сүлжээг шалгана уу.');
    }
    const rows: EventLeadRow[] = [];
    for (const item of raw) {
        const parsed = EventLeadRowSchema.safeParse(item);
        if (!parsed.success) {
            logger.warn('[Elysium source] unexpected event_leads row', { id: (item as { id?: unknown })?.id ?? null });
            throw new ElysiumSourceError('Elysium-ийн хүсэлтийн бүтэц өөрчлөгдсөн байна. Татан авалтыг зогсоолоо.');
        }
        rows.push(parsed.data);
    }
    return rows;
}

/** Elysium-д хадгалагдсан нийт хүсэлтийн тоо (уншиж чадаагүй бол null). */
export async function countEventLeads(): Promise<number | null> {
    try {
        const { count, error } = await sourceClient().from('event_leads').select('id', { count: 'exact', head: true });
        return error ? null : count ?? null;
    } catch {
        return null;
    }
}
