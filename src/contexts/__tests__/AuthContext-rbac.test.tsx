import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Session, AuthChangeEvent } from '@supabase/supabase-js';

const state = vi.hoisted(() => ({
    session: { user: { id: 'fixture-user', email: 'fixture@example.invalid', user_metadata: {} } } as Session,
    onChange: undefined as ((event: AuthChangeEvent, session: Session | null) => void) | undefined,
    sessionGate: Promise.resolve() as Promise<void>,
}));
vi.mock('@/lib/supabase-browser', () => ({
    createSupabaseBrowserClient: () => ({ auth: {
        getSession: async () => {
            await state.sessionGate;
            return { data: { session: state.session } };
        },
        onAuthStateChange: (callback: typeof state.onChange) => {
            state.onChange = callback;
            return { data: { subscription: { unsubscribe: vi.fn() } } };
        },
    } }),
}));
import { AuthProvider, useAuth } from '../AuthContext';

function Reader() {
    const { user, shop, isLoaded, refreshShops } = useAuth();
    return <div>
        <span data-testid="access">{isLoaded ? user?.permissions.modules.join(',') || 'denied' : 'loading'}</span>
        <span data-testid="shop">{shop?.id || 'none'}</span>
        <button onClick={() => void refreshShops()}>Байгууллагууд шинэчлэх</button>
    </div>;
}
function me(modules = ['customers'], shops = [{ id: 'fixture-shop', name: 'Fixture' }]) {
    return new Response(JSON.stringify({ role: 'admin', permissions: { modules, canWrite: true, canDelete: true }, shops }), { status: 200 });
}
const fetchMock = vi.fn<typeof fetch>();
beforeEach(() => {
    state.session = { user: { id: 'fixture-user', email: 'fixture@example.invalid', user_metadata: {} } } as Session;
    state.sessionGate = Promise.resolve();
    fetchMock.mockReset();
    fetchMock.mockImplementation(async () => me());
    vi.stubGlobal('fetch', fetchMock);
    localStorage.clear();
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
});
afterEach(() => vi.unstubAllGlobals());

describe('permission refresh', () => {
    it('keeps initial access loading until the latest token refresh finishes', async () => {
        let initial!: (response: Response) => void;
        let refreshed!: (response: Response) => void;
        fetchMock.mockReturnValueOnce(new Promise(resolve => { initial = resolve; }));
        fetchMock.mockReturnValueOnce(new Promise(resolve => { refreshed = resolve; }));
        render(<AuthProvider><Reader /></AuthProvider>);
        await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
        act(() => state.onChange?.('TOKEN_REFRESHED', state.session));
        await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
        await act(async () => initial(me()));
        expect(screen.getByTestId('access')).toHaveTextContent('loading');
        await act(async () => refreshed(me(['dashboard'])));
        expect(screen.getByTestId('access')).toHaveTextContent('dashboard');
    });
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
    it('clears prior admin access while a different account is loading', async () => {
        render(<AuthProvider><Reader /></AuthProvider>);
        await waitFor(() => expect(screen.getByTestId('access')).toHaveTextContent('customers'));
        let finish!: (response: Response) => void;
        fetchMock.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
        const nextSession = { user: { id: 'next-user', email: 'next@example.invalid', user_metadata: {} } } as Session;
        act(() => state.onChange?.('SIGNED_IN', nextSession));
        expect(screen.getByTestId('access')).toHaveTextContent('loading');
        expect(screen.getByTestId('shop')).toHaveTextContent('none');
        expect(localStorage.getItem('vertmonhub_active_shop_id')).toBeNull();
        await act(async () => finish(me(['dashboard'], [{ id: 'next-shop', name: 'Next' }])));
        await waitFor(() => expect(screen.getByTestId('access')).toHaveTextContent('dashboard'));
        expect(screen.getByTestId('shop')).toHaveTextContent('next-shop');
    });
    it('a failed shop refresh preserves the selected organization for retry', async () => {
        render(<AuthProvider><Reader /></AuthProvider>);
        await waitFor(() => expect(screen.getByTestId('shop')).toHaveTextContent('fixture-shop'));
        fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: 'Temporary failure' }), { status: 500 }));
        fireEvent.click(screen.getByText('Байгууллагууд шинэчлэх'));
        await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
        expect(screen.getByTestId('shop')).toHaveTextContent('fixture-shop');
        expect(localStorage.getItem('vertmonhub_active_shop_id')).toBe('fixture-shop');
    });
    it('a stale shop refresh cannot restore membership after logout', async () => {
        render(<AuthProvider><Reader /></AuthProvider>);
        await waitFor(() => expect(screen.getByTestId('access')).toHaveTextContent('customers'));
        let finish!: (response: Response) => void;
        fetchMock.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
        fireEvent.click(screen.getByText('Байгууллагууд шинэчлэх'));
        await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
        act(() => state.onChange?.('SIGNED_OUT', null));
        await act(async () => finish(new Response(JSON.stringify({ shops: [{ id: 'fixture-shop', name: 'Fixture' }] }))));
        expect(screen.getByTestId('access')).toHaveTextContent('denied');
        expect(screen.getByTestId('shop')).toHaveTextContent('none');
    });
});

describe('selected project', () => {
    const twoShops = [{ id: 'first-shop', name: 'First' }, { id: 'second-shop', name: 'Second' }];

    it('survives a page load whose token refresh event arrives before getSession', async () => {
        let release!: () => void;
        state.sessionGate = new Promise(resolve => { release = resolve; });
        localStorage.setItem('vertmonhub_active_shop_id', 'second-shop');
        fetchMock.mockImplementation(async () => me(['customers'], twoShops));
        render(<AuthProvider><Reader /></AuthProvider>);
        act(() => state.onChange?.('TOKEN_REFRESHED', state.session));
        await waitFor(() => expect(screen.getByTestId('shop')).toHaveTextContent('second-shop'));
        await act(async () => release());
        expect(screen.getByTestId('shop')).toHaveTextContent('second-shop');
        expect(localStorage.getItem('vertmonhub_active_shop_id')).toBe('second-shop');
    });
    it('a failed access refresh keeps the selected project for the next load', async () => {
        localStorage.setItem('vertmonhub_active_shop_id', 'second-shop');
        fetchMock.mockImplementation(async () => me(['customers'], twoShops));
        render(<AuthProvider><Reader /></AuthProvider>);
        await waitFor(() => expect(screen.getByTestId('shop')).toHaveTextContent('second-shop'));
        fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: 'Temporary failure' }), { status: 500 }));
        fireEvent(window, new Event('focus'));
        await waitFor(() => expect(screen.getByTestId('access')).toHaveTextContent('denied'));
        expect(localStorage.getItem('vertmonhub_active_shop_id')).toBe('second-shop');
    });
    it('forgets the selected project on sign-out', async () => {
        localStorage.setItem('vertmonhub_active_shop_id', 'second-shop');
        fetchMock.mockImplementation(async () => me(['customers'], twoShops));
        render(<AuthProvider><Reader /></AuthProvider>);
        await waitFor(() => expect(screen.getByTestId('shop')).toHaveTextContent('second-shop'));
        act(() => state.onChange?.('SIGNED_OUT', null));
        expect(screen.getByTestId('shop')).toHaveTextContent('none');
        expect(localStorage.getItem('vertmonhub_active_shop_id')).toBeNull();
    });
});
