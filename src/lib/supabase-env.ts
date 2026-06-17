/**
 * Supabase environment variables — trimmed & validated in one place.
 *
 * Vercel/CI дээр secret хуулахад заримдаа төгсгөлд нь нэмэлт зай эсвэл шинэ мөр
 * (\n) орох нь бий. Тийм apikey JWT нь буруу болж бүх хүсэлт 401 буцаадаг.
 * Тиймээс энд бүх утгыг .trim() хийж нэг эх сурвалжаас өгнө.
 */

function clean(value: string | undefined): string | undefined {
    return value?.trim() || undefined;
}

/** NEXT_PUBLIC_SUPABASE_URL (trimmed). */
export function supabaseUrl(): string | undefined {
    return clean(process.env.NEXT_PUBLIC_SUPABASE_URL);
}

/** NEXT_PUBLIC_SUPABASE_ANON_KEY (trimmed). */
export function supabaseAnonKey(): string | undefined {
    return clean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

/** SUPABASE_SERVICE_ROLE_KEY (trimmed, server-only). */
export function supabaseServiceKey(): string | undefined {
    return clean(process.env.SUPABASE_SERVICE_ROLE_KEY);
}

/** URL + anon key хосыг шаардаж буцаана (аль нэг нь дутвал алдаа шиднэ). */
export function requireSupabaseAnon(): { url: string; anonKey: string } {
    const url = supabaseUrl();
    const anonKey = supabaseAnonKey();
    if (!url || !anonKey) {
        throw new Error('Supabase env vars (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY) are not configured');
    }
    return { url, anonKey };
}

/** URL + service role key хосыг шаардаж буцаана (server-only). */
export function requireSupabaseService(): { url: string; serviceKey: string } {
    const url = supabaseUrl();
    const serviceKey = supabaseServiceKey();
    if (!url || !serviceKey) {
        throw new Error('Supabase admin env vars (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY) are not configured');
    }
    return { url, serviceKey };
}
