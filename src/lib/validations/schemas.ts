/**
 * API Input Validation Schemas
 * Centralized Zod schemas for all API input validation
 */
import { z } from 'zod';

// ============================================
// Lead Schemas
// ============================================
export const CreateLeadSchema = z.object({
    name: z.string().min(1, 'Нэр шаардлагатай').max(255),
    phone: z.string().min(8, 'Утасны дугаар буруу').max(20).regex(/^[\d+\-() ]{8,20}$/, 'Утасны дугаар буруу формат'),
    email: z.string().email('Email буруу формат').max(255).optional().nullable(),
    company: z.string().max(255).optional().nullable(),
    message: z.string().max(2000).optional().nullable(),
});

// ============================================
// Shop Schemas
// ============================================
export const CreateShopSchema = z.object({
    name: z.string().min(1, 'Shop нэр шаардлагатай').max(255),
    owner_name: z.string().max(255).optional().nullable(),
    phone: z.string().max(20).optional().nullable(),
});

export const UpdateShopSchema = z.object({
    name: z.string().min(1).max(255).optional(),
    owner_name: z.string().max(255).optional().nullable(),
    phone: z.string().max(20).optional().nullable(),
    description: z.string().max(5000).optional().nullable(),
    ai_instructions: z.string().max(10000).optional().nullable(),
    ai_emotion: z.string().max(50).optional().nullable(),
    is_ai_active: z.boolean().optional(),
    custom_knowledge: z.string().max(50000).optional().nullable(),
}).refine(data => Object.keys(data).length > 0, {
    message: 'Дор хаяж нэг талбар шаардлагатай',
});

// ============================================
// Role Schemas
// ============================================
export const CreateRoleSchema = z.object({
    name: z.string()
        .min(1)
        .max(50)
        .regex(/^[a-z][a-z0-9_]*$/, 'Name must be lowercase with underscores only'),
    display_name: z.string().min(1).max(100),
    display_name_mn: z.string().min(1).max(100),
    description: z.string().max(500).optional().nullable(),
    can_write: z.boolean().optional().default(false),
    can_delete: z.boolean().optional().default(false),
    can_access_admin: z.boolean().optional().default(false),
    modules: z.array(z.string().max(50)).max(50).optional(),
});

export const UpdateRoleSchema = z.object({
    display_name: z.string().min(1).max(100).optional(),
    display_name_mn: z.string().min(1).max(100).optional(),
    description: z.string().max(500).optional().nullable(),
    can_write: z.boolean().optional(),
    can_delete: z.boolean().optional(),
    can_access_admin: z.boolean().optional(),
    modules: z.array(z.string().max(50)).max(50).optional(),
});

// ============================================
// AI Settings Schemas
// ============================================
export const CreateFaqSchema = z.object({
    type: z.literal('faqs'),
    question: z.string().min(1, 'Асуулт шаардлагатай').max(500),
    answer: z.string().min(1, 'Хариулт шаардлагатай').max(2000),
    category: z.string().max(50).optional().default('general'),
    sort_order: z.number().int().min(0).max(1000).optional().default(0),
});

export const CreateQuickReplySchema = z.object({
    type: z.literal('quick_replies'),
    name: z.string().min(1).max(100),
    trigger_words: z.union([
        z.array(z.string().max(100)).max(20),
        z.string().max(500),
    ]),
    response: z.string().min(1).max(2000),
    is_exact_match: z.boolean().optional().default(false),
});

export const CreateSloganSchema = z.object({
    type: z.literal('slogans'),
    slogan: z.string().min(1).max(500),
    usage_context: z.string().max(50).optional().default('any'),
});

export const CreateAISettingSchema = z.discriminatedUnion('type', [
    CreateFaqSchema,
    CreateQuickReplySchema,
    CreateSloganSchema,
]);

export const UpdateAISettingSchema = z.object({
    type: z.enum(['faqs', 'quick_replies', 'slogans']),
    id: z.string().uuid('ID буруу формат'),
}).passthrough(); // Allow additional fields for updates

export const DeleteAISettingSchema = z.object({
    type: z.enum(['faqs', 'quick_replies', 'slogans']),
    id: z.string().uuid('ID буруу формат'),
});

// ============================================
// Invoice Schemas
// ============================================
export const CreateInvoiceSchema = z.object({
    shop_id: z.string().uuid(),
    subscription_id: z.string().uuid().optional().nullable(),
    amount: z.number().positive('Дүн эерэг тоо байх ёстой'),
    due_date: z.string().datetime().optional(),
    description: z.string().max(1000).optional().nullable(),
});

export const UpdateInvoiceSchema = z.object({
    invoice_id: z.string().uuid('Invoice ID шаардлагатай'),
    status: z.enum(['pending', 'paid', 'overdue', 'canceled']).optional(),
    paid_at: z.string().datetime().optional().nullable(),
    notes: z.string().max(2000).optional().nullable(),
});

// ============================================
// Admin Shop Update Schema
// ============================================
export const AdminUpdateShopSchema = z.object({
    id: z.string().uuid('Shop ID шаардлагатай'),
    is_active: z.boolean().optional(),
    plan_id: z.string().uuid().optional().nullable(),
    name: z.string().min(1).max(255).optional(),
    owner_name: z.string().max(255).optional().nullable(),
    phone: z.string().max(20).optional().nullable(),
    description: z.string().max(5000).optional().nullable(),
    subscription_plan: z.string().max(50).optional(),
    subscription_status: z.string().max(20).optional(),
    trial_ends_at: z.string().datetime().optional().nullable(),
    ai_instructions: z.string().max(10000).optional().nullable(),
    ai_emotion: z.string().max(50).optional().nullable(),
});

// ============================================
// Helper: Parse and validate with Zod
// ============================================
import { NextResponse } from 'next/server';

export function validateBody<T>(schema: z.ZodSchema<T>, body: unknown): 
    { success: true; data: T } | { success: false; response: NextResponse } {
    const result = schema.safeParse(body);
    if (!result.success) {
        const errors = result.error.issues.map((e) => `${e.path.map(String).join('.')}: ${e.message}`);
        return {
            success: false,
            response: NextResponse.json(
                { error: 'Буруу өгөгдөл', details: errors },
                { status: 400 }
            ),
        };
    }
    return { success: true, data: result.data };
}
