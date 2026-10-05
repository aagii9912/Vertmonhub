import { NextRequest } from 'next/server';
import { requireModuleWrite } from '@/lib/auth/require-permission';
import { startPageOAuth } from '@/lib/facebook/page-connect';

// Instagram Business аккаунтын OAuth эхлэл (Facebook Login, Graph v26). Урсгал: lib/facebook/page-connect.ts
export async function GET(request: NextRequest) {
    const denied = await requireModuleWrite('marketing-roi');
    if (denied) return denied;
    return startPageOAuth(request, 'instagram');
}
