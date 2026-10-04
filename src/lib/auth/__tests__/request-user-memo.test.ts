import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
    store: { getAll: () => [], set: () => {} } as object,
    user: { id: 'user-1' } as { id: string } | null,
    getUser: vi.fn(),
}));

vi.mock('next/headers', () => ({ cookies: async () => state.store, headers: async () => new Headers() }));
vi.mock('@supabase/ssr', () => ({ createServerClient: () => ({ auth: { getUser: state.getUser } }) }));
vi.mock('@/lib/utils/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

import { getAuthUser, getUserId } from '../supabase-auth';

beforeEach(() => {
    state.store = { getAll: () => [], set: () => {} };
    state.user = { id: 'user-1' };
    state.getUser.mockReset().mockImplementation(async () => ({ data: { user: state.user }, error: null }));
});

describe('getAuthUser per-request memo', () => {
    it('asks Supabase Auth once per request, including parallel callers', async () => {
        const [a, b] = await Promise.all([getUserId(), getAuthUser()]);
        expect(await getUserId()).toBe('user-1');
        expect(a).toBe('user-1');
        expect(b?.id).toBe('user-1');
        expect(state.getUser).toHaveBeenCalledTimes(1);
    });

    it('never shares a user across requests', async () => {
        expect(await getUserId()).toBe('user-1');
        state.store = { getAll: () => [], set: () => {} }; // next request
        state.user = { id: 'user-2' };
        expect(await getUserId()).toBe('user-2');
        expect(state.getUser).toHaveBeenCalledTimes(2);
    });

    it('does not remember a missing user or an error', async () => {
        state.user = null;
        expect(await getAuthUser()).toBeNull();
        state.user = { id: 'user-1' }; // e.g. signed in later in the same request
        expect(await getUserId()).toBe('user-1');
        state.getUser.mockRejectedValueOnce(new Error('network'));
        state.store = { getAll: () => [], set: () => {} };
        await expect(getAuthUser()).rejects.toThrow('network');
        expect(await getUserId()).toBe('user-1');
        expect(state.getUser).toHaveBeenCalledTimes(4);
    });
});
