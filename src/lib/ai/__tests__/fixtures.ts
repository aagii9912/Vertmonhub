/**
 * Shared test fixtures for AI eval framework
 */

import { vi } from 'vitest';
import type { ToolExecutionContext } from '@/lib/ai/services/ToolExecutor';

// ─── Products ────────────────────────────────────────────────────
export const MOCK_PRODUCTS = [
    {
        id: 'prod-1',
        name: 'Ноутбүүк Pro 15',
        price: 2500000,
        stock: 10,
        type: 'electronics',
        description: '15 инчийн M3 чипсэт ноутбүүк',
        image_url: 'https://example.com/laptop.jpg',
        images: ['https://example.com/laptop.jpg', 'https://example.com/laptop2.jpg'],
        discount_percent: null,
    },
    {
        id: 'prod-2',
        name: 'Утасны гэр',
        price: 35000,
        stock: 50,
        type: 'accessories',
        description: 'Силикон утасны гэр',
        image_url: 'https://example.com/case.jpg',
        images: ['https://example.com/case.jpg'],
        discount_percent: 20,
    },
    {
        id: 'prod-3',
        name: 'Bluetooth чихэвч',
        price: 180000,
        stock: 0,
        type: 'electronics',
        description: 'Дуу тусгаарлагчтай чихэвч',
        image_url: 'https://example.com/headphone.jpg',
        images: [],
        discount_percent: null,
    },
    {
        id: 'prod-4',
        name: 'USB-C кабель',
        price: 15000,
        stock: 200,
        type: 'accessories',
        description: '1.5м USB-C to USB-C кабель',
        image_url: null,
        images: [],
        discount_percent: 10,
    },
    {
        id: 'prod-5',
        name: 'Гар компьютерийн цүнх',
        price: 89000,
        stock: 15,
        type: 'bags',
        description: '15.6 инч ноутбүүк цүнх',
        image_url: 'https://example.com/bag.jpg',
        images: ['https://example.com/bag.jpg'],
        discount_percent: null,
    },
];

// ─── Context ─────────────────────────────────────────────────────
export function createMockContext(overrides?: Partial<ToolExecutionContext>): ToolExecutionContext {
    return {
        shopId: 'shop-test-001',
        customerId: 'cust-test-001',
        customerName: 'Болд',
        products: MOCK_PRODUCTS as any,
        notifySettings: {
            order: true,
            contact: true,
            support: true,
            cancel: true,
        },
        ...overrides,
    };
}

// ─── Cart ────────────────────────────────────────────────────────
export function createMockCart(items?: any[]) {
    return {
        id: 'cart-test-001',
        items: items || [
            { id: 'ci-1', product_id: 'prod-1', name: 'Ноутбүүк Pro 15', quantity: 1, unit_price: 2500000 },
            { id: 'ci-2', product_id: 'prod-2', name: 'Утасны гэр', quantity: 2, unit_price: 28000 },
        ],
        total_amount: 2556000,
    };
}

// ─── Order ───────────────────────────────────────────────────────
export function createMockOrder(overrides?: Record<string, any>) {
    return {
        id: 'order-test-001',
        status: 'pending',
        total_amount: 2500000,
        total: 2500000,
        created_at: new Date().toISOString(),
        order_items: [
            { id: 'oi-1', product_id: 'prod-1', product_name: 'Ноутбүүк Pro 15', quantity: 1, unit_price: 2500000 },
        ],
        ...overrides,
    };
}

// ─── Supabase Mock ───────────────────────────────────────────────

/**
 * Creates a chainable Supabase mock.
 * @param queryResult - default result from .single() or terminal call
 */
export function createMockSupabase(queryResult: { data: any; error: any } = { data: null, error: null }) {
    const terminalFn = vi.fn().mockResolvedValue(queryResult);

    const chainable: any = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        neq: vi.fn().mockReturnThis(),
        gt: vi.fn().mockReturnThis(),
        lt: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        single: terminalFn,
        insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({ single: terminalFn }),
        }),
        update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null }),
        }),
        delete: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null }),
        }),
    };

    const mockSupabase = {
        from: vi.fn().mockReturnValue(chainable),
        rpc: vi.fn().mockResolvedValue({ data: 'mock-rpc-id', error: null }),
        _chainable: chainable,
        _terminal: terminalFn,
    };

    return mockSupabase;
}

// ─── Common Mocks ────────────────────────────────────────────────
export const MOCK_LOGGER = {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
};

export const MOCK_NOTIFICATIONS = {
    sendOrderNotification: vi.fn().mockResolvedValue({ success: 1, failed: 0 }),
    sendPushNotification: vi.fn().mockResolvedValue({ success: 1, failed: 0 }),
};
