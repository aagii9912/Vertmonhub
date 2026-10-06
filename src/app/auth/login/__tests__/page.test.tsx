import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const supabase = vi.hoisted(() => ({ signInWithOAuth: vi.fn() }));
vi.mock('@/lib/supabase-browser', () => ({ createSupabaseBrowserClient: () => ({ auth: supabase }) }));
import LoginPage from '../page';

beforeEach(() => {
    window.history.replaceState({}, '', '/auth/login');
    supabase.signInWithOAuth.mockReset().mockResolvedValue({ data: {}, error: null });
});
afterEach(() => vi.unstubAllGlobals());

/** jsdom navigation is not implemented: replace `location` with one whose `assign` records the target. */
function stubLocation(path: string) {
    const url = new URL(path, window.location.origin);
    const assign = vi.fn();
    vi.stubGlobal('location', { href: url.href, origin: url.origin, pathname: url.pathname, search: url.search, hash: url.hash, assign });
    return assign;
}

const loginPath = (redirectUrl: string) => `/auth/login?redirect_url=${encodeURIComponent(redirectUrl)}`;

function submitPassword() {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ success: true }), { status: 200 })));
    render(<LoginPage />);
    fireEvent.change(screen.getByLabelText('Имэйл'), { target: { value: 'user@example.mn' } });
    fireEvent.change(screen.getByLabelText('Нууц үг'), { target: { value: 'secret' } });
    fireEvent.submit(screen.getByRole('button', { name: 'Нэвтрэх' }).closest('form')!);
}

describe('callback login feedback', () => {
    it.each([
        ['link_expired', 'Урилгын холбоосын хугацаа дууссан'],
        ['callback_failed', 'Нэвтрэлтийг баталгаажуулж чадсангүй'],
    ])('shows actionable feedback for %s', (code, message) => {
        window.history.replaceState({}, '', `/auth/login?auth_error=${code}&error_description=test-secret`);
        render(<LoginPage />);
        expect(screen.getByRole('alert')).toHaveTextContent(message);
        expect(screen.getByRole('alert')).not.toHaveTextContent('test-secret');
    });

    it('ignores arbitrary error messages from the URL', () => {
        window.history.replaceState({}, '', '/auth/login?auth_error=test-secret');
        render(<LoginPage />);
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
});

describe('password whitespace hint', () => {
    it('explains surrounding spaces after a failed login without changing the password', async () => {
        const fetchMock = vi.fn(async () => new Response(JSON.stringify({ error: 'Имэйл эсвэл нууц үг буруу байна' }), { status: 401 }));
        vi.stubGlobal('fetch', fetchMock);
        render(<LoginPage />);
        fireEvent.change(screen.getByLabelText('Имэйл'), { target: { value: 'user@example.mn' } });
        fireEvent.change(screen.getByLabelText('Нууц үг'), { target: { value: ' secret ' } });
        fireEvent.submit(screen.getByRole('button', { name: 'Нэвтрэх' }).closest('form')!);
        expect(await screen.findByRole('alert')).toHaveTextContent('хоосон зай байна');
        expect(JSON.parse(String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body)).password).toBe(' secret ');
    });
});

describe('return to the requested page after a password login', () => {
    it('opens /dashboard when no page was requested', async () => {
        const assign = stubLocation('/auth/login');
        submitPassword();
        await waitFor(() => expect(assign).toHaveBeenCalledWith('http://localhost:3000/dashboard'));
    });

    it.each([
        ['/dashboard/leads?status=new', 'http://localhost:3000/dashboard/leads?status=new'],
        ['/marketing/budget', 'http://localhost:3000/marketing/budget'],
        ['/admin/users', 'http://localhost:3000/admin/users'],
    ])('returns to %s', async (requested, expected) => {
        const assign = stubLocation(loginPath(requested));
        submitPassword();
        await waitFor(() => expect(assign).toHaveBeenCalledWith(expected));
    });

    it.each([
        'https://evil.example',
        '//evil.example',
        '/\\evil.example',
        'javascript:alert(1)',
        '/auth/login',
        '/admin/login',
    ])('never leaves the app for redirect_url=%s', async (requested) => {
        const assign = stubLocation(loginPath(requested));
        submitPassword();
        await waitFor(() => expect(assign).toHaveBeenCalledWith('http://localhost:3000/dashboard'));
    });

    it('stays on the login page after a failed login', async () => {
        const assign = stubLocation(loginPath('/admin/users'));
        vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'Имэйл эсвэл нууц үг буруу байна' }), { status: 401 })));
        render(<LoginPage />);
        fireEvent.change(screen.getByLabelText('Имэйл'), { target: { value: 'user@example.mn' } });
        fireEvent.change(screen.getByLabelText('Нууц үг'), { target: { value: 'wrong' } });
        fireEvent.submit(screen.getByRole('button', { name: 'Нэвтрэх' }).closest('form')!);
        expect(await screen.findByRole('alert')).toHaveTextContent('Имэйл эсвэл нууц үг буруу байна');
        expect(assign).not.toHaveBeenCalled();
    });
});

describe('OAuth keeps the requested page through the callback', () => {
    it.each([
        ['Google-ээр нэвтрэх', 'google'],
        ['Facebook-ээр нэвтрэх', 'facebook'],
        ['Apple-ээр нэвтрэх', 'apple'],
    ])('%s passes the safe path as ?next=', async (button, provider) => {
        stubLocation(loginPath('/dashboard/leads?status=new'));
        render(<LoginPage />);
        fireEvent.click(screen.getByRole('button', { name: button }));
        await waitFor(() => expect(supabase.signInWithOAuth).toHaveBeenCalledWith({
            provider,
            options: { redirectTo: `http://localhost:3000/auth/callback?next=${encodeURIComponent('/dashboard/leads?status=new')}` },
        }));
    });

    it.each(['https://evil.example', '//evil.example', '/auth/callback?next=//evil.example'])('uses the plain callback (→ /dashboard) instead of %s', async (requested) => {
        stubLocation(loginPath(requested));
        render(<LoginPage />);
        fireEvent.click(screen.getByRole('button', { name: 'Google-ээр нэвтрэх' }));
        await waitFor(() => expect(supabase.signInWithOAuth).toHaveBeenCalledWith({
            provider: 'google',
            options: { redirectTo: 'http://localhost:3000/auth/callback' },
        }));
    });

    it('shows the provider error and re-enables the buttons', async () => {
        stubLocation('/auth/login');
        supabase.signInWithOAuth.mockResolvedValue({ data: {}, error: { message: 'Provider is not enabled' } });
        render(<LoginPage />);
        fireEvent.click(screen.getByRole('button', { name: 'Facebook-ээр нэвтрэх' }));
        expect(await screen.findByRole('alert')).toHaveTextContent('Provider is not enabled');
        expect(screen.getByRole('button', { name: 'Facebook-ээр нэвтрэх' })).toBeEnabled();
    });
});
