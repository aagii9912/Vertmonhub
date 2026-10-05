import { NextRequest } from 'next/server';
import { finishPageOAuth } from '@/lib/facebook/page-connect';

export const dynamic = 'force-dynamic';

// Токеныг серверт солиж, сонгох Page-үүдийг meta_page_connect_pending-д хадгална (токен браузерт очихгүй).
export function GET(request: NextRequest) {
    return finishPageOAuth(request, 'facebook');
}
