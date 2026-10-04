import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useDashboardQuery } from './useDashboardQuery';

const mocks = vi.hoisted(() => ({ shopId: 'shop-a' as string | null, userId: 'user-a', role: 'admin', read: vi.fn() }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ shop: mocks.shopId ? { id: mocks.shopId } : null, user: { id: mocks.userId, role: mocks.role } }) }));
vi.mock('@/lib/api/dashboardFetch', () => ({ dashboardJson: (...args: unknown[]) => mocks.read(...args) }));

let client: QueryClient;
const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;

beforeEach(() => {
    Object.assign(mocks, { shopId: 'shop-a', userId: 'user-a', role: 'admin' });
    mocks.read.mockReset();
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});

describe('useDashboardQuery', () => {
    it('reads through dashboardJson and never shows another account or organization data', async () => {
        mocks.read.mockResolvedValue({ rows: ['private'] });
        const { result, rerender } = renderHook(() => useDashboardQuery<{ rows: string[] }>(['things'], '/api/dashboard/things', { keepPreviousData: true }), { wrapper });
        await waitFor(() => expect(result.current.data).toEqual({ rows: ['private'] }));
        expect(mocks.read).toHaveBeenCalledWith('/api/dashboard/things');
        mocks.read.mockImplementation(() => new Promise(() => {}));
        mocks.shopId = 'shop-b';
        rerender();
        expect(result.current.data).toBeUndefined();
    });

    it('waits for an organization and a URL, and surfaces failures', async () => {
        mocks.shopId = null;
        const idle = renderHook(() => useDashboardQuery(['things'], '/api/dashboard/things'), { wrapper });
        expect(idle.result.current.fetchStatus).toBe('idle');
        mocks.shopId = 'shop-a';
        const noUrl = renderHook(() => useDashboardQuery(['things'], null), { wrapper });
        expect(noUrl.result.current.fetchStatus).toBe('idle');
        mocks.read.mockRejectedValue(new Error('Хүсэлт амжилтгүй (500)'));
        const failing = renderHook(() => useDashboardQuery(['things'], '/api/dashboard/things'), { wrapper });
        await waitFor(() => expect(failing.result.current.error?.message).toBe('Хүсэлт амжилтгүй (500)'));
    });
});
