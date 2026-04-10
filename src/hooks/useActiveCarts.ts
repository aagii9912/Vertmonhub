'use client';

import { useQuery } from '@tanstack/react-query';

export interface CartItem {
    id: string;
    name: string;
    price: number;
    quantity: number;
    image?: string;
}

export interface ActiveCart {
    id: string; // Customer ID
    cartId: string;
    customer: {
        id: string;
        name: string;
        facebookId?: string;
        isVip?: boolean;
    };
    lastActive: string;
    itemCount: number;
    totalAmount: number;
    items: CartItem[];
}

async function fetchActiveCarts(): Promise<ActiveCart[]> {
    const res = await fetch('/api/dashboard/active-carts', {
        headers: {
            'x-shop-id': localStorage.getItem('smarthub_active_shop_id') || ''
        }
    });
    if (!res.ok) {
        throw new Error('Failed to fetch active carts');
    }
    const data = await res.json();
    return data.carts || [];
}

export function useActiveCarts() {
    const shopId = typeof window !== 'undefined' ? localStorage.getItem('smarthub_active_shop_id') : null;
    return useQuery({
        queryKey: ['active-carts', shopId],
        queryFn: fetchActiveCarts,
        staleTime: 1000 * 30, // 30 seconds
        refetchInterval: 1000 * 60, // Refetch every minute
    });
}
