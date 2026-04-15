/**
 * ToolExecutor - Vertmon Hub Real Estate AI Tools
 * Handles execution of AI tool calls for property search, loan calculation, etc.
 */

import { supabaseAdmin } from '@/lib/supabase';
import { logger } from '@/lib/utils/logger';
import { sendPushNotification } from '@/lib/notifications';
import type { ChatContext, ImageAction } from '@/types/ai';
import type {
    SearchPropertiesArgs,
    ShowPropertyImagesArgs,
    CalculateLoanArgs,
    ScheduleViewingArgs,
    CreateLeadArgs,
    CollectContactArgs,
    RequestHumanSupportArgs,
    RememberPreferenceArgs,
    CheckPaymentStatusArgs,
    LogServiceRequestArgs,
    ToolName,
} from '../tools/definitions';
import { saveCustomerPreference } from '../tools/memory';

/**
 * Result of tool execution
 */
export interface ToolExecutionResult {
    success: boolean;
    message?: string;
    error?: string;
    data?: Record<string, unknown>;
    imageAction?: ImageAction;
    quickReplies?: Array<{ title: string; payload: string }>;
}

/**
 * Tool execution context
 */
export interface ToolExecutionContext {
    shopId: string;
    customerId?: string;
    customerName?: string;
    properties?: ChatContext['properties'];
    notifySettings?: ChatContext['notifySettings'];
}

// ============================================
// REAL ESTATE TOOLS
// ============================================

/**
 * Execute search_properties tool
 */
export async function executeSearchProperties(
    args: SearchPropertiesArgs,
    context: ToolExecutionContext
): Promise<ToolExecutionResult> {
    const supabase = supabaseAdmin();
    const limit = args.limit || 5;

    let query = supabase
        .from('properties')
        .select('*')
        .eq('shop_id', context.shopId)
        .eq('is_active', true)
        .eq('status', 'available')
        .order('created_at', { ascending: false })
        .limit(limit);

    // Apply filters
    if (args.type) {
        query = query.eq('type', args.type);
    }
    if (args.min_price) {
        query = query.gte('price', args.min_price);
    }
    if (args.max_price) {
        query = query.lte('price', args.max_price);
    }
    if (args.rooms) {
        query = query.eq('rooms', args.rooms);
    }
    if (args.district) {
        query = query.ilike('district', `%${args.district}%`);
    }
    if (args.min_size) {
        query = query.gte('size_sqm', args.min_size);
    }
    if (args.max_size) {
        query = query.lte('size_sqm', args.max_size);
    }

    const { data: properties, error } = await query;

    if (error) {
        logger.error('Property search error:', { error });
        return { success: false, error: 'Хайлт алдаатай боллоо.' };
    }

    if (!properties || properties.length === 0) {
        return {
            success: true,
            message: 'Таны хайсан шалгуурт тохирох үл хөдлөх олдсонгүй. Өөр шалгуураар хайж үзнэ үү.',
            data: { properties: [] }
        };
    }

    // Format results
    const formatted = properties.map((p, i) => {
        const priceStr = p.price.toLocaleString();
        const sizeStr = p.size_sqm ? `${p.size_sqm}м²` : '';
        const roomsStr = p.rooms ? `${p.rooms} өрөө` : '';
        const districtStr = p.district || '';

        return `${i + 1}. **${p.name}**\n   📍 ${districtStr} | ${sizeStr} | ${roomsStr}\n   💰 ${priceStr}₮`;
    }).join('\n\n');

    return {
        success: true,
        message: `${properties.length} үл хөдлөх олдлоо:\n\n${formatted}`,
        data: { properties, count: properties.length },
        quickReplies: properties.slice(0, 3).map(p => ({
            title: `📷 ${p.name}`,
            payload: `${p.name} зураг үзэх`
        }))
    };
}

/**
 * Execute show_property_images tool
 */
export async function executeShowPropertyImages(
    args: ShowPropertyImagesArgs,
    context: ToolExecutionContext
): Promise<ToolExecutionResult> {
    const supabase = supabaseAdmin();

    let query = supabase
        .from('properties')
        .select('id, name, images, description, price')
        .eq('shop_id', context.shopId);

    if (args.property_id) {
        query = query.eq('id', args.property_id);
    } else if (args.property_name) {
        query = query.ilike('name', `%${args.property_name}%`);
    } else {
        return { success: false, error: 'Үл хөдлөхийн нэр эсвэл ID шаардлагатай.' };
    }

    const { data: property, error } = await query.single();

    if (error || !property) {
        return { success: false, error: 'Үл хөдлөх олдсонгүй.' };
    }

    const images = property.images || [];
    if (images.length === 0) {
        return {
            success: true,
            message: `"${property.name}" зураг оруулаагүй байна.`,
            data: { property }
        };
    }

    return {
        success: true,
        message: `"${property.name}" - ${images.length} зураг`,
        data: { property, images },
        imageAction: {
            type: 'attachment',
            propertyIds: [property.id],
            imageUrls: images.slice(0, 5)
        }
    };
}

/**
 * Execute calculate_loan tool
 */
export async function executeCalculateLoan(
    args: CalculateLoanArgs
): Promise<ToolExecutionResult> {
    const { amount, years, down_payment = 0 } = args;
    // Default to Khan Bank mortgage rate
    const rate = args.rate || 12.5;

    const principal = amount - down_payment;
    const monthlyRate = rate / 100 / 12;
    const totalPayments = years * 12;

    // Monthly payment formula: M = P * [r(1+r)^n] / [(1+r)^n - 1]
    const monthlyPayment = principal *
        (monthlyRate * Math.pow(1 + monthlyRate, totalPayments)) /
        (Math.pow(1 + monthlyRate, totalPayments) - 1);

    const totalPayment = monthlyPayment * totalPayments;
    const totalInterest = totalPayment - principal;

    const result = {
        principal,
        rate,
        years,
        monthly_payment: Math.round(monthlyPayment),
        total_payment: Math.round(totalPayment),
        total_interest: Math.round(totalInterest)
    };

    const message = `
💰 **Зээлийн тооцоо**

📊 Үндсэн мэдээлэл:
• Зээлийн дүн: ${principal.toLocaleString()}₮
• Хугацаа: ${years} жил (${totalPayments} сар)
• Хүү: ${rate}% (жилийн)

💵 Төлбөр:
• **Сарын төлбөр: ${Math.round(monthlyPayment).toLocaleString()}₮**
• Нийт төлбөр: ${Math.round(totalPayment).toLocaleString()}₮
• Нийт хүү: ${Math.round(totalInterest).toLocaleString()}₮
    `.trim();

    return {
        success: true,
        message,
        data: result
    };
}

/**
 * Execute schedule_viewing tool
 */
export async function executeScheduleViewing(
    args: ScheduleViewingArgs,
    context: ToolExecutionContext
): Promise<ToolExecutionResult> {
    const supabase = supabaseAdmin();

    if (!context.customerId) {
        return { success: false, error: 'Хэрэглэгчийн мэдээлэл олдсонгүй.' };
    }

    // Find property
    let propertyId = args.property_id;
    if (!propertyId && args.property_name) {
        const { data: property } = await supabase
            .from('properties')
            .select('id, name')
            .eq('shop_id', context.shopId)
            .ilike('name', `%${args.property_name}%`)
            .single();

        if (property) {
            propertyId = property.id;
        }
    }

    if (!propertyId) {
        return { success: false, error: 'Үл хөдлөх олдсонгүй. Нэрийг тодорхой бичнэ үү.' };
    }

    // Parse preferred date/time
    let scheduledAt = new Date();
    if (args.preferred_date) {
        const dateStr = args.preferred_date.toLowerCase();
        if (dateStr.includes('маргааш')) {
            scheduledAt.setDate(scheduledAt.getDate() + 1);
        } else if (dateStr.includes('нөгөөдөр')) {
            scheduledAt.setDate(scheduledAt.getDate() + 2);
        } else if (dateStr.match(/\d{4}-\d{2}-\d{2}/)) {
            scheduledAt = new Date(dateStr);
        }
    }

    // Set time (default 10:00)
    let hour = 10;
    if (args.preferred_time) {
        const timeStr = args.preferred_time.toLowerCase();
        if (timeStr.includes('өглөө')) hour = 10;
        else if (timeStr.includes('үд')) hour = 14;
        else if (timeStr.includes('орой')) hour = 17;
        else {
            const match = timeStr.match(/(\d{1,2})/);
            if (match) hour = parseInt(match[1]);
        }
    }
    scheduledAt.setHours(hour, 0, 0, 0);

    // Create or get lead
    let leadId: string;
    const { data: existingLead } = await supabase
        .from('leads')
        .select('id')
        .eq('customer_id', context.customerId)
        .eq('shop_id', context.shopId)
        .single();

    if (existingLead) {
        leadId = existingLead.id;
        // Update lead with viewing info
        await supabase
            .from('leads')
            .update({
                property_id: propertyId,
                viewing_scheduled_at: scheduledAt.toISOString(),
                status: 'viewing_scheduled'
            })
            .eq('id', leadId);
    } else {
        // Create new lead
        const { data: newLead, error: leadError } = await supabase
            .from('leads')
            .insert({
                shop_id: context.shopId,
                customer_id: context.customerId,
                property_id: propertyId,
                status: 'viewing_scheduled',
                viewing_scheduled_at: scheduledAt.toISOString(),
                source: 'messenger'
            })
            .select('id')
            .single();

        if (leadError || !newLead) {
            logger.error('Lead creation error:', { error: leadError });
            return { success: false, error: 'Үзлэг товлоход алдаа гарлаа.' };
        }
        leadId = newLead.id;
    }

    // Create viewing record
    const { error: viewingError } = await supabase
        .from('property_viewings')
        .insert({
            lead_id: leadId,
            property_id: propertyId,
            scheduled_at: scheduledAt.toISOString(),
            status: 'scheduled'
        });

    if (viewingError) {
        logger.error('Viewing creation error:', { error: viewingError });
    }

    // Save phone if provided
    if (args.customer_phone && context.customerId) {
        await supabase
            .from('customers')
            .update({ phone: args.customer_phone })
            .eq('id', context.customerId);
    }

    // Send notification to owner
    await sendPushNotification(context.shopId, {
        title: '🏠 Шинэ үзлэг товлогдлоо',
        body: `${context.customerName || 'Хэрэглэгч'} ${scheduledAt.toLocaleDateString('mn-MN')} ${hour}:00 цагт үзлэг хийхийг хүсэж байна.`,
        url: `/dashboard/leads/${leadId}`,
        tag: `viewing-${leadId}`
    });

    const dateStr = scheduledAt.toLocaleDateString('mn-MN', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });

    return {
        success: true,
        message: `✅ Үзлэг товлогдлоо!\n\n📅 ${dateStr}\n⏰ ${hour}:00 цаг\n\nТа ${args.customer_phone ? 'энэ' : 'холбоо барих'} дугаараар холбогдоно уу.`,
        data: { leadId, scheduledAt: scheduledAt.toISOString() },
        quickReplies: !args.customer_phone ? [
            { title: '📞 Утас өгөх', payload: 'Миний утас' }
        ] : undefined
    };
}

/**
 * Execute create_lead tool
 */
export async function executeCreateLead(
    args: CreateLeadArgs,
    context: ToolExecutionContext
): Promise<ToolExecutionResult> {
    const supabase = supabaseAdmin();

    if (!context.customerId) {
        return { success: false, error: 'Хэрэглэгчийн мэдээлэл олдсонгүй.' };
    }

    // Check for existing lead
    const { data: existingLead } = await supabase
        .from('leads')
        .select('id')
        .eq('customer_id', context.customerId)
        .eq('shop_id', context.shopId)
        .single();

    const leadData = {
        shop_id: context.shopId,
        customer_id: context.customerId,
        property_id: args.property_id || null,
        budget_min: args.budget_min || null,
        budget_max: args.budget_max || null,
        preferred_type: args.preferred_type || null,
        preferred_district: args.preferred_district || null,
        preferred_rooms: args.preferred_rooms || null,
        notes: args.notes || null,
        source: 'messenger',
        status: 'new' as const
    };

    if (existingLead) {
        // Update existing lead
        await supabase
            .from('leads')
            .update(leadData)
            .eq('id', existingLead.id);

        return {
            success: true,
            message: 'Таны хүсэлт шинэчлэгдлээ.',
            data: { leadId: existingLead.id }
        };
    }

    // Create new lead
    const { data: newLead, error } = await supabase
        .from('leads')
        .insert(leadData)
        .select('id')
        .single();

    if (error) {
        logger.error('Lead creation error:', { error });
        return { success: false, error: 'Хүсэлт хадгалахад алдаа гарлаа.' };
    }

    // Notify owner
    await sendPushNotification(context.shopId, {
        title: '🆕 Шинэ сонирхогч',
        body: `${context.customerName || 'Хэрэглэгч'} үл хөдлөхийн талаар сонирхож байна.`,
        url: `/dashboard/leads/${newLead.id}`,
        tag: `lead-${newLead.id}`
    });

    return {
        success: true,
        message: 'Таны хүсэлт хүлээн авлаа. Бид удахгүй холбогдоно.',
        data: { leadId: newLead.id }
    };
}

// ============================================
// GENERAL TOOLS
// ============================================

/**
 * Execute collect_contact_info tool
 */
export async function executeCollectContact(
    args: CollectContactArgs,
    context: ToolExecutionContext
): Promise<ToolExecutionResult> {
    const { phone, email, name } = args;

    if (!context.customerId) {
        return { success: false, error: 'Хэрэглэгчийн мэдээлэл олдсонгүй.' };
    }

    const supabase = supabaseAdmin();
    const updateData: Record<string, string> = {};

    if (phone) updateData.phone = phone;
    if (email) updateData.email = email;
    if (name) updateData.name = name;

    if (Object.keys(updateData).length === 0) {
        return { success: true, message: 'Хадгалах мэдээлэл байхгүй.' };
    }

    const { error } = await supabase
        .from('customers')
        .update(updateData)
        .eq('id', context.customerId);

    if (error) {
        logger.error('Contact save error:', { error });
        return { success: false, error: error.message };
    }

    logger.info('Contact info saved:', updateData);

    // Also update lead if exists
    if (phone || email || name) {
        await supabase
            .from('leads')
            .update({
                customer_phone: phone || undefined,
                customer_email: email || undefined,
                customer_name: name || undefined
            })
            .eq('customer_id', context.customerId)
            .eq('shop_id', context.shopId);
    }

    await sendPushNotification(context.shopId, {
        title: '📍 Холбоо барих мэдээлэл',
        body: `${name || 'Хэрэглэгч'}: ${phone || email || ''}`,
        url: `/dashboard/customers/${context.customerId}`,
        tag: `contact-${context.customerId}`
    });

    return {
        success: true,
        message: `Мэдээлэл хадгалагдлаа: ${phone ? 'утас ' : ''}${email ? 'имэйл ' : ''}${name ? 'нэр' : ''}`
    };
}

/**
 * Execute request_human_support tool
 */
export async function executeRequestSupport(
    args: RequestHumanSupportArgs,
    context: ToolExecutionContext
): Promise<ToolExecutionResult> {
    const { reason } = args;

    await sendPushNotification(context.shopId, {
        title: '📞 Холбогдох хүсэлт',
        body: `${context.customerName || 'Хэрэглэгч'}: ${reason || 'Оператортой холбогдохыг хүсч байна'}`,
        url: `/dashboard/chat?customer=${context.customerId}`,
        tag: `support-${context.customerId}`
    });

    return {
        success: true,
        message: 'Хүсэлт илгээгдлээ. Манай ажилтан удахгүй холбогдоно.'
    };
}

/**
 * Execute remember_preference tool
 */
export async function executeRememberPreference(
    args: RememberPreferenceArgs,
    context: ToolExecutionContext
): Promise<ToolExecutionResult> {
    if (!context.customerId) {
        return { success: false, error: 'Хэрэглэгчийн мэдээлэл олдсонгүй.' };
    }

    await saveCustomerPreference(
        context.customerId,
        args.key,
        args.value
    );

    return {
        success: true,
        message: `Санагдлаа: ${args.key} = ${args.value}`
    };
}

// ============================================
// CUSTOMER SERVICE TOOLS
// ============================================

/**
 * Execute check_payment_status tool
 */
export async function executeCheckPaymentStatus(
    args: CheckPaymentStatusArgs,
    context: ToolExecutionContext
): Promise<ToolExecutionResult> {
    const supabase = supabaseAdmin();

    let query = supabase
        .from('property_contracts')
        .select('contract_number, customer_name, customer_phone, total_price, paid_amount, balance, overdue_days, contract_status, paid_percent')
        .eq('shop_id', context.shopId);

    if (args.contract_number) {
        query = query.ilike('contract_number', `%${args.contract_number}%`);
    } else if (args.customer_phone) {
        query = query.ilike('customer_phone', `%${args.customer_phone}%`);
    } else if (args.customer_name) {
        query = query.ilike('customer_name', `%${args.customer_name}%`);
    } else {
        return { success: false, error: 'Утас, нэр эсвэл гэрээний дугаар шаардлагатай.' };
    }

    const { data: contracts, error } = await query.limit(3);

    if (error) {
        logger.error('[AI] Payment status check error:', { error });
        return { success: false, error: 'Төлбөрийн мэдээлэл шалгахад алдаа гарлаа.' };
    }

    if (!contracts || contracts.length === 0) {
        return {
            success: true,
            message: 'Таны мэдээллээр гэрээ олдсонгүй. Гэрээний дугаар эсвэл утасны дугаараа дахин шалгана уу.'
        };
    }

    const formatted = contracts.map(c => {
        const pct = c.paid_percent || (c.total_price > 0 ? Math.round((c.paid_amount || 0) / c.total_price * 100) : 0);
        return `📄 **Гэрээ: ${c.contract_number || '—'}**
• Нэр: ${c.customer_name || '—'}
• Нийт үнэ: ${(c.total_price || 0).toLocaleString()}₮
• Төлсөн: ${(c.paid_amount || 0).toLocaleString()}₮ (${pct}%)
• Үлдэгдэл: ${(c.balance || 0).toLocaleString()}₮
${c.overdue_days && c.overdue_days > 0 ? `⚠️ Хоцрогдол: ${c.overdue_days} хоног` : '✅ Хоцрогдолгүй'}
• Төлөв: ${c.contract_status === 'closed' ? 'Хаагдсан' : 'Идэвхтэй'}`;
    }).join('\n\n');

    return {
        success: true,
        message: `💳 **Төлбөрийн мэдээлэл:**\n\n${formatted}`,
        data: { contracts }
    };
}

/**
 * Execute log_service_request tool
 */
export async function executeLogServiceRequest(
    args: LogServiceRequestArgs,
    context: ToolExecutionContext
): Promise<ToolExecutionResult> {
    const supabase = supabaseAdmin();

    const { data, error } = await supabase
        .from('service_logs')
        .insert({
            shop_id: context.shopId,
            customer_name: context.customerName || null,
            customer_phone: null,
            subject: args.subject,
            type: args.type || 'inquiry',
            priority: args.priority || 'medium',
            description: args.description || null,
            status: 'open',
        })
        .select('id')
        .single();

    if (error) {
        logger.error('[AI] Service log creation error:', { error });
        return { success: false, error: 'Хүсэлт бүртгэхэд алдаа гарлаа.' };
    }

    // Notify manager
    await sendPushNotification(context.shopId, {
        title: args.type === 'complaint' ? '🔴 Шинэ гомдол' : '📩 Шинэ хүсэлт',
        body: `${context.customerName || 'Хэрэглэгч'}: ${args.subject}`,
        url: '/dashboard/customer-service',
        tag: `service-${data.id}`
    });

    return {
        success: true,
        message: `✅ Таны хүсэлт бүртгэгдлээ. Манай ажилтан удахгүй холбогдоно.`,
        data: { serviceLogId: data.id }
    };
}

// ============================================
// MAIN TOOL EXECUTOR
// ============================================

/**
 * Execute a tool by name with given arguments
 */
export async function executeTool(
    toolName: ToolName,
    args: unknown,
    context: ToolExecutionContext
): Promise<ToolExecutionResult> {
    logger.info(`Executing tool: ${toolName}`, { args });

    try {
        switch (toolName) {
            case 'search_properties':
                return await executeSearchProperties(args as SearchPropertiesArgs, context);

            case 'show_property_images':
                return await executeShowPropertyImages(args as ShowPropertyImagesArgs, context);

            case 'calculate_loan':
                return await executeCalculateLoan(args as CalculateLoanArgs);

            case 'schedule_viewing':
                return await executeScheduleViewing(args as ScheduleViewingArgs, context);

            case 'create_lead':
                return await executeCreateLead(args as CreateLeadArgs, context);

            case 'collect_contact_info':
                return await executeCollectContact(args as CollectContactArgs, context);

            case 'request_human_support':
                return await executeRequestSupport(args as RequestHumanSupportArgs, context);

            case 'remember_preference':
                return await executeRememberPreference(args as RememberPreferenceArgs, context);

            case 'check_payment_status':
                return await executeCheckPaymentStatus(args as CheckPaymentStatusArgs, context);

            case 'log_service_request':
                return await executeLogServiceRequest(args as LogServiceRequestArgs, context);

            default:
                return { success: false, error: `Unknown tool: ${toolName}` };
        }
    } catch (error) {
        logger.error(`Tool execution error: ${toolName}`, { error });
        return { success: false, error: `Tool execution failed: ${String(error)}` };
    }
}
