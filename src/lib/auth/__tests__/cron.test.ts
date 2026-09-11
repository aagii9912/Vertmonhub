import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('@/lib/utils/logger', () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import { isAuthorizedCron } from '../cron';

const req = (headers: Record<string, string>) => new Request('http://x/api/cron/test', { headers });
const ENV = { ...process.env };

beforeEach(() => { delete process.env.CRON_SECRET; });
afterEach(() => { process.env = { ...ENV }; });

describe('isAuthorizedCron (2026-09 review H11)', () => {
    it('CRON_SECRET байхгүй + production → FAIL-CLOSED', () => {
        vi.stubEnv('NODE_ENV', 'production');
        expect(isAuthorizedCron(req({}))).toBe(false);
        expect(isAuthorizedCron(req({ authorization: 'Bearer undefined' }))).toBe(false);
        vi.unstubAllEnvs();
    });
    it('CRON_SECRET байхгүй + development → нээлттэй', () => {
        vi.stubEnv('NODE_ENV', 'development');
        expect(isAuthorizedCron(req({}))).toBe(true);
        vi.unstubAllEnvs();
    });
    it('зөв Bearer / x-cron-secret → true, буруу → false', () => {
        process.env.CRON_SECRET = 's3cret';
        expect(isAuthorizedCron(req({ authorization: 'Bearer s3cret' }))).toBe(true);
        expect(isAuthorizedCron(req({ 'x-cron-secret': 's3cret' }))).toBe(true);
        expect(isAuthorizedCron(req({ authorization: 'Bearer s3cre' }))).toBe(false);
        expect(isAuthorizedCron(req({ authorization: 'Bearer S3CRET' }))).toBe(false);
        expect(isAuthorizedCron(req({}))).toBe(false);
    });
});
