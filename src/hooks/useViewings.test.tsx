import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useViewings } from './useViewings';

const mocks = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ shop: { id: 'shop-a' }, user: { id: 'manager-a', role: 'sales_manager' } }) }));
vi.mock('@/lib/api/dashboardFetch', () => ({ dashboardJson: (...args: unknown[]) => mocks.read(...args), dashboardMutate: vi.fn() }));

beforeEach(() => {
    vi.clearAllMocks();
    mocks.read.mockResolvedValue({ viewings: [], counts: { today: 0, upcoming: 0, past: 0 } });
});

describe('useViewings', () => {
    it('shares one request between the agenda list and the 7-day strip when their filters match', async () => {
        const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
        const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
        const { result } = renderHook(() => ({
            list: useViewings({ range: 'upcoming', status: 'all', manager: 'all' }),
            week: useViewings({ range: 'upcoming', manager: 'all' }),
            filtered: useViewings({ range: 'upcoming', status: 'completed', manager: 'Номин' }),
        }), { wrapper });
        await waitFor(() => expect(result.current.week.data).toBeDefined());
        await waitFor(() => expect(result.current.filtered.data).toBeDefined());
        expect(mocks.read).toHaveBeenCalledTimes(2);
        expect(mocks.read.mock.calls.map(([url]) => url)).toEqual(expect.arrayContaining([
            '/api/dashboard/viewings?range=upcoming',
            `/api/dashboard/viewings?range=upcoming&status=completed&manager=${encodeURIComponent('Номин')}`,
        ]));
        expect(result.current.list.data).toBe(result.current.week.data);
    });
});
