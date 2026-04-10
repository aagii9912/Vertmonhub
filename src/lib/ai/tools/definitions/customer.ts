import { z } from 'zod';
import { ToolDefinition } from './core';

export const CollectContactSchema = z.object({
    phone: z.string().optional(),
    address: z.string().optional(),
    name: z.string().optional()
});
export type CollectContactArgs = z.infer<typeof CollectContactSchema>;

export const RequestHumanSupportSchema = z.object({
    reason: z.string()
});
export type RequestHumanSupportArgs = z.infer<typeof RequestHumanSupportSchema>;

export const RememberPreferenceSchema = z.object({
    key: z.string(),
    value: z.string()
});
export type RememberPreferenceArgs = z.infer<typeof RememberPreferenceSchema>;

export const CUSTOMER_TOOLS: ToolDefinition[] = [
    {
        name: 'collect_contact_info',
        description: 'Save customer contact information when they provide phone number or delivery address for an order. Use this when customer shares their phone or address.',
        parameters: { type: 'object', properties: { phone: { type: 'string', description: 'Customer phone number (8 digits for Mongolia)' }, address: { type: 'string', description: 'Delivery address' }, name: { type: 'string', description: 'Customer name if provided' } }, required: [] }
    },
    {
        name: 'request_human_support',
        description: 'Call this when customer explicitly asks to speak to a human, operator, administrative staff, or when you cannot help them.',
        parameters: { type: 'object', properties: { reason: { type: 'string', description: 'Reason for requesting human support' } }, required: ['reason'] }
    },
    {
        name: 'remember_preference',
        description: 'Хэрэглэгчийн сонголтыг санах. Размер, өнгө, стиль гэх мэт хэлэхэд ашиглана.',
        parameters: { type: 'object', properties: { key: { type: 'string', description: 'Сонголтын төрөл (size, color, style, budget)' }, value: { type: 'string', description: 'Санах утга' } }, required: ['key', 'value'] }
    }
];
