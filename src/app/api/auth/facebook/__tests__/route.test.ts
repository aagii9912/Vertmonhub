// @vitest-environment node
import { expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth/require-permission', () => ({ requireModuleWrite: vi.fn(async () => null) }));
import { GET } from '../route';

it('asks for the Lead Ads permissions next to the DM and page scopes', async () => {
    vi.stubEnv('FACEBOOK_APP_ID', '424242');
    const res = await GET(new NextRequest('https://www.vertmon.mn/api/auth/facebook'));
    const scopes = new URL(res.headers.get('location')!).searchParams.get('scope')!.split(',');
    expect(scopes).toEqual(expect.arrayContaining(['pages_manage_metadata', 'pages_messaging', 'leads_retrieval', 'pages_manage_ads']));
    expect(scopes).not.toContain('email');
});
