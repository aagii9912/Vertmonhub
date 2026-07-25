/**
 * Health Check API Endpoint
 *
 * Өмнө нь зөвхөн орчны хувьсагч БАЙГАА эсэхийг шалгаад 200 буцаадаг байсан
 * тул өгөгдлийн сан унасан ч «healthy» гэж хариулдаг байв — мониторинг
 * ямар ч бодит доголдлыг илрүүлэхгүй. Одоо DB-д бодит хүсэлт илгээж шалгана.
 */

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

interface CheckResult {
    ok: boolean;
    latencyMs?: number;
    error?: string;
}

interface HealthStatus {
    status: 'healthy' | 'degraded' | 'unhealthy';
    timestamp: string;
    version: string;
    uptime: number;
    checks: {
        environment: CheckResult;
        database: CheckResult;
        gemini: CheckResult;
    };
}

const startTime = Date.now();
const DB_TIMEOUT_MS = 3000;

/** DB-д бодит (хямд) хүсэлт илгээж холболтыг шалгана. */
async function checkDatabase(): Promise<CheckResult> {
    const started = Date.now();
    try {
        const probe = supabaseAdmin()
            .from('shops')
            .select('id', { count: 'exact', head: true })
            .limit(1);

        const timeout = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('DB шалгалт timeout')), DB_TIMEOUT_MS),
        );

        const { error } = (await Promise.race([probe, timeout])) as { error: { message: string } | null };
        const latencyMs = Date.now() - started;

        if (error) return { ok: false, latencyMs, error: error.message };
        return { ok: true, latencyMs };
    } catch (e) {
        return {
            ok: false,
            latencyMs: Date.now() - started,
            error: e instanceof Error ? e.message : String(e),
        };
    }
}

export async function GET() {
    const environment: CheckResult = {
        ok: !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY),
    };
    if (!environment.ok) environment.error = 'Supabase орчны хувьсагч дутуу';

    // Gemini рүү бодит дуудалт хийхгүй (зардал/квот) — түлхүүр байгаа эсэх
    const gemini: CheckResult = { ok: !!process.env.GEMINI_API_KEY };
    if (!gemini.ok) gemini.error = 'GEMINI_API_KEY тохируулаагүй';

    const database: CheckResult = environment.ok
        ? await checkDatabase()
        : { ok: false, error: 'Орчны хувьсагч дутуу тул шалгаагүй' };

    // DB унасан бол систем ажиллахгүй → unhealthy.
    // Gemini байхгүй бол зөвхөн AI ажиллахгүй → degraded.
    const status: HealthStatus['status'] = !database.ok
        ? 'unhealthy'
        : !gemini.ok
            ? 'degraded'
            : 'healthy';

    const response: HealthStatus = {
        status,
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version || '0.1.0',
        uptime: Math.floor((Date.now() - startTime) / 1000),
        checks: { environment, database, gemini },
    };

    return NextResponse.json(response, {
        status: status === 'healthy' ? 200 : 503,
        headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' },
    });
}
