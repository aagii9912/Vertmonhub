import { z } from 'zod';
import { NextResponse } from 'next/server';
import { withRoute } from '@/lib/api/route';
import { listPendingPages, selectPendingPage } from '@/lib/facebook/page-connect';

const SelectSchema = z.object({ pageId: z.string().regex(/^[0-9]{1,30}$/) }).strict();

/** GET — OAuth-ийн дараа сонгох Instagram Business аккаунтууд (Page-ээр нь, токенгүй). */
export const GET = withRoute({ module: 'marketing-roi', access: 'write', error: 'Instagram аккаунтын жагсаалт татаж чадсангүй' },
    async ({ shop }) => listPendingPages('instagram', shop.id));

/** POST — сонгосон Page-ийн Instagram аккаунтыг төсөлд серверээс холбоно. */
export const POST = withRoute({ module: 'marketing-roi', access: 'write', error: 'Instagram холбож чадсангүй' }, async ({ request, shop }) => {
    const parsed = SelectSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Instagram аккаунт сонгоно уу.' }, { status: 400 });
    return selectPendingPage('instagram', shop.id, parsed.data.pageId);
});
