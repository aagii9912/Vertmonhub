// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    admin: true as boolean,
    sync: vi.fn(),
    status: vi.fn(),
    setEnabled: vi.fn(),
    audit: vi.fn(),
}));
vi.mock('@/lib/supabase', () => ({ supabaseAdmin: () => ({ db: true }) }));
vi.mock('@/lib/utils/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock('@/lib/admin/auth', () => ({ getAdminUser: async () => mocks.admin ? { id: 'admin-1', email: 'a@example.invalid', role: 'super_admin' } : null }));
vi.mock('@/lib/admin/audit', () => ({ logAdminAudit: mocks.audit }));
vi.mock('@/lib/services/ElysiumLeadSync', async (original) => ({
    ...(await original<typeof import('@/lib/services/ElysiumLeadSync')>()),
    syncElysiumLeads: mocks.sync,
    elysiumSyncStatus: mocks.status,
    setElysiumSyncEnabled: mocks.setEnabled,
}));

import { GET as cron } from '../cron/elysium-leads-sync/route';
import { GET, PATCH, POST } from '../admin/integrations/elysium/route';
import { ElysiumSyncError } from '@/lib/services/ElysiumLeadSync';

const counts = { status: 'ok', dryRun: false, read: 2, pending: 2, imported: 1, matched: 1, invalid: 0, failed: 0, remaining: 0, repeats: 0, sample: [] };
const cronRequest = (secret?: string) => new Request('http://localhost/api/cron/elysium-leads-sync', {
    headers: secret ? { authorization: `Bearer ${secret}` } : {},
}) as never;
const adminRequest = (method: string, body?: unknown) => new Request('http://localhost/api/admin/integrations/elysium', {
    method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
}) as never;

beforeEach(() => {
    vi.stubEnv('CRON_SECRET', 'cron-secret');
    mocks.admin = true;
    mocks.sync.mockReset().mockResolvedValue(counts);
    mocks.status.mockReset().mockResolvedValue({ storageReady: true, config: { pushConfigured: true, pullConfigured: true } });
    mocks.setEnabled.mockReset().mockResolvedValue({ enabled: true });
    mocks.audit.mockReset();
});
afterEach(() => vi.unstubAllEnvs());

describe('GET /api/cron/elysium-leads-sync', () => {
    it('requires the cron secret', async () => {
        expect((await cron(cronRequest())).status).toBe(403);
        expect((await cron(cronRequest('wrong'))).status).toBe(403);
        expect(mocks.sync).not.toHaveBeenCalled();
    });

    it('answers 200 with the skip reason when not configured or disabled', async () => {
        for (const skipped of ['not_configured', 'disabled']) {
            mocks.sync.mockResolvedValueOnce({ ...counts, status: 'skipped', skipped });
            const res = await cron(cronRequest('cron-secret'));
            expect(res.status).toBe(200);
            expect(await res.json()).toEqual({ success: true, skipped });
        }
        expect(mocks.sync).toHaveBeenCalledWith({ db: true }, { trigger: 'cron' });
    });

    it('returns counts only, and 500 on partial or failed runs', async () => {
        const ok = await cron(cronRequest('cron-secret'));
        expect(ok.status).toBe(200);
        expect(await ok.json()).toEqual({ success: true, read: 2, imported: 1, matched: 1, invalid: 0, failed: 0, remaining: 0 });
        mocks.sync.mockResolvedValueOnce({ ...counts, status: 'partial', failed: 1 });
        expect((await cron(cronRequest('cron-secret'))).status).toBe(500);
        mocks.sync.mockRejectedValueOnce(new ElysiumSyncError('Elysium-ийн хүсэлтүүдийг уншиж чадсангүй.'));
        const failed = await cron(cronRequest('cron-secret'));
        expect(failed.status).toBe(500);
        expect(await failed.json()).toEqual({ success: false, error: 'Elysium лид татахад алдаа гарлаа' });
    });
});

describe('/api/admin/integrations/elysium', () => {
    it('is super admin only', async () => {
        mocks.admin = false;
        expect((await GET()).status).toBe(403);
        expect((await POST(adminRequest('POST', {}))).status).toBe(403);
        expect((await PATCH(adminRequest('PATCH', { enabled: true }))).status).toBe(403);
        expect(mocks.sync).not.toHaveBeenCalled();
        expect(mocks.setEnabled).not.toHaveBeenCalled();
    });

    it('returns the status uncached', async () => {
        const res = await GET();
        expect(res.status).toBe(200);
        expect(res.headers.get('cache-control')).toBe('private, no-store');
        expect(await res.json()).toMatchObject({ storageReady: true });
    });

    it('runs a dry run or a real pull and audits the counts', async () => {
        const dry = await POST(adminRequest('POST', { dryRun: true }));
        expect(dry.status).toBe(200);
        expect(mocks.sync).toHaveBeenLastCalledWith({ db: true }, { trigger: 'manual', dryRun: true });
        const run = await POST(adminRequest('POST'));
        expect(run.status).toBe(200);
        expect(await run.json()).toMatchObject({ result: { imported: 1, matched: 1 } });
        expect(mocks.sync).toHaveBeenLastCalledWith({ db: true }, { trigger: 'manual', dryRun: false });
        expect(mocks.audit).toHaveBeenLastCalledWith(expect.objectContaining({
            actorId: 'admin-1', action: 'integration.elysium_sync', meta: expect.objectContaining({ dryRun: false, imported: 1 }),
        }));
    });

    it('validates bodies with an allow-list and maps service errors', async () => {
        expect((await POST(adminRequest('POST', { dryRun: 'yes' }))).status).toBe(400);
        expect((await POST(adminRequest('POST', { dryRun: true, since: '2020-01-01' }))).status).toBe(400);
        expect((await POST(adminRequest('POST', '{oops'))).status).toBe(400);
        expect((await PATCH(adminRequest('PATCH', {}))).status).toBe(400);
        expect((await PATCH(adminRequest('PATCH', { enabled: true, cursor_at: null }))).status).toBe(400);
        expect(mocks.sync).not.toHaveBeenCalled();
        mocks.sync.mockRejectedValueOnce(new ElysiumSyncError('Автомат татах тохируулаагүй байна', 409));
        const res = await POST(adminRequest('POST', {}));
        expect(res.status).toBe(409);
        expect(await res.json()).toEqual({ error: 'Автомат татах тохируулаагүй байна' });
    });

    it('enables the schedule and audits it', async () => {
        const res = await PATCH(adminRequest('PATCH', { enabled: true }));
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ enabled: true });
        expect(mocks.setEnabled).toHaveBeenCalledWith({ db: true }, true, 'admin-1');
        expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'integration.elysium_enable', meta: { enabled: true } }));
    });
});
