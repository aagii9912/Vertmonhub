import { useQuery } from '@tanstack/react-query';

// Match the specific shape returned by /api/orders
export interface OrderWithDetails {
    id: string;
    total_amount: number;
    status: string;
    notes: string | null;
    delivery_address: string | null;
    created_at: string;
    updated_at: string;
    customers: {
        id: string;
        name: string | null;
        phone: string | null;
        address: string | null;
        facebook_id: string | null;
    } | null;
    order_items: Array<{
        id: string;
        quantity: number;
        unit_price: number;
        products: {
            id: string;
            name: string;
            price: number;
        } | null;
    }>;
}

interface OrdersResponse {
    orders: OrderWithDetails[];
}

export function useOrders(dateRange?: { from: Date | undefined; to: Date | undefined }) {
    const shopId = typeof window !== 'undefined' ? localStorage.getItem('smarthub_active_shop_id') : null;
    return useQuery({
        queryKey: ['orders', shopId, dateRange?.from?.toISOString(), dateRange?.to?.toISOString()],
        queryFn: async (): Promise<OrderWithDetails[]> => {
            const params = new URLSearchParams();
            if (dateRange?.from) params.set('from', dateRange.from.toISOString());
            if (dateRange?.to) params.set('to', dateRange.to.toISOString());

            const res = await fetch(`/api/dashboard/orders?${params.toString()}`, {
                headers: {
                    'x-shop-id': shopId || ''
                }
            });
            if (!res.ok) throw new Error('Failed to fetch orders');
            const data: OrdersResponse = await res.json();
            return data.orders;
        },
        // Refetch every 30 seconds for background updates, but rely on optimistic updates for local changes
        refetchInterval: 30000,
    });
}
