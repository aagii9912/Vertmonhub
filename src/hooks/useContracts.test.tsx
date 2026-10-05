import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useTransferContract } from './useContracts';

const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ shop: { id: 'shop' }, user: { id: 'user', role: 'admin' } }) }));
vi.mock('@/lib/api/dashboardFetch', () => ({ dashboardFetch: (...args: unknown[]) => mocks.fetch(...args), dashboardJson: vi.fn(), dashboardMutate: vi.fn() }));

let client: QueryClient;
function wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
const input = { client_request_id: '11111111-1111-4111-8111-111111111111', kind: 'rename' as const, customer_name: 'Бат-Болд', expected_customer_name: 'Бат Болд' };
const json = (body: unknown, status: number) => ({ ok: status < 400, status, json: async () => body });

beforeEach(() => {
    vi.clearAllMocks();
    client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
});

describe('useTransferContract', () => {
    it('posts the transfer and refreshes contracts, the director board and leads', async () => {
        mocks.fetch.mockResolvedValueOnce(json({ transfer: { id: 't1' }, replayed: false, message: 'Эзэмшигчийн нэр засагдлаа' }, 201));
        const invalidate = vi.spyOn(client, 'invalidateQueries');
        const { result } = renderHook(() => useTransferContract('contract-1'), { wrapper });
        await act(async () => { await expect(result.current.mutateAsync(input)).resolves.toMatchObject({ message: 'Эзэмшигчийн нэр засагдлаа' }); });
        expect(mocks.fetch).toHaveBeenCalledWith('/api/dashboard/contracts/contract-1/transfer', { method: 'POST', body: JSON.stringify(input) });
        expect(invalidate.mock.calls.map(([filters]) => filters?.queryKey)).toEqual([['contracts'], ['director'], ['leads']]);
    });

    it('exposes the HTTP status and re-reads the contract and its history after a conflict', async () => {
        mocks.fetch.mockResolvedValueOnce(json({ error: 'Гэрээний эзэмшигч өөрчлөгдсөн байна' }, 409));
        const invalidate = vi.spyOn(client, 'invalidateQueries');
        const { result } = renderHook(() => useTransferContract('contract-1'), { wrapper });
        await act(async () => {
            await expect(result.current.mutateAsync(input)).rejects.toMatchObject({ message: 'Гэрээний эзэмшигч өөрчлөгдсөн байна', status: 409 });
        });
        expect(invalidate.mock.calls.map(([filters]) => filters?.queryKey)).toEqual([
            ['contracts', 'detail', 'shop', 'contract-1'],
            ['contracts', 'transfers', 'shop', 'contract-1'],
        ]);
    });
});
