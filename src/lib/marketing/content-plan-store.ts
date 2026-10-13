import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';
import { parseReportMediaPath } from '@/lib/dashboard/report-media';
import { CONTENT_COLUMNS, type ContentCreate, type ContentItem, type ContentPatch } from './content-plan';

/**
 * Контент төлөвлөгөөний сервер талын дүрэм (/api/marketing/content-plan*). Эрх, shop-ийг route
 * шалгана; shop, үүсгэгч, зургийн замыг body-оос биш серверээс тогтооно.
 */
type Result<T> = T | { error: PostgrestError } | { invalid: string } | { notFound: true };

/** Шинэ зураг нь тухайн shop-д энэ хэрэглэгчийн upload хийсэн файл байх ёстой. */
const foreignPath = (paths: readonly string[], shopId: string, userId: string, keep: readonly string[] = []) => paths.some(path => {
    if (keep.includes(path)) return false;
    const parsed = parseReportMediaPath(path);
    return !parsed || parsed.shopId !== shopId || parsed.userId !== userId;
});

export async function listContent(db: SupabaseClient, shopId: string, range: { from: string; to: string }): Promise<{ items: ContentItem[] } | { error: PostgrestError }> {
    const { data, error } = await db.from('content_calendar').select(CONTENT_COLUMNS).eq('shop_id', shopId)
        .gte('scheduled_date', range.from).lte('scheduled_date', range.to)
        .order('scheduled_date').order('scheduled_time', { nullsFirst: true }).order('id').limit(1000);
    if (error) return { error };
    return { items: (data ?? []) as ContentItem[] };
}

export async function getContent(db: SupabaseClient, shopId: string, id: string): Promise<Result<{ item: ContentItem }>> {
    const { data, error } = await db.from('content_calendar').select(CONTENT_COLUMNS).eq('shop_id', shopId).eq('id', id).maybeSingle();
    if (error) return { error };
    if (!data) return { notFound: true };
    return { item: data as ContentItem };
}

export async function createContent(db: SupabaseClient, shopId: string, userId: string, input: ContentCreate): Promise<Result<{ item: ContentItem }>> {
    if (foreignPath(input.imagePaths, shopId, userId)) return { invalid: 'Зургийг энэ контентод дахин оруулна уу.' };
    const { data, error } = await db.from('content_calendar').insert({
        shop_id: shopId, title: input.title, type: input.type, platform: input.platform, scheduled_date: input.scheduledDate,
        scheduled_time: input.scheduledTime, status: input.status, description: input.description, assigned_to: input.assignedTo,
        ...(input.color ? { color: input.color } : {}), image_paths: input.imagePaths, created_by: userId,
    }).select(CONTENT_COLUMNS).single();
    if (error) return { error };
    return { item: data as ContentItem };
}

/** Хасагдсан зургийн замыг буцаана. updated_at-аар зэрэг засварыг шалгана. */
export async function updateContent(db: SupabaseClient, shopId: string, userId: string, current: ContentItem, patch: ContentPatch): Promise<Result<{ item: ContentItem; removed: string[] }>> {
    if (patch.imagePaths && foreignPath(patch.imagePaths, shopId, userId, current.image_paths)) return { invalid: 'Зургийг энэ контентод дахин оруулна уу.' };
    const next: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (patch.title !== undefined) next.title = patch.title;
    if (patch.type !== undefined) next.type = patch.type;
    if (patch.platform !== undefined) next.platform = patch.platform;
    if (patch.scheduledDate !== undefined) next.scheduled_date = patch.scheduledDate;
    if (patch.scheduledTime !== undefined) next.scheduled_time = patch.scheduledTime;
    if (patch.status !== undefined) next.status = patch.status;
    if (patch.description !== undefined) next.description = patch.description;
    if (patch.assignedTo !== undefined) next.assigned_to = patch.assignedTo;
    if (patch.color !== undefined && patch.color !== null) next.color = patch.color;
    if (patch.imagePaths !== undefined) next.image_paths = patch.imagePaths;
    const { data, error } = await db.from('content_calendar').update(next)
        .eq('shop_id', shopId).eq('id', current.id).eq('updated_at', current.updated_at)
        .select(CONTENT_COLUMNS).maybeSingle();
    if (error) return { error };
    if (!data) return { invalid: 'Контентыг өөр хүн өөрчилсөн байна. Шинэчлээд дахин оролдоно уу.' };
    const kept = patch.imagePaths ?? current.image_paths;
    return { item: data as ContentItem, removed: current.image_paths.filter(path => !kept.includes(path)) };
}

export async function deleteContent(db: SupabaseClient, shopId: string, item: ContentItem): Promise<Result<{ removed: string[] }>> {
    const { error } = await db.from('content_calendar').delete().eq('shop_id', shopId).eq('id', item.id);
    if (error) return { error };
    return { removed: item.image_paths };
}
