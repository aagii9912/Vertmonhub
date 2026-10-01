import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useLeadsList, useManagers } from './useLeads';
import { usePropertySearch } from './useViewings';

const mocks = vi.hoisted(() => ({ userId: 'manager-a', role: 'admin', json: vi.fn() }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ shop: { id: 'shop' }, user: { id: mocks.userId, role: mocks.role } }) }));
vi.mock('@/lib/api/dashboardFetch', () => ({ dashboardJson: (...args: unknown[]) => mocks.json(...args), dashboardMutate: vi.fn() }));

function wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
let client: QueryClient;
beforeEach(() => {
    mocks.userId = 'manager-a';
    mocks.role = 'admin';
    vi.clearAllMocks();
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});

describe('lead query scope', () => {
    it.each(['account', 'role'])('sends the project filter and clears previous data when the %s changes', async scope => {
        mocks.json.mockResolvedValueOnce({ leads: [{ id: 'lead-a' }], pagination: { total: 1 } });
        const { result, rerender } = renderHook(() => useLeadsList({ view: 'all', project: 'mandala', page: 1, pageSize: 25 }), { wrapper });
        await waitFor(() => expect(result.current.data?.leads[0].id).toBe('lead-a'));
        expect(mocks.json).toHaveBeenCalledWith(expect.stringContaining('project=mandala'));
        mocks.json.mockImplementationOnce(() => new Promise(() => {}));
        if (scope === 'account') mocks.userId = 'manager-b';
        else mocks.role = 'sales_manager';
        rerender();
        expect(result.current.data).toBeUndefined();
        expect(result.current.isLoading).toBe(true);
    });

    it('does not fetch managers for a legacy lead without a project', () => {
        renderHook(() => useManagers(null), { wrapper });
        expect(mocks.json).not.toHaveBeenCalled();
    });

    it('requests eligible managers for the selected project', async () => {
        mocks.json.mockResolvedValueOnce({ managers: [{ name: 'Mandala manager', is_active: true }] });
        const { result } = renderHook(() => useManagers('mandala'), { wrapper });
        await waitFor(() => expect(result.current.data).toHaveLength(1));
        expect(mocks.json).toHaveBeenCalledWith('/api/dashboard/managers?project=mandala');
    });

    it('waits for a viewing project and clears properties when the project changes', async () => {
        let projectId: string | null = null;
        mocks.json.mockResolvedValueOnce({ properties: [{ id: 'mandala-property' }] });
        const { result, rerender } = renderHook(() => usePropertySearch('', true, projectId), { wrapper });
        expect(mocks.json).not.toHaveBeenCalled();
        projectId = 'mandala';
        rerender();
        await waitFor(() => expect(result.current.data?.[0].id).toBe('mandala-property'));
        expect(mocks.json).toHaveBeenCalledWith('/api/dashboard/properties/search?q=&project=mandala');
        mocks.json.mockImplementationOnce(() => new Promise(() => {}));
        projectId = 'elysium';
        rerender();
        expect(result.current.data).toBeUndefined();
    });
});
