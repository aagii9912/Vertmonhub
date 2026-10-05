import { z } from 'zod';
import { NextResponse } from 'next/server';
import { withRoute } from '@/lib/api/route';
import { publishPhotoPost, publishTextPost } from '@/lib/facebook/marketing-api';
import { loadShopPage } from '@/lib/facebook/page-connect';
import { isMetaPermissionError, isMetaTokenError } from '@/lib/facebook/page-graph';
import { MetaApiError } from '@/lib/facebook/daily-spend';

const PublishSchema = z.object({
    message: z.string().trim().min(1).max(63206),
    imageUrl: z.string().trim().url().max(2000).optional().or(z.literal('')),
    shop_id: z.string().optional(), // хуучин client; төслийг x-shop-id-аар шалгана
}).strict();

/**
 * POST /api/marketing/facebook/publish
 * Идэвхтэй төслийн Facebook Page-д нийтлэл (Graph v26, appsecret_proof, дахин оролдохгүй).
 */
export const POST = withRoute({ module: 'marketing-roi', access: 'write', error: 'Post нийтлэхэд алдаа гарлаа' }, async ({ request, shop }) => {
    const parsed = PublishSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Нийтлэлийн текст оруулна уу' }, { status: 400 });
    const page = await loadShopPage(shop.id);
    if (!page) return NextResponse.json({ error: 'Facebook Page холбогдоогүй байна' }, { status: 400 });
    const { message, imageUrl } = parsed.data;
    try {
        const post = imageUrl
            ? await publishPhotoPost(page.pageId, page.token, message, imageUrl)
            : await publishTextPost(page.pageId, page.token, message);
        return NextResponse.json({ success: true, post, message: 'Нийтлэл амжилттай нийтлэгдлээ!' });
    } catch (error) {
        if (isMetaTokenError(error)) return NextResponse.json({ error: 'Token хугацаа дууссан. Facebook дахин холбоно уу.' }, { status: 401 });
        if (isMetaPermissionError(error)) {
            return NextResponse.json({ error: 'Post нийтлэх зөвшөөрөл байхгүй. pages_manage_posts permission шаардлагатай.' }, { status: 403 });
        }
        if (error instanceof MetaApiError) return NextResponse.json({ error: error.message }, { status: 502 });
        throw error;
    }
});
