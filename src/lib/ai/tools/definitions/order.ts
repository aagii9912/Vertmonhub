import { z } from 'zod';
import { ToolDefinition } from './core';

export const CreateOrderSchema = z.object({
    product_name: z.string(),
    quantity: z.number().default(1),
    color: z.string().optional(),
    size: z.string().optional()
});
export type CreateOrderArgs = z.infer<typeof CreateOrderSchema>;

export const CancelOrderSchema = z.object({
    reason: z.string().optional()
});
export type CancelOrderArgs = z.infer<typeof CancelOrderSchema>;

export const CheckOrderStatusSchema = z.object({
    order_id: z.string().optional()
});
export type CheckOrderStatusArgs = z.infer<typeof CheckOrderStatusSchema>;

export const UpdateOrderSchema = z.object({
    action: z.enum(['change_quantity', 'add_item', 'remove_item', 'update_notes']),
    product_name: z.string().optional(),
    new_quantity: z.number().optional(),
    notes: z.string().optional()
});
export type UpdateOrderArgs = z.infer<typeof UpdateOrderSchema>;

export const ORDER_TOOLS: ToolDefinition[] = [
    {
        name: 'create_order',
        description: 'Create a new order when customer explicitly says they want to buy something. Do not use for general inquiries.',
        parameters: { type: 'object', properties: { product_name: { type: 'string', description: 'Name of the product to order (fuzzy match)' }, quantity: { type: 'number', description: 'Quantity to order', default: 1 }, color: { type: 'string', description: 'Selected color variant (optional)' }, size: { type: 'string', description: 'Selected size variant (optional)' } }, required: ['product_name', 'quantity'] }
    },
    {
        name: 'cancel_order',
        description: 'Cancel an order when customer explicitly says they want to cancel their order. This will restore the reserved stock.',
        parameters: { type: 'object', properties: { reason: { type: 'string', description: 'Reason for cancellation' } }, required: [] }
    },
    {
        name: 'check_order_status',
        description: 'Check the status of customer\'s orders. Use when customer asks "Захиалга минь хаана?", "Хүргэлт хэзээ?", "Order status". Returns recent orders with status.',
        parameters: { type: 'object', properties: { order_id: { type: 'string', description: 'Specific order ID if known (optional)' } }, required: [] }
    },
    {
        name: 'update_order',
        description: 'Modify a pending order. Use when customer wants to change quantity, add/remove items, or update details. Only works on pending orders.',
        parameters: { type: 'object', properties: { action: { type: 'string', enum: ['change_quantity', 'add_item', 'remove_item', 'update_notes'], description: 'Type of modification' }, product_name: { type: 'string', description: 'Product to modify (for quantity/add/remove)' }, new_quantity: { type: 'number', description: 'New quantity (for change_quantity)' }, notes: { type: 'string', description: 'Updated notes (for update_notes)' } }, required: ['action'] }
    }
];
