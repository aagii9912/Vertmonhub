import { NextRequest } from 'next/server';
import { startPageOAuth } from '@/lib/facebook/page-connect';

// Instagram Business аккаунтын OAuth эхлэл (Facebook Login, Graph v26). Урсгал: lib/facebook/page-connect.ts
export function GET(request: NextRequest) {
    return startPageOAuth(request, 'instagram');
}
