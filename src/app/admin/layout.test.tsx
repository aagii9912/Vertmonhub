import React, { type PropsWithChildren } from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
    auth: { isSignedIn: true, isLoaded: true, user: { id: 'admin-a', role: 'super_admin' } },
    router: { replace: vi.fn() },
}));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => state.auth }));
vi.mock('next/navigation', () => ({ useRouter: () => state.router, usePathname: () => '/admin/users' }));
vi.mock('next/link', () => ({ default: ({ children, href }: PropsWithChildren<{ href: string }>) => <a href={href}>{children}</a> }));
import Layout from './layout';

const allowed = (email = 'admin-a@example.invalid') => ({ ok: true, json: async () => ({ admin: { email, role: 'super_admin' } }) });
beforeEach(() => {
    state.auth = { isSignedIn: true, isLoaded: true, user: { id: 'admin-a', role: 'super_admin' } };
    state.router.replace.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

it('hides admin content as soon as the context revokes the role', async () => {
    const fetcher = vi.fn(async () => allowed());
    vi.stubGlobal('fetch', fetcher);
    const { rerender } = render(<Layout><div>Private admin content</div></Layout>);
    await screen.findByText('Private admin content');
    state.auth = { ...state.auth, user: { id: 'admin-a', role: 'viewer' } };
    rerender(<Layout><div>Private admin content</div></Layout>);
    expect(screen.queryByText('Private admin content')).not.toBeInTheDocument();
    expect(state.router.replace).toHaveBeenCalledWith('/dashboard');
    expect(fetcher).toHaveBeenCalledTimes(1);
});

it('requires a new authorization check after a same-role identity switch', async () => {
    let finish!: (value: ReturnType<typeof allowed>) => void;
    const fetcher = vi.fn().mockResolvedValueOnce(allowed()).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    vi.stubGlobal('fetch', fetcher);
    const { rerender } = render(<Layout><div>Private admin content</div></Layout>);
    await screen.findByText('Private admin content');
    state.auth = { ...state.auth, user: { id: 'admin-b', role: 'super_admin' } };
    rerender(<Layout><div>Private admin content</div></Layout>);
    expect(screen.queryByText('Private admin content')).not.toBeInTheDocument();
    await act(async () => finish(allowed('admin-b@example.invalid')));
    expect(screen.getByText('Private admin content')).toBeInTheDocument();
    expect(screen.getByText('admin-b@example.invalid')).toBeInTheDocument();
});

it('ignores a stale rejected authorization response after the identity changes', async () => {
    let finishA!: (value: { ok: boolean }) => void;
    let finishB!: (value: ReturnType<typeof allowed>) => void;
    const fetcher = vi.fn()
        .mockImplementationOnce(() => new Promise(resolve => { finishA = resolve; }))
        .mockImplementationOnce(() => new Promise(resolve => { finishB = resolve; }));
    vi.stubGlobal('fetch', fetcher);
    const { rerender } = render(<Layout><div>Private admin content</div></Layout>);
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    state.auth = { ...state.auth, user: { id: 'admin-b', role: 'super_admin' } };
    rerender(<Layout><div>Private admin content</div></Layout>);
    await act(async () => finishA({ ok: false }));
    expect(state.router.replace).not.toHaveBeenCalled();
    await act(async () => finishB(allowed('admin-b@example.invalid')));
    expect(screen.getByText('Private admin content')).toBeInTheDocument();
});
