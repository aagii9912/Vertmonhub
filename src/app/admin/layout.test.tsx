import React, { type PropsWithChildren } from 'react';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Auth = { isSignedIn: boolean; isLoaded: boolean; user: { id: string; role: string } | null };
const signedInAdmin = (): Auth => ({ isSignedIn: true, isLoaded: true, user: { id: 'admin-a', role: 'super_admin' } });

const state = vi.hoisted(() => ({
    auth: null as unknown as Auth,
    pathname: '/admin/users',
    router: { replace: vi.fn() },
}));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => state.auth }));
vi.mock('next/navigation', () => ({ useRouter: () => state.router, usePathname: () => state.pathname }));
vi.mock('@/components/dashboard/AppShell', () => ({
    AppShell: ({ children }: PropsWithChildren) => <div data-testid="app-shell">{children}</div>,
}));
import Layout from './layout';

const allowed = (email = 'admin-a@example.invalid') => ({ ok: true, json: async () => ({ admin: { email, role: 'super_admin' } }) });
const denied = () => ({ ok: false, status: 403, json: async () => ({ error: 'Admin эрх шаардлагатай' }) });
/** Fresh element per render: React skips re-rendering an identical element object. */
const page = () => <Layout><div>Private admin content</div></Layout>;

beforeEach(() => {
    state.auth = signedInAdmin();
    state.pathname = '/admin/users';
    state.router.replace.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

describe('admin guard', () => {
    it('shows only a spinner while auth is loading', () => {
        const fetcher = vi.fn();
        vi.stubGlobal('fetch', fetcher);
        state.auth = { isSignedIn: false, isLoaded: false, user: null };
        render(page());
        expect(screen.getByRole('status')).toBeInTheDocument();
        expect(screen.queryByText('Private admin content')).not.toBeInTheDocument();
        expect(screen.queryByTestId('app-shell')).not.toBeInTheDocument();
        expect(fetcher).not.toHaveBeenCalled();
        expect(state.router.replace).not.toHaveBeenCalled();
    });

    it('keeps the spinner until the server settings check answers', async () => {
        let finish!: (value: ReturnType<typeof allowed>) => void;
        vi.stubGlobal('fetch', vi.fn(() => new Promise(resolve => { finish = resolve; })));
        render(page());
        expect(screen.getByRole('status')).toBeInTheDocument();
        expect(screen.queryByText('Private admin content')).not.toBeInTheDocument();
        await act(async () => finish(allowed()));
        expect(screen.queryByRole('status')).not.toBeInTheDocument();
        expect(screen.getByText('Private admin content')).toBeInTheDocument();
    });

    it('sends a signed-out visitor to the login page with the requested admin path', async () => {
        const fetcher = vi.fn();
        vi.stubGlobal('fetch', fetcher);
        state.auth = { isSignedIn: false, isLoaded: true, user: null };
        state.pathname = '/admin/sales-targets';
        render(page());
        await waitFor(() => expect(state.router.replace).toHaveBeenCalledWith('/auth/login?redirect_url=%2Fadmin%2Fsales-targets'));
        expect(state.router.replace).toHaveBeenCalledTimes(1);
        expect(screen.queryByText('Private admin content')).not.toBeInTheDocument();
        expect(fetcher).not.toHaveBeenCalled();
    });

    it.each(['admin', 'sales_manager', 'marketing', 'viewer'])('sends a signed-in %s to /dashboard without the settings check', async (role) => {
        const fetcher = vi.fn();
        vi.stubGlobal('fetch', fetcher);
        state.auth = { isSignedIn: true, isLoaded: true, user: { id: 'staff-a', role } };
        render(page());
        await waitFor(() => expect(state.router.replace).toHaveBeenCalledWith('/dashboard'));
        expect(screen.queryByText('Private admin content')).not.toBeInTheDocument();
        expect(fetcher).not.toHaveBeenCalled();
    });

    it('renders a super_admin page inside the main AppShell after the settings check', async () => {
        const fetcher = vi.fn(async () => allowed());
        vi.stubGlobal('fetch', fetcher);
        render(page());
        const shell = await screen.findByTestId('app-shell');
        expect(within(shell).getByText('Private admin content')).toBeInTheDocument();
        expect(fetcher).toHaveBeenCalledWith('/api/admin/settings', { cache: 'no-store' });
        expect(state.router.replace).not.toHaveBeenCalled();
    });

    it('does not re-check or flash the spinner when moving between admin pages', async () => {
        const fetcher = vi.fn(async () => allowed());
        vi.stubGlobal('fetch', fetcher);
        const { rerender } = render(page());
        await screen.findByText('Private admin content');
        state.pathname = '/admin/projects';
        rerender(page());
        expect(screen.getByText('Private admin content')).toBeInTheDocument();
        expect(screen.queryByRole('status')).not.toBeInTheDocument();
        expect(fetcher).toHaveBeenCalledTimes(1);
    });

    it('redirects to /dashboard when the server settings check is refused', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => denied()));
        render(page());
        await waitFor(() => expect(state.router.replace).toHaveBeenCalledWith('/dashboard'));
        expect(screen.queryByText('Private admin content')).not.toBeInTheDocument();
        expect(screen.queryByTestId('app-shell')).not.toBeInTheDocument();
    });

    it('redirects to /dashboard when the settings check cannot be reached', async () => {
        const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
        vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
        render(page());
        await waitFor(() => expect(state.router.replace).toHaveBeenCalledWith('/dashboard'));
        expect(screen.queryByText('Private admin content')).not.toBeInTheDocument();
        expect(logged).toHaveBeenCalled();
        logged.mockRestore();
    });
});

describe('identity changes', () => {
    it('hides admin content as soon as the context revokes the role', async () => {
        const fetcher = vi.fn(async () => allowed());
        vi.stubGlobal('fetch', fetcher);
        const { rerender } = render(page());
        await screen.findByText('Private admin content');
        state.auth = { ...state.auth, user: { id: 'admin-a', role: 'viewer' } };
        rerender(page());
        expect(screen.queryByText('Private admin content')).not.toBeInTheDocument();
        expect(state.router.replace).toHaveBeenCalledWith('/dashboard');
        expect(fetcher).toHaveBeenCalledTimes(1);
    });

    it('checks again when the role comes back for the same user', async () => {
        const fetcher = vi.fn(async () => allowed());
        vi.stubGlobal('fetch', fetcher);
        const { rerender } = render(page());
        await screen.findByText('Private admin content');
        state.auth = { ...state.auth, user: { id: 'admin-a', role: 'viewer' } };
        rerender(page());
        state.auth = signedInAdmin();
        rerender(page());
        expect(screen.queryByText('Private admin content')).not.toBeInTheDocument();
        await screen.findByText('Private admin content');
        expect(fetcher).toHaveBeenCalledTimes(2);
    });

    it('hides admin content when the user signs out', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => allowed()));
        const { rerender } = render(page());
        await screen.findByText('Private admin content');
        state.auth = { isSignedIn: false, isLoaded: true, user: null };
        rerender(page());
        expect(screen.queryByText('Private admin content')).not.toBeInTheDocument();
        expect(state.router.replace).toHaveBeenCalledWith('/auth/login?redirect_url=%2Fadmin%2Fusers');
    });

    it('requires a new authorization check after a same-role identity switch', async () => {
        let finish!: (value: ReturnType<typeof allowed>) => void;
        const fetcher = vi.fn().mockResolvedValueOnce(allowed()).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
        vi.stubGlobal('fetch', fetcher);
        const { rerender } = render(page());
        await screen.findByText('Private admin content');
        state.auth = { ...state.auth, user: { id: 'admin-b', role: 'super_admin' } };
        rerender(page());
        expect(screen.queryByText('Private admin content')).not.toBeInTheDocument();
        expect(screen.getByRole('status')).toBeInTheDocument();
        await act(async () => finish(allowed('admin-b@example.invalid')));
        expect(screen.getByText('Private admin content')).toBeInTheDocument();
        expect(fetcher).toHaveBeenCalledTimes(2);
    });

    it('ignores a stale rejected authorization response after the identity changes', async () => {
        let finishA!: (value: ReturnType<typeof denied>) => void;
        let finishB!: (value: ReturnType<typeof allowed>) => void;
        const fetcher = vi.fn()
            .mockImplementationOnce(() => new Promise(resolve => { finishA = resolve; }))
            .mockImplementationOnce(() => new Promise(resolve => { finishB = resolve; }));
        vi.stubGlobal('fetch', fetcher);
        const { rerender } = render(page());
        await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
        state.auth = { ...state.auth, user: { id: 'admin-b', role: 'super_admin' } };
        rerender(page());
        await act(async () => finishA(denied()));
        expect(state.router.replace).not.toHaveBeenCalled();
        await act(async () => finishB(allowed('admin-b@example.invalid')));
        expect(screen.getByText('Private admin content')).toBeInTheDocument();
    });
});
