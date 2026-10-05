import { z } from 'zod';
import { NextResponse } from 'next/server';
import { withRoute } from '@/lib/api/route';
import { listPendingPages, selectPendingPage } from '@/lib/facebook/page-connect';

const SelectSchema = z.object({ pageId: z.string().regex(/^[0-9]{1,30}$/) }).strict();

/** GET — OAuth-ийн дараа сонгох Facebook Page-үүд (токенгүй) ба дутуу эрх. */
export const GET = withRoute({ module: 'marketing-roi', access: 'write', error: 'Page-ийн жагсаалт татаж чадсангүй' },
    async ({ shop }) => listPendingPages('facebook', shop.id));

/** POST — сонгосон Page-ийг төсөлд серверээс холбоно; токен хариунд орохгүй. */
export const POST = withRoute({ module: 'marketing-roi', access: 'write', error: 'Page холбож чадсангүй' }, async ({ request, shop }) => {
    const parsed = SelectSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Page сонгоно уу.' }, { status: 400 });
    return selectPendingPage('facebook', shop.id, parsed.data.pageId);
});
