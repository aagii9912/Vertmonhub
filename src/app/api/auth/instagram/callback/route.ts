import { NextRequest } from 'next/server';
import { requireModuleWrite } from '@/lib/auth/require-permission';
import { finishPageOAuth } from '@/lib/facebook/page-connect';

export const dynamic = 'force-dynamic';

// Токеныг серверт солиж, сонгох Instagram-тай Page-үүдийг meta_page_connect_pending-д хадгална (токен браузерт очихгүй).
export async function GET(request: NextRequest) {
    const denied = await requireModuleWrite('marketing-roi');
    if (denied) return denied;
    return finishPageOAuth(request, 'instagram');
}
