import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useReorderLeadCategories } from './useLeadCategorySettings';

const mocks = vi.hoisted(() => ({ mutate: vi.fn() }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ shop: { id: 'shop' }, user: { id: 'admin', role: 'admin' } }) }));
vi.mock('@/lib/api/dashboardFetch', () => ({ dashboardJson: vi.fn(), dashboardMutate: (...args: unknown[]) => mocks.mutate(...args) }));

const row = (id: string, sort_order: number) => ({ id, name: id, description: null, tone: 'neutral', sort_order, is_active: true });
const listKey = ['lead-categories', 'shop', 'admin', 'admin'];
const countsKey = ['lead-categories', 'counts', 'shop', 'admin', 'admin'];
let client: QueryClient;
function wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
    vi.clearAllMocks();
    client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    client.setQueryData(listKey, [row('a', 0), row('b', 0), row('c', 0)]);
    client.setQueryData(countsKey, { byCategory: { a: 1, b: 0, c: 0 }, uncategorized: 0, referenced: ['a'] });
    client.setQueryData(['operations-report', 'x'], { ok: true });
});

describe('useReorderLeadCategories', () => {
    it('sends one request, reorders the list at once and refreshes the list but not the lead counts', async () => {
        let resolve!: (value: unknown) => void;
        mocks.mutate.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
        const { result } = renderHook(() => useReorderLeadCategories(), { wrapper });
        act(() => result.current.mutate(['c', 'a', 'b']));
        await waitFor(() => expect(client.getQueryData<{ id: string }[]>(listKey)?.map((r) => r.id)).toEqual(['c', 'a', 'b']));
        expect(client.getQueryData<{ sort_order: number }[]>(listKey)?.map((r) => r.sort_order)).toEqual([10, 20, 30]);
        expect(mocks.mutate).toHaveBeenCalledTimes(1);
        expect(mocks.mutate).toHaveBeenCalledWith('/api/dashboard/lead-categories', 'PATCH', { order: ['c', 'a', 'b'] });

        await act(async () => { resolve({ categories: [row('c', 10), row('a', 20), row('b', 30)] }); });
        await waitFor(() => expect(result.current.isSuccess).toBe(true));
        expect(client.getQueryState(listKey)?.isInvalidated).toBe(true);
        expect(client.getQueryState(['operations-report', 'x'])?.isInvalidated).toBe(true);
        expect(client.getQueryState(countsKey)?.isInvalidated).toBe(false);
    });

    it('restores the previous order when the save fails', async () => {
        mocks.mutate.mockRejectedValueOnce(new Error('Ангиллын жагсаалт өөрчлөгдсөн байна.'));
        const { result } = renderHook(() => useReorderLeadCategories(), { wrapper });
        act(() => result.current.mutate(['b', 'a', 'c']));
        await waitFor(() => expect(result.current.isError).toBe(true));
        expect(client.getQueryData<{ id: string }[]>(listKey)?.map((r) => r.id)).toEqual(['a', 'b', 'c']);
    });
});
