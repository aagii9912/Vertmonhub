import { NextRequest } from 'next/server';
import { startPageOAuth } from '@/lib/facebook/page-connect';

// Facebook Page OAuth эхлэл (Graph v26, read_insights-тэй). Урсгал: lib/facebook/page-connect.ts
export function GET(request: NextRequest) {
    return startPageOAuth(request, 'facebook');
}
