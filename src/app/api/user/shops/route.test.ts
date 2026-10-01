// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ signedIn: true, memberError: false }));
const from = vi.hoisted(() => vi.fn());
vi.mock('@/lib/auth/supabase-auth', () => ({
    getUserId: async () => state.signedIn ? 'user-1' : null,
    supabaseAdmin: () => ({ from }),
}));
vi.mock('@/lib/auth/require-permission', () => ({ requireModuleWrite: vi.fn() }));
import { GET } from './route';

beforeEach(() => {
    state.signedIn = true;
    state.memberError = false;
    from.mockReset().mockImplementation((table: string) => {
        const query = {
            select: () => query,
            eq: () => query,
            or: () => query,
            order: () => query,
            then: (resolve: (result: unknown) => unknown) => Promise.resolve(table === 'shop_members'
                ? { data: state.memberError ? null : [{ shop_id: 'member-shop' }], error: state.memberError ? new Error('Membership unavailable') : null }
                : { data: [{ id: 'member-shop', name: 'Member organization' }], error: null }).then(resolve),
        };
        return query;
    });
});

it('requires authentication before reading memberships', async () => {
    state.signedIn = false;
    expect((await GET()).status).toBe(401);
    expect(from).not.toHaveBeenCalled();
});

it('surfaces a failed membership lookup instead of returning an incomplete organization list', async () => {
    state.memberError = true;
    const response = await GET();
    expect(response.status).toBe(500);
    expect(from.mock.calls.map(([table]) => table)).toEqual(['shop_members']);
    expect(await response.json()).not.toHaveProperty('shops');
});

it('returns authorized organizations with private no-store caching', async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(await response.json()).toEqual({ shops: [{ id: 'member-shop', name: 'Member organization' }] });
});
