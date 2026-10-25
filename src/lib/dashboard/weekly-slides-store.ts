import { NextResponse } from 'next/server';
import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';
import { safeErrorResponse } from '@/lib/utils/safe-error';
import {
    isTextOnlySlide, parseReportMediaPath, REPORT_MEDIA_BUCKET, WEEKLY_SLIDE_COLUMNS, WEEKLY_SLIDE_LIMITS, WEEKLY_SLIDE_PART_SECTIONS,
    type WeeklySlide, type WeeklySlideCopy, type WeeklySlideCreate, type WeeklySlidePart, type WeeklySlidePatch, type WeeklySlideSection,
} from './weekly-slides';

/**
 * Лхагвагийн хурлын нэмэлт слайдын сервер талын дүрэм (/api/dashboard/weekly-slides*).
 * Эрх (модуль, shop-ийн гишүүнчлэл)-ийг route шалгана; энд shop, зохиогч, зургийн замыг
 * хэрэглэгчийн body-оос биш серверээс тогтооно.
 */
type Result<T> = T | { error: PostgrestError } | { invalid: string } | { notFound: true };

export interface SlideActor { userId: string; name: string }

/** Зохиогчийн нэр профайлаас — body-оос авахгүй. */
export async function slideActor(db: SupabaseClient, userId: string): Promise<SlideActor | { error: PostgrestError }> {
    const { data, error } = await db.from('user_profiles').select('full_name').eq('id', userId).maybeSingle();
    if (error) return { error };
    return { userId, name: (data?.full_name as string | null)?.trim() || 'Багийн гишүүн' };
}

/** Migration ороогүй орчинд ойлгомжтой 503; бусад алдааг ерөнхий мессежээр. */
export function slideDatabaseError(error: { code?: string; message: string }) {
    if (['42P01', 'PGRST205'].includes(error.code || '')) {
        return NextResponse.json({ error: 'Хурлын слайд хадгалах хэсэг хараахан идэвхжээгүй байна. Админд хандаж шинэчлэлийг суулгана уу.' }, { status: 503 });
    }
    // Zod урьдчилан шалгадаг тул CHECK зөрчил = DB хуучин (20261023152000: 9 зураг, «Барилгын явц» ороогүй).
    if (error.code === '23514') {
        return NextResponse.json({ error: 'Слайдын шинэчлэл (9 хүртэл зураг, «Барилгын явц») өгөгдлийн санд хараахан суугаагүй байна. Админд хандана уу.' }, { status: 503 });
    }
    return safeErrorResponse(error, 'Слайдыг хадгалах эсвэл уншихад алдаа гарлаа.');
}

/** Шинэ зураг нь тухайн shop-д энэ хэрэглэгчийн upload хийсэн файл байх ёстой. */
function foreignPath(paths: readonly string[], shopId: string, userId: string, keep: readonly string[] = []): string | null {
    for (const path of paths) {
        if (keep.includes(path)) continue;
        const parsed = parseReportMediaPath(path);
        if (!parsed || parsed.shopId !== shopId || parsed.userId !== userId) return path;
    }
    return null;
}

export async function listWeeklySlides(db: SupabaseClient, shopId: string, meetingDate: string, parts: readonly WeeklySlidePart[]): Promise<{ slides: WeeklySlide[] } | { error: PostgrestError }> {
    if (!parts.length) return { slides: [] };
    const { data, error } = await db.from('weekly_report_slides').select(WEEKLY_SLIDE_COLUMNS)
        .eq('shop_id', shopId).eq('meeting_date', meetingDate).in('part', [...parts])
        .order('part').order('position').order('created_at').limit(WEEKLY_SLIDE_LIMITS.slides * 2);
    if (error) return { error };
    return { slides: (data ?? []) as WeeklySlide[] };
}

export async function createWeeklySlide(db: SupabaseClient, shopId: string, actor: SlideActor, input: WeeklySlideCreate): Promise<Result<{ slide: WeeklySlide }>> {
    if (foreignPath(input.imagePaths, shopId, actor.userId)) return { invalid: 'Зургийг энэ хэсэгт дахин оруулна уу.' };
    const existing = await db.from('weekly_report_slides').select('position')
        .eq('shop_id', shopId).eq('meeting_date', input.meetingDate).eq('part', input.part)
        .order('position', { ascending: false }).limit(WEEKLY_SLIDE_LIMITS.slides);
    if (existing.error) return { error: existing.error };
    if ((existing.data?.length ?? 0) >= WEEKLY_SLIDE_LIMITS.slides) return { invalid: `Нэг хэсэгт ${WEEKLY_SLIDE_LIMITS.slides} хүртэл слайд нэмнэ.` };
    const position = existing.data?.length ? Math.min(10_000, (existing.data[0].position as number) + 1) : 0;
    const { data, error } = await db.from('weekly_report_slides').insert({
        shop_id: shopId, meeting_date: input.meetingDate, part: input.part, section: input.section,
        title: input.title, note: input.note, image_paths: input.imagePaths, position,
        author_id: actor.userId, author_name: actor.name.slice(0, 120),
    }).select(WEEKLY_SLIDE_COLUMNS).single();
    if (error) return { error };
    return { slide: data as WeeklySlide };
}

/** Слайдыг shop-оор нь л уншина — өөр shop-ийн id-г «олдсонгүй» гэж хариулна. */
export async function getWeeklySlide(db: SupabaseClient, shopId: string, id: string): Promise<Result<{ slide: WeeklySlide }>> {
    const { data, error } = await db.from('weekly_report_slides').select(WEEKLY_SLIDE_COLUMNS).eq('shop_id', shopId).eq('id', id).maybeSingle();
    if (error) return { error };
    if (!data) return { notFound: true };
    return { slide: data as WeeklySlide };
}

/** Хасагдсан зургийн замыг буцаана — route storage-оос устгана. */
export async function updateWeeklySlide(db: SupabaseClient, shopId: string, actor: SlideActor, current: WeeklySlide, patch: WeeklySlidePatch): Promise<Result<{ slide: WeeklySlide; removed: string[] }>> {
    if (patch.section && !WEEKLY_SLIDE_PART_SECTIONS[current.part].includes(patch.section)) return { invalid: 'Энэ хэсэгт тохирохгүй сэдэв байна.' };
    if (patch.imagePaths && foreignPath(patch.imagePaths, shopId, actor.userId, current.image_paths)) return { invalid: 'Зургийг энэ хэсэгт дахин оруулна уу.' };
    const next = {
        section: patch.section ?? current.section,
        title: patch.title ?? current.title,
        note: patch.note ?? current.note,
        image_paths: patch.imagePaths ?? current.image_paths,
    };
    if (!next.title && !next.note.trim() && !next.image_paths.length) return { invalid: 'Сэдэв, тайлбар эсвэл зураг оруулна уу.' };
    // updated_at-аар зэрэг засварыг шалгана: хоёр хүн нэг слайдыг засвал сүүлийнх нь өмнөхийн зургийг устгахгүй.
    const { data, error } = await db.from('weekly_report_slides').update({ ...next, updated_at: new Date().toISOString() })
        .eq('shop_id', shopId).eq('id', current.id).eq('updated_at', current.updated_at)
        .select(WEEKLY_SLIDE_COLUMNS).maybeSingle();
    if (error) return { error };
    if (!data) return { invalid: 'Слайдыг өөр хүн өөрчилсөн байна. Шинэчлээд дахин оролдоно уу.' };
    return { slide: data as WeeklySlide, removed: current.image_paths.filter(path => !next.image_paths.includes(path)) };
}

export async function deleteWeeklySlide(db: SupabaseClient, shopId: string, slide: WeeklySlide): Promise<Result<{ removed: string[] }>> {
    const { error } = await db.from('weekly_report_slides').delete().eq('shop_id', shopId).eq('id', slide.id);
    if (error) return { error };
    return { removed: slide.image_paths };
}

/** Дараалал: хэсгийн одоогийн бүх слайдыг яг нэг удаа дурдсан байх ёстой. */
export async function reorderWeeklySlides(db: SupabaseClient, shopId: string, meetingDate: string, part: WeeklySlidePart, ids: readonly string[]): Promise<Result<{ ok: true }>> {
    const current = await db.from('weekly_report_slides').select('id')
        .eq('shop_id', shopId).eq('meeting_date', meetingDate).eq('part', part).limit(WEEKLY_SLIDE_LIMITS.slides * 2);
    if (current.error) return { error: current.error };
    const known = new Set((current.data ?? []).map(row => row.id as string));
    if (known.size !== ids.length || ids.some(id => !known.has(id))) return { invalid: 'Слайдын жагсаалт өөрчлөгдсөн байна. Шинэчлээд дахин оролдоно уу.' };
    for (const [position, id] of ids.entries()) {
        const { error } = await db.from('weekly_report_slides').update({ position }).eq('shop_id', shopId).eq('id', id);
        if (error) return { error };
    }
    return { ok: true };
}

/**
 * Өмнөх хурлын зураггүй слайдууд: энэ хурлаас өмнөх, тухайн хэсэг × сэдэвт зураггүй слайдтай хамгийн сүүлийн хурал
 * (долоо хоног алгассан ч). Зурагтай слайд хуулагдахгүй — файл нь оруулсан хүнийх (`foreignPath`).
 */
export async function previousTextSlides(db: SupabaseClient, shopId: string, meetingDate: string, part: WeeklySlidePart, section: WeeklySlideSection): Promise<{ from: string | null; slides: WeeklySlide[] } | { error: PostgrestError }> {
    const { data, error } = await db.from('weekly_report_slides').select(WEEKLY_SLIDE_COLUMNS)
        .eq('shop_id', shopId).eq('part', part).eq('section', section).eq('image_paths', '{}').lt('meeting_date', meetingDate)
        .order('meeting_date', { ascending: false }).order('position').order('created_at').limit(WEEKLY_SLIDE_LIMITS.slides);
    if (error) return { error };
    const slides = ((data ?? []) as WeeklySlide[]).filter(isTextOnlySlide);
    const from = slides[0]?.meeting_date ?? null;
    return { from, slides: slides.filter(slide => slide.meeting_date === from) };
}

const slideKey = (slide: Pick<WeeklySlide, 'section' | 'title' | 'note'>) => `${slide.section}\u0000${slide.title}\u0000${slide.note}`;

/**
 * «Өмнөх хурлаас хуулах»: өмнөх хурлын тухайн сэдвийн зураггүй слайдуудыг энэ хурлын хэсгийн төгсгөлд хуулна
 * (зохиогч = хуулсан хүн). Энэ хуралд ижил сэдэв, гарчиг, тайлбартай слайд байвал алгасна — дахин дарвал давхардахгүй.
 */
export async function copyPreviousSlides(db: SupabaseClient, shopId: string, actor: SlideActor, input: WeeklySlideCopy): Promise<Result<{ copied: WeeklySlide[]; skipped: number; from: string | null }>> {
    const previous = await previousTextSlides(db, shopId, input.meetingDate, input.part, input.section);
    if ('error' in previous) return previous;
    if (!previous.slides.length) return { copied: [], skipped: 0, from: null };
    const current = await db.from('weekly_report_slides').select('section,title,note,image_paths,position')
        .eq('shop_id', shopId).eq('meeting_date', input.meetingDate).eq('part', input.part)
        .order('position', { ascending: false }).limit(WEEKLY_SLIDE_LIMITS.slides * 2);
    if (current.error) return { error: current.error };
    const rows = (current.data ?? []) as Array<Pick<WeeklySlide, 'section' | 'title' | 'note' | 'image_paths' | 'position'>>;
    const existing = new Set(rows.filter(isTextOnlySlide).map(slideKey));
    const fresh = previous.slides.filter(slide => !existing.has(slideKey(slide)));
    const skipped = previous.slides.length - fresh.length;
    if (!fresh.length) return { copied: [], skipped, from: previous.from };
    if (rows.length + fresh.length > WEEKLY_SLIDE_LIMITS.slides) return { invalid: `Нэг хэсэгт ${WEEKLY_SLIDE_LIMITS.slides} хүртэл слайд нэмнэ.` };
    const start = rows.length ? (rows[0].position as number) + 1 : 0;
    const { data, error } = await db.from('weekly_report_slides').insert(fresh.map((slide, index) => ({
        shop_id: shopId, meeting_date: input.meetingDate, part: input.part, section: slide.section,
        title: slide.title, note: slide.note, image_paths: [], position: Math.min(10_000, start + index),
        author_id: actor.userId, author_name: actor.name.slice(0, 120),
    }))).select(WEEKLY_SLIDE_COLUMNS);
    if (error) return { error };
    return { copied: ((data ?? []) as WeeklySlide[]).sort((a, b) => a.position - b.position), skipped, from: previous.from };
}

/**
 * Зургийг ашигласан слайдын хэсгээр эрхжүүлнэ; маркетингийн контент төлөвлөгөөний (content_calendar)
 * зураг = маркетинг. Хадгалаагүй (дөнгөж upload хийсэн) зургийг зөвхөн оруулсан хүн харна.
 */
export async function mediaParts(db: SupabaseClient, shopId: string, path: string): Promise<{ parts: WeeklySlidePart[] } | { error: PostgrestError }> {
    const [slides, content] = await Promise.all([
        db.from('weekly_report_slides').select('part').eq('shop_id', shopId).contains('image_paths', [path]).limit(10),
        db.from('content_calendar').select('id').eq('shop_id', shopId).contains('image_paths', [path]).limit(1),
    ]);
    if (slides.error) return { error: slides.error };
    if (content.error) return { error: content.error };
    const parts = new Set((slides.data ?? []).map(row => row.part as WeeklySlidePart));
    if (content.data?.length) parts.add('marketing');
    return { parts: [...parts] };
}

/** Слайдаас хасагдсан, өөр слайдад ашиглагдаагүй файлыг устгана (алдаа гарвал лог л үлдэнэ). */
export async function removeUnusedMedia(db: SupabaseClient, shopId: string, paths: readonly string[]): Promise<void> {
    const unused: string[] = [];
    for (const path of paths) {
        const usage = await mediaParts(db, shopId, path);
        if ('parts' in usage && !usage.parts.length) unused.push(path);
    }
    if (unused.length) await db.storage.from(REPORT_MEDIA_BUCKET).remove(unused);
}
