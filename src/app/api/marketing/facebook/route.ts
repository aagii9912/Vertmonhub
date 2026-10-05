import { NextResponse } from 'next/server';
import { withRoute } from '@/lib/api/route';
import { getPageInfo } from '@/lib/facebook/marketing-api';
import { loadShopPage } from '@/lib/facebook/page-connect';
import { isMetaTokenError } from '@/lib/facebook/page-graph';
import { MetaApiError } from '@/lib/facebook/daily-spend';

/**
 * GET /api/marketing/facebook
 * Идэвхтэй төслийн Facebook Page-ийн ерөнхий мэдээлэл (Graph v26).
 */
export const GET = withRoute({ module: 'marketing-roi', error: 'Facebook мэдээлэл татаж чадсангүй' }, async ({ shop }) => {
    const page = await loadShopPage(shop.id);
    if (!page) {
        return NextResponse.json({ connected: false, message: 'Facebook Page холбогдоогүй байна', page: null });
    }
    try {
        const pageInfo = await getPageInfo(page.pageId, page.token);
        return NextResponse.json({ connected: true, page: { ...pageInfo, stored_name: page.pageName } });
    } catch (error) {
        if (isMetaTokenError(error)) {
            return NextResponse.json({ connected: false, error: 'Facebook token хугацаа дууссан. Дахин холбоно уу.', token_expired: true, page: null });
        }
        if (!(error instanceof MetaApiError)) throw error;
        return NextResponse.json({ connected: true, error: error.message, page: { id: page.pageId, name: page.pageName } });
    }
});
