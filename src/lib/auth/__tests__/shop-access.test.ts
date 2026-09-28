// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ signedIn: true, header: '', member: true, membershipError: false }));
vi.mock('next/headers', () => ({
    cookies: async () => ({ getAll: () => [], set: vi.fn() }),
    headers: async () => new Headers(state.header ? { 'x-shop-id': state.header } : {}),
}));
vi.mock('@supabase/ssr', () => ({ createServerClient: () => ({ auth: {
    getUser: async () => ({ data: { user: state.signedIn ? { id: 'current-user' } : null }, error: null }),
} }) }));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ from: (table: string) => {
    let rows: Record<string, string>[] = table === 'shops'
        ? [{ id: 'owned-shop', user_id: 'current-user' }, { id: 'member-shop', user_id: 'other-user' }, { id: 'foreign-shop', user_id: 'other-user' }]
        : state.member ? [{ shop_id: 'member-shop', user_id: 'current-user' }] : [];
    const result = () => state.membershipError && table === 'shop_members'
        ? { data: null, error: { message: 'DB unavailable' } } : { data: rows, error: null };
    const query = {
        select: () => query,
        eq: (key: string, value: string) => { rows = rows.filter(row => row[key] === value); return query; },
        single: async () => ({ data: rows[0] || null, error: null }),
        then: (resolve: (value: unknown) => unknown) => Promise.resolve(result()).then(resolve),
    };
    return query;
} }) }));
vi.mock('@/lib/utils/logger', () => ({ logger: { error: vi.fn() } }));

import { getUserShop, assertShopAccess } from '../supabase-auth';
import { getAuthUserShop } from '../auth';

beforeEach(() => { Object.assign(state, { signedIn: true, header: '', member: true, membershipError: false }); });

it('resolves the owner default and requested member shop through both helper names', async () => {
    expect((await getUserShop())?.id).toBe('owned-shop');
    state.header = 'member-shop';
    expect((await getAuthUserShop())?.id).toBe('member-shop');
    expect(await assertShopAccess('member-shop')).toBe('member-shop');
});
it('rejects a forged shop header and explicit foreign ID', async () => {
    state.header = 'foreign-shop';
    expect(await getUserShop()).toBeNull();
    expect(await assertShopAccess()).toBeNull();
    expect(await assertShopAccess('foreign-shop')).toBeNull();
});
it('revoked membership blocks the next request', async () => {
    state.header = 'member-shop';
    expect((await getUserShop())?.id).toBe('member-shop');
    state.member = false;
    expect(await getUserShop()).toBeNull();
});
it('failed membership lookup does not authorize a requested member shop', async () => {
    state.header = 'member-shop';
    state.membershipError = true;
    expect(await getUserShop()).toBeNull();
});
it('unauthenticated callers have no shop access', async () => {
    state.signedIn = false;
    expect(await getUserShop()).toBeNull();
    expect(await assertShopAccess('owned-shop')).toBeNull();
});
