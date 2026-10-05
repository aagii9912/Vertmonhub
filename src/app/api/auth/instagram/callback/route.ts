import { NextRequest } from 'next/server';
import { finishPageOAuth } from '@/lib/facebook/page-connect';

export const dynamic = 'force-dynamic';

// Instagram-тай Page-үүдийг серверт хадгалж сонгуулна (токен браузерт очихгүй).
export function GET(request: NextRequest) {
    return finishPageOAuth(request, 'instagram');
}
