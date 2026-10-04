import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({ signIn: vi.fn(), client: vi.fn() }));
vi.mock('next/headers', () => ({ cookies: async () => ({ getAll: () => [], set: vi.fn() }) }));
vi.mock('@supabase/ssr', () => ({ createServerClient: auth.client }));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { role: 'viewer' } }) }) }) }),
}) }));
import { POST } from '../route';

beforeEach(() => {
    vi.clearAllMocks();
    auth.client.mockReturnValue({ auth: { signInWithPassword: auth.signIn } });
    auth.signIn.mockResolvedValue({ data: { user: { id: 'test-user', email: 'test@example.invalid' } }, error: null });
});

const login = (body: unknown) => POST(new NextRequest('https://app.example/api/auth/login', {
    method: 'POST', body: JSON.stringify(body),
}));

describe('password login', () => {
    it('normalizes the email and sends the exact password to authentication', async () => {
        const response = await login({ email: ' test@example.invalid ', password: ' Exact password ' });
        expect(response.status).toBe(200);
        expect(auth.signIn).toHaveBeenCalledWith({ email: 'test@example.invalid', password: ' Exact password ' });
    });

    it('lowercases a mixed-case email like admin user creation does', async () => {
        const response = await login({ email: '  Test.Manager@Example.Invalid ', password: 'password' });
        expect(response.status).toBe(200);
        expect(auth.signIn).toHaveBeenCalledWith({ email: 'test.manager@example.invalid', password: 'password' });
    });

    it.each([
        null, [], { email: { hostile: true }, password: 'password' },
        { email: 'test@example.invalid', password: ['password'] },
        { email: 'not-an-email', password: 'password' },
        { email: 'test@example.invalid', password: '' },
    ])('rejects malformed credentials before an authentication request (%j)', async (body) => {
        expect((await login(body)).status).toBe(400);
        expect(auth.client).not.toHaveBeenCalled();
    });

    it('rejects invalid JSON before an authentication request', async () => {
        const response = await POST(new NextRequest('https://app.example/api/auth/login', { method: 'POST', body: '{' }));
        expect(response.status).toBe(400);
        expect(auth.client).not.toHaveBeenCalled();
    });

    it('returns the existing invalid-password feedback', async () => {
        auth.signIn.mockResolvedValue({ data: { user: null }, error: { code: 'invalid_credentials' } });
        const response = await login({ email: 'test@example.invalid', password: 'wrong' });
        expect(response.status).toBe(401);
        expect(await response.json()).toMatchObject({ error: 'Имэйл эсвэл нууц үг буруу байна', code: 'invalid_credentials' });
    });

    it('does not expose authentication service internals in a 500 response', async () => {
        auth.signIn.mockRejectedValue(new Error('test-secret'));
        const response = await login({ email: 'test@example.invalid', password: 'password' });
        expect(response.status).toBe(500);
        expect(await response.text()).not.toContain('test-secret');
    });
});
