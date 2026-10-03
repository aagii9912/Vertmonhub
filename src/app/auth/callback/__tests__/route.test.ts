import { beforeEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({ exchange: vi.fn(), verify: vi.fn(), client: vi.fn() }));
vi.mock('@/lib/auth/supabase-auth', () => ({
    createSupabaseServerClient: auth.client,
}));
import { GET } from '../route';

beforeEach(() => {
    vi.clearAllMocks();
    const success = { data: { session: { access_token: 'test-only' } }, error: null };
    auth.exchange.mockResolvedValue(success);
    auth.verify.mockResolvedValue(success);
    auth.client.mockResolvedValue({ auth: { exchangeCodeForSession: auth.exchange, verifyOtp: auth.verify } });
});

const callback = (query = '') => GET(new Request(`https://app.example/auth/callback${query}`));

describe('authentication callback', () => {
    it('exchanges an OAuth code and redirects locally without keeping credentials', async () => {
        const response = await callback('?code=test-code&redirect_url=https://hostile.example');
        expect(auth.exchange).toHaveBeenCalledWith('test-code');
        expect(response.headers.get('location')).toBe('https://app.example/dashboard');
        expect(response.headers.get('cache-control')).toBe('private, no-store');
        expect(auth.verify).not.toHaveBeenCalled();
    });

    it.each(['invite', 'magiclink', 'email'])('verifies a %s token hash without a recipient PKCE verifier', async (type) => {
        const response = await callback(`?token_hash=test-hash&type=${type}`);
        expect(auth.verify).toHaveBeenCalledWith({ token_hash: 'test-hash', type });
        expect(auth.exchange).not.toHaveBeenCalled();
        expect(response.headers.get('location')).toBe('https://app.example/dashboard');
    });

    it.each(['code', 'token_hash'])('shows a new-link message for an expired %s', async (parameter) => {
        const error = { data: { session: null }, error: { code: 'otp_expired', message: 'contains test-secret' } };
        auth.exchange.mockResolvedValue(error);
        auth.verify.mockResolvedValue(error);
        const response = await callback(`?${parameter}=test-secret&type=invite`);
        expect(response.headers.get('location')).toBe('https://app.example/auth/login?auth_error=link_expired');
    });

    it('fails closed when code exchange returns no session', async () => {
        auth.exchange.mockResolvedValue({ data: { session: null }, error: null });
        const response = await callback('?code=test-code');
        expect(response.headers.get('location')).toBe('https://app.example/auth/login?auth_error=callback_failed');
    });

    it('handles OAuth cancellation without reflecting provider errors or creating a client', async () => {
        const response = await callback('?error=access_denied&error_description=test-secret');
        expect(response.headers.get('location')).toBe('https://app.example/auth/login?auth_error=callback_failed');
        expect(auth.client).not.toHaveBeenCalled();
    });

    it.each(['?token_hash=test-hash&type=sms', '?token_hash=&type=invite'])('rejects incomplete or unsupported token verification (%s)', async (query) => {
        const response = await callback(query);
        expect(response.headers.get('location')).toBe('https://app.example/auth/login?auth_error=callback_failed');
        expect(auth.client).not.toHaveBeenCalled();
    });

    it('handles authentication service failures without returning internal details', async () => {
        auth.exchange.mockRejectedValue(new Error('test-secret'));
        const response = await callback('?code=test-code');
        expect(response.headers.get('location')).toBe('https://app.example/auth/login?auth_error=callback_failed');
    });

    it('retains the legacy no-code redirect', async () => {
        const response = await callback();
        expect(response.headers.get('location')).toBe('https://app.example/dashboard');
        expect(auth.client).not.toHaveBeenCalled();
    });
});
