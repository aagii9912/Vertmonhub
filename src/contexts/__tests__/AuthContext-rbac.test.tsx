import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Session, AuthChangeEvent } from '@supabase/supabase-js';

const state = vi.hoisted(() => ({
    session: { user: { id: 'fixture-user', email: 'fixture@example.invalid', user_metadata: {} } } as Session,
    onChange: undefined as ((event: AuthChangeEvent, session: Session | null) => void) | undefined,
}));
vi.mock('@/lib/supabase-browser', () => ({
    createSupabaseBrowserClient: () => ({ auth: {
        getSession: async () => ({ data: { session: state.session } }),
        onAuthStateChange: (callback: typeof state.onChange) => {
            state.onChange = callback;
            return { data: { subscription: { unsubscribe: vi.fn() } } };
        },
    } }),
}));
import { AuthProvider, useAuth } from '../AuthContext';

function Reader() {
    const { user, shop, isLoaded } = useAuth();
    return <div>
        <span data-testid="access">{isLoaded ? user?.permissions.modules.join(',') || 'denied' : 'loading'}</span>
        <span data-testid="shop">{shop?.id || 'none'}</span>
    </div>;
}
function me(modules = ['customers'], shops = [{ id: 'fixture-shop', name: 'Fixture' }]) {
    return new Response(JSON.stringify({ role: 'admin', permissions: { modules, canWrite: true, canDelete: true }, shops }), { status: 200 });
}
const fetchMock = vi.fn<typeof fetch>();
beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockImplementation(async () => me());
    vi.stubGlobal('fetch', fetchMock);
    localStorage.clear();
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
});
afterEach(() => vi.unstubAllGlobals());

describe('permission refresh', () => {
    it('refreshes permissions and memberships when returning to the app', async () => {
        render(<AuthProvider><Reader /></AuthProvider>);
        await waitFor(() => expect(screen.getByTestId('access')).toHaveTextContent('customers'));
        fetchMock.mockImplementation(async () => me(['dashboard'], []));
        fireEvent(window, new Event('focus'));
        await waitFor(() => expect(screen.getByTestId('access')).toHaveTextContent('dashboard'));
        expect(screen.getByTestId('shop')).toHaveTextContent('none');
    });
    it('refreshes same-user permissions on token renewal and fails closed on missing permissions', async () => {
        render(<AuthProvider><Reader /></AuthProvider>);
        await waitFor(() => expect(screen.getByTestId('access')).toHaveTextContent('customers'));
        fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ role: 'admin' }), { status: 200 }));
        act(() => state.onChange?.('TOKEN_REFRESHED', state.session));
        await waitFor(() => expect(screen.getByTestId('access')).toHaveTextContent('denied'));
        expect(screen.getByTestId('shop')).toHaveTextContent('none');
    });
    it('a stale permission response cannot restore access after logout', async () => {
        let finish!: (response: Response) => void;
        fetchMock.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
        render(<AuthProvider><Reader /></AuthProvider>);
        await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
        act(() => state.onChange?.('SIGNED_OUT', null));
        await act(async () => finish(me()));
        expect(screen.getByTestId('access')).toHaveTextContent('denied');
        expect(screen.getByTestId('shop')).toHaveTextContent('none');
    });
    it('an older refresh cannot overwrite a later revoked permission response', async () => {
        render(<AuthProvider><Reader /></AuthProvider>);
        await waitFor(() => expect(screen.getByTestId('access')).toHaveTextContent('customers'));
        let older!: (response: Response) => void;
        let newer!: (response: Response) => void;
        fetchMock.mockReturnValueOnce(new Promise(resolve => { older = resolve; }));
        fetchMock.mockReturnValueOnce(new Promise(resolve => { newer = resolve; }));
        fireEvent(window, new Event('focus'));
        await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
        fireEvent(window, new Event('focus'));
        await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
        await act(async () => newer(me(['dashboard'])));
        await act(async () => older(me(['customers'])));
        expect(screen.getByTestId('access')).toHaveTextContent('dashboard');
    });
});
