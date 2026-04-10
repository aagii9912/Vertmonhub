import { useMutation, useQueryClient } from '@tanstack/react-query';
import { OrderWithDetails } from './useOrders';
import { toast } from 'sonner';

interface UpdateOrderParams {
    orderId: string;
    status: string;
}

interface BulkUpdateParams {
    orderIds: string[];
    status: string;
}

export function useBulkUpdateOrders() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ orderIds, status }: BulkUpdateParams) => {
            const shopId = typeof window !== 'undefined' ? localStorage.getItem('smarthub_active_shop_id') : null;
            const res = await fetch('/api/orders/bulk', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-shop-id': shopId || ''
                },
                body: JSON.stringify({ orderIds, status }),
            });
            if (!res.ok) throw new Error('Failed to update orders');
            return res.json();
        },
        onMutate: async ({ orderIds, status }) => {
            await queryClient.cancelQueries({ queryKey: ['orders'] });

            const previousQueries = queryClient.getQueriesData<OrderWithDetails[]>({ queryKey: ['orders'] });

            queryClient.setQueriesData<OrderWithDetails[]>({ queryKey: ['orders'] }, (old) => {
                if (!old) return [];
                return old.map((order) =>
                    orderIds.includes(order.id) ? { ...order, status } : order
                );
            });

            return { previousQueries };
        },
        onSuccess: (data) => {
            toast.success(data.message || 'Захиалгууд амжилттай шинэчлэгдлээ');
        },
        onError: (err, variables, context) => {
            toast.error('Бөөнөөр шинэчлэхэд алдаа гарлаа');
            if (context?.previousQueries) {
                context.previousQueries.forEach(([queryKey, data]) => {
                    queryClient.setQueryData(queryKey, data);
                });
            }
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: ['orders'] });
        },
    });
}


export function useUpdateOrder() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ orderId, status }: UpdateOrderParams) => {
            const shopId = typeof window !== 'undefined' ? localStorage.getItem('smarthub_active_shop_id') : null;
            const res = await fetch('/api/orders', {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'x-shop-id': shopId || ''
                },
                body: JSON.stringify({ orderId, status }),
            });
            if (!res.ok) throw new Error('Failed to update status');
            return res.json();
        },
        // Optimistic Update
        onMutate: async ({ orderId, status }) => {
            await queryClient.cancelQueries({ queryKey: ['orders'] });

            const previousQueries = queryClient.getQueriesData<OrderWithDetails[]>({ queryKey: ['orders'] });

            queryClient.setQueriesData<OrderWithDetails[]>({ queryKey: ['orders'] }, (old) => {
                if (!old) return [];
                return old.map((order) =>
                    order.id === orderId ? { ...order, status } : order
                );
            });

            return { previousQueries };
        },
        onSuccess: () => {
            toast.success('Захиалгын төлөв амжилттай шинэчлэгдлээ');
        },
        onError: (err, newTodo, context) => {
            toast.error('Төлөв шинэчлэхэд алдаа гарлаа');
            if (context?.previousQueries) {
                context.previousQueries.forEach(([queryKey, data]) => {
                    queryClient.setQueryData(queryKey, data);
                });
            }
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: ['orders'] });
        },
    });
}
