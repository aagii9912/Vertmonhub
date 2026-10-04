/**
 * «Санал гомдол» (service_logs) бүртгэх, шинэчлэх НЭГ дүрэм — API route (POST/PATCH) энд дамжина.
 *
 * • Оролт хатуу Zod allow-list (DB CHECK-тэй ижил толь, 'suggestion' орно).
 * • Хариуцагч менежер (manager_name, канон sales_managers.name) — шийдвэрлэлтийн KPI-ийн attribution:
 *   ил сонгосон (идэвхтэй бүртгэлээр шалгана) → холбосон гэрээний менежер (идэвхтэй бол) →
 *   бүртгэсэн хэрэглэгчийн бүртгэлийн нэр → хоосон. assigned_to нь дэлгэцийн текст хэвээр.
 * • resolved_at: нээлттэй → шийдвэрлэсэн/хаасан үед тавигдана, шийдвэрлэсэн → хаасан үед ХЭВЭЭР
 *   (SLA-ийн цаг дахин эхлэхгүй), дахин нээхэд цэвэрлэгдэнэ. resolved_by хамт.
 */
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveActiveManagerName, resolveManagerIdentity } from '@/lib/sales/manager-identity';
import {
    SERVICE_LOG_CHANNELS, SERVICE_LOG_PRIORITIES, SERVICE_LOG_STATUSES, SERVICE_LOG_TYPES,
    isClosedServiceStatus, type ServiceLogStatus,
} from '@/lib/service-logs/labels';

export type ServiceResult<T> = { ok: true; data: T } | { ok: false; status: number; error: string };

const blankToNull = (value: unknown) => typeof value === 'string' ? (value.trim() || null) : value;
const optionalText = (max: number, message: string) => z.preprocess(blankToNull, z.string().max(max, message).nullable()).optional();
const optionalUuid = (message: string) => z.preprocess(blankToNull, z.string().uuid(message).nullable()).optional();

export const CreateServiceLogSchema = z.object({
    subject: z.string({ error: 'Гарчиг шаардлагатай' }).trim().min(1, 'Гарчиг шаардлагатай').max(255, 'Гарчиг 255 тэмдэгтээс ихгүй байна'),
    description: optionalText(5000, 'Дэлгэрэнгүй 5000 тэмдэгтээс ихгүй байна'),
    type: z.enum(SERVICE_LOG_TYPES, { error: 'Буруу төрөл' }).default('inquiry'),
    priority: z.enum(SERVICE_LOG_PRIORITIES, { error: 'Буруу чухлал' }).default('medium'),
    status: z.enum(SERVICE_LOG_STATUSES, { error: 'Буруу төлөв' }).default('open'),
    channel: z.preprocess(blankToNull, z.enum(SERVICE_LOG_CHANNELS, { error: 'Буруу суваг' }).nullable()).optional(),
    customer_id: optionalUuid('Харилцагчийн ID буруу'),
    contract_id: optionalUuid('Гэрээний ID буруу'),
    customer_name: optionalText(255, 'Харилцагчийн нэр хэт урт'),
    customer_phone: optionalText(50, 'Утасны дугаар хэт урт'),
    manager_name: optionalText(120, 'Менежерийн нэр хэт урт'),
    /** Хуучин клиентийн чөлөөт текст. Идэвхтэй бүртгэлийн нэртэй яг таарвал хариуцагч болно. */
    assigned_to: optionalText(255, 'Хариуцагчийн нэр хэт урт'),
}).strict();
export type CreateServiceLogInput = z.infer<typeof CreateServiceLogSchema>;

export const UpdateServiceLogSchema = z.object({
    status: z.enum(SERVICE_LOG_STATUSES, { error: 'Буруу төлөв' }).optional(),
    priority: z.enum(SERVICE_LOG_PRIORITIES, { error: 'Буруу чухлал' }).optional(),
    /** null = хариуцагчгүй болгох. */
    manager_name: optionalText(120, 'Менежерийн нэр хэт урт'),
    resolution_notes: optionalText(5000, 'Шийдвэрлэлтийн тэмдэглэл 5000 тэмдэгтээс ихгүй байна'),
    satisfaction_rating: z.number({ error: 'Үнэлгээ 1–5 бүхэл тоо байна' }).int('Үнэлгээ 1–5 бүхэл тоо байна')
        .min(1, 'Үнэлгээ 1–5 бүхэл тоо байна').max(5, 'Үнэлгээ 1–5 бүхэл тоо байна').nullable().optional(),
}).strict().refine(value => Object.values(value).some(field => field !== undefined), 'Өөрчлөх талбар алга');
export type UpdateServiceLogInput = z.infer<typeof UpdateServiceLogSchema>;

/** Zod-ийн алдааг хэрэглэгчид харуулах монгол мессеж болгоно. */
export function serviceLogInputError(error: z.ZodError): string {
    const issue = error.issues[0];
    if (!issue) return 'Санал гомдлын мэдээлэл буруу байна';
    if (issue.code === 'unrecognized_keys') return `Зөвшөөрөгдөөгүй талбар: ${issue.keys.join(', ')}`;
    return /[А-Яа-яЁёӨөҮү]/.test(issue.message) ? issue.message : 'Санал гомдлын мэдээлэл буруу байна';
}

const failure = (status: number, error: string) => ({ ok: false as const, status, error });

/** Идэвхтэй бүртгэлийн нэр мөн бол түүнийг, эс бөгөөс null (алдаа биш — дараагийн эх сурвалж руу шилжинэ). */
async function activeRosterName(db: SupabaseClient, shopId: string, name: string | null | undefined): Promise<string | null> {
    if (!name?.trim()) return null;
    const { data, error } = await db.from('sales_managers').select('name')
        .eq('shop_id', shopId).eq('is_active', true).eq('name', name.trim()).maybeSingle();
    if (error) throw error;
    return (data?.name as string | undefined) ?? null;
}

/** Шинэ санал гомдол бүртгэнэ (хариуцагчийг дээрх дарааллаар тогтооно). */
export async function createServiceLog(
    db: SupabaseClient,
    options: { shopId: string; userId: string | null; input: CreateServiceLogInput },
): Promise<ServiceResult<Record<string, unknown>>> {
    const { shopId, userId, input } = options;

    // Холбоос нь тухайн төслийнх эсэх (өөр shop-ийн ID-г холбуулахгүй).
    let contractManager: string | null = null;
    if (input.contract_id) {
        const { data, error } = await db.from('property_contracts').select('id, sales_manager')
            .eq('id', input.contract_id).eq('shop_id', shopId).is('deleted_at', null).maybeSingle();
        if (error) throw error;
        if (!data) return failure(404, 'Холбох гэрээ олдсонгүй');
        contractManager = (data.sales_manager as string | null) ?? null;
    }
    if (input.customer_id) {
        const { data, error } = await db.from('customers').select('id')
            .eq('id', input.customer_id).eq('shop_id', shopId).is('deleted_at', null).maybeSingle();
        if (error) throw error;
        if (!data) return failure(404, 'Холбох харилцагч олдсонгүй');
    }

    let managerName: string | null = null;
    if (input.manager_name) {
        const checked = await resolveActiveManagerName(db, shopId, input.manager_name);
        if (!checked.ok) return failure(checked.status, checked.error);
        managerName = checked.managerName;
    }
    managerName ??= await activeRosterName(db, shopId, input.assigned_to);
    managerName ??= await activeRosterName(db, shopId, contractManager);
    const identity = userId ? await resolveManagerIdentity(db, shopId, userId) : null;
    if (!managerName && identity?.isManager && identity.rosterEntry) managerName = identity.rosterEntry.name;

    const closed = isClosedServiceStatus(input.status);
    const { data, error } = await db.from('service_logs').insert({
        shop_id: shopId,
        contract_id: input.contract_id ?? null,
        customer_id: input.customer_id ?? null,
        customer_name: input.customer_name ?? null,
        customer_phone: input.customer_phone ?? null,
        type: input.type,
        priority: input.priority,
        subject: input.subject,
        description: input.description ?? null,
        status: input.status,
        channel: input.channel ?? null,
        manager_name: managerName,
        // Дэлгэцийн нэр: хариуцагч → хуучин клиентийн текст → бүртгэсэн хүний нэр (өмнөх зан төлөв).
        assigned_to: managerName ?? input.assigned_to ?? identity?.fullName ?? null,
        resolved_at: closed ? new Date().toISOString() : null,
        resolved_by: closed ? userId : null,
    }).select().single();
    if (error) throw error;
    return { ok: true, data: data as Record<string, unknown> };
}

/** Төлөв, чухлал, хариуцагч, шийдвэрлэлт, үнэлгээг шинэчилнэ (allow-list). */
export async function updateServiceLog(
    db: SupabaseClient,
    options: { shopId: string; id: string; userId: string | null; patch: UpdateServiceLogInput },
): Promise<ServiceResult<Record<string, unknown>>> {
    const { shopId, id, userId, patch } = options;
    const { data: current, error: readError } = await db.from('service_logs').select('id, status, resolved_at')
        .eq('id', id).eq('shop_id', shopId).maybeSingle();
    if (readError) throw readError;
    if (!current) return failure(404, 'Хүсэлт олдсонгүй');

    const updates: Record<string, unknown> = {};
    if (patch.priority !== undefined) updates.priority = patch.priority;
    if (patch.resolution_notes !== undefined) updates.resolution_notes = patch.resolution_notes;
    if (patch.satisfaction_rating !== undefined) updates.satisfaction_rating = patch.satisfaction_rating;
    if (patch.manager_name !== undefined) {
        if (patch.manager_name === null) {
            updates.manager_name = null;
            updates.assigned_to = null;
        } else {
            const checked = await resolveActiveManagerName(db, shopId, patch.manager_name);
            if (!checked.ok) return failure(checked.status, checked.error);
            updates.manager_name = checked.managerName;
            updates.assigned_to = checked.managerName;
        }
    }
    const currentStatus = current.status as ServiceLogStatus | null;
    if (patch.status !== undefined && patch.status !== currentStatus) {
        updates.status = patch.status;
        const wasClosed = isClosedServiceStatus(currentStatus);
        const nowClosed = isClosedServiceStatus(patch.status);
        if (nowClosed && (!wasClosed || !current.resolved_at)) {
            updates.resolved_at = new Date().toISOString();
            updates.resolved_by = userId;
        } else if (!nowClosed) {
            // Дахин нээсэн: SLA шийдвэрлэлтийг цуцална.
            updates.resolved_at = null;
            updates.resolved_by = null;
        }
    }
    if (!Object.keys(updates).length) return { ok: true, data: current as Record<string, unknown> };

    // Төлөв уншсанаас хойш өөрчлөгдсөн бол (өөр хэрэглэгч) resolved_at-ийн шилжилтийг дарж бичихгүй.
    let query = db.from('service_logs').update(updates).eq('id', id).eq('shop_id', shopId);
    query = currentStatus === null ? query.is('status', null) : query.eq('status', currentStatus);
    const { data, error } = await query.select().maybeSingle();
    if (error) throw error;
    if (!data) return failure(409, 'Хүсэлтийг өөр хэрэглэгч шинэчилсэн байна. Жагсаалтаа шинэчлээд дахин оролдоно уу.');
    return { ok: true, data: data as Record<string, unknown> };
}
