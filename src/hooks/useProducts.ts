import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';


export interface ProductVariant {
    id: string;
    product_id: string;
    sku: string | null;
    name: string;
    options: Record<string, string>;
    price: number | null;
    stock: number;
    is_active: boolean;
}

export interface Product {
    id: string;
    name: string;
    description: string | null;
    price: number;
    stock: number | null;
    reserved_stock: number | null;
    discount_percent: number | null;
    is_active: boolean;
    type: 'physical' | 'service' | 'appointment';
    colors: string[];
    sizes: string[];
    images: string[];
    // Variant support
    has_variants?: boolean;
    variants?: ProductVariant[];
    // Appointment-specific fields
    duration_minutes: number | null;
    available_days: string[] | null;
    start_time: string | null;
    end_time: string | null;
    max_bookings_per_day: number | null;
}

interface ProductsResponse {
    products: Product[];
}

export function useProducts() {
    const shopId = typeof window !== 'undefined' ? localStorage.getItem('smarthub_active_shop_id') : null;
    return useQuery({
        queryKey: ['products', shopId],
        queryFn: async (): Promise<Product[]> => {
            const res = await fetch('/api/dashboard/products', {
                headers: {
                    'x-shop-id': shopId || ''
                }
            });
            if (!res.ok) throw new Error('Failed to fetch products');
            const data: ProductsResponse = await res.json();
            return data.products;
        },
    });
}

export function useCreateProduct() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (productData: Partial<Product>) => {
            const shopId = typeof window !== 'undefined' ? localStorage.getItem('smarthub_active_shop_id') : null;
            const res = await fetch('/api/dashboard/products', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-shop-id': shopId || ''
                },
                body: JSON.stringify(productData),
            });
            if (!res.ok) {
                const error = await res.json();
                throw new Error(error.details?.join(', ') || 'Failed to create product');
            }
            return res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['products'] });
        },
    });
}

export function useUpdateProduct() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (productData: Partial<Product> & { id: string }) => {
            const shopId = typeof window !== 'undefined' ? localStorage.getItem('smarthub_active_shop_id') : null;
            const res = await fetch('/api/dashboard/products', {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'x-shop-id': shopId || ''
                },
                body: JSON.stringify(productData),
            });
            if (!res.ok) {
                const error = await res.json();
                throw new Error(error.details?.join(', ') || 'Failed to update product');
            }
            return res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['products'] });
        },
    });
}

export function useDeleteProduct() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (productId: string) => {
            const shopId = typeof window !== 'undefined' ? localStorage.getItem('smarthub_active_shop_id') : null;
            const res = await fetch(`/api/dashboard/products?id=${productId}`, {
                method: 'DELETE',
                headers: {
                    'x-shop-id': shopId || ''
                }
            });
            if (!res.ok) throw new Error('Failed to delete product');
            return res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['products'] });
        },
    });
}
