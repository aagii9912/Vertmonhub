import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from '../route';

const mocks = vi.hoisted(() => ({ insert: vi.fn(), user: vi.fn() }));
vi.mock('@/lib/auth/auth', () => ({ getAuthUser: mocks.user, supabaseAdmin: () => ({ from: () => ({ insert: mocks.insert }) }) }));
vi.mock('@/lib/utils/logger', () => ({ logger: { info: vi.fn(), error: vi.fn() } }));

beforeEach(() => { vi.clearAllMocks(); mocks.user.mockResolvedValue(null); });
const request = () => new Request('http://localhost/api/feedback', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'bug', message: 'Тест санал' }) });

describe('feedback delivery result', () => {
    it('returns a failure when storage fails instead of acknowledging discarded feedback', async () => {
        mocks.insert.mockResolvedValue({ error: { code: '42P01', message: 'private database detail' } });
        const response = await POST(request());
        expect(response.status).toBe(500);
        const body = await response.json();
        expect(body.success).toBeUndefined();
        expect(JSON.stringify(body)).not.toContain('private database detail');
    });
    it('acknowledges feedback only after a successful insert', async () => {
        mocks.insert.mockResolvedValue({ error: null });
        const response = await POST(request());
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ success: true });
        expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({ message: 'Тест санал', type: 'bug' }));
    });
});
