/**
 * Health API Route Tests
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// We test the route handler directly by importing it
// Need to mock NextResponse since we're not in a Next.js runtime
vi.mock('next/server', () => ({
    NextResponse: {
        json: (body: unknown, init?: { status?: number; headers?: Record<string, string> }) => ({
            body,
            status: init?.status || 200,
            headers: new Map(Object.entries(init?.headers || {})),
            async json() { return body; },
        }),
    },
}));

import { GET } from '@/app/api/health/route';

describe('Health API', () => {
    beforeEach(() => {
        vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://test.supabase.co');
        vi.stubEnv('GEMINI_API_KEY', 'test-gemini-key');
    });

    it('returns healthy status when all checks pass', async () => {
        const response = await GET();
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.status).toBe('healthy');
        expect(data.checks.api).toBe(true);
        expect(data.checks.environment).toBe(true);
        expect(data.timestamp).toBeDefined();
        expect(data.version).toBeDefined();
        expect(typeof data.uptime).toBe('number');
    });

    it('returns degraded status when environment check fails', async () => {
        vi.stubEnv('GEMINI_API_KEY', '');

        const response = await GET();
        const data = await response.json();

        expect(response.status).toBe(503);
        expect(data.status).toBe('degraded');
        expect(data.checks.environment).toBe(false);
    });

    it('includes correct response headers', async () => {
        const response = await GET();

        expect(response.headers.get('Cache-Control')).toBe('no-cache, no-store, must-revalidate');
    });

    it('returns valid ISO timestamp', async () => {
        const response = await GET();
        const data = await response.json();

        const parsedDate = new Date(data.timestamp);
        expect(parsedDate.toISOString()).toBe(data.timestamp);
    });

    it('returns non-negative uptime', async () => {
        const response = await GET();
        const data = await response.json();

        expect(data.uptime).toBeGreaterThanOrEqual(0);
    });
});
