import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useDirector } from './useDirector';
import { useMyStats } from './useMyStats';
import { useNavCounts } from './useNavCounts';

const mocks = vi.hoisted(() => ({ shopId: 'shop-a', userId: 'manager-a', role: 'admin', read: vi.fn() }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ shop: { id: mocks.shopId }, user: { id: mocks.userId, role: mocks.role } }) }));
vi.mock('@/lib/api/dashboardFetch', () => ({ dashboardJson: (...args: unknown[]) => mocks.read(...args), dashboardFetch: async (...args: unknown[]) => ({ ok: true, json: () => mocks.read(...args) }) }));

let client: QueryClient;
function wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
beforeEach(() => {
    Object.assign(mocks, { shopId: 'shop-a', userId: 'manager-a', role: 'admin' });
    vi.clearAllMocks();
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});

describe('dashboard cache privacy', () => {
    for (const scope of ['account', 'shop', 'role']) {
        it(`clears personal, director and badge data when the ${scope} changes`, async () => {
            mocks.read.mockResolvedValue({ leads: 7, manager: { name: 'Private manager' }, recentLeads: [{ customer_phone: '99112233' }], private: true });
            const { result, rerender } = renderHook(() => ({ mine: useMyStats(), director: useDirector(2026, 10), nav: useNavCounts() }), { wrapper });
            await waitFor(() => expect(result.current.mine.data).toBeDefined());
            await waitFor(() => expect(result.current.director.data).toBeDefined());
            await waitFor(() => expect(result.current.nav.leads).toBe(7));
            mocks.read.mockImplementation(() => new Promise(() => {}));
            if (scope === 'account') mocks.userId = 'manager-b';
            if (scope === 'shop') mocks.shopId = 'shop-b';
            if (scope === 'role') mocks.role = 'sales_manager';
            rerender();
            expect(result.current.mine.data).toBeUndefined();
            expect(result.current.director.data).toBeUndefined();
            expect(result.current.nav).toEqual({});
        });
    }
});
