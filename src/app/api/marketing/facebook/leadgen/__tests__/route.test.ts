// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

type Row = Record<string, unknown>;
const state = vi.hoisted(() => ({
    inserts: [] as Row[],
    savedRequestIds: new Set<string>(),
    insertError: null as null | { code?: string; message: string },
    events: [] as Row[],
    mappedProject: 'project-garden' as string | null,
}));

vi.mock('@/lib/utils/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/crypto/tokens', () => ({ decryptToken: (value: string | null) => value }));
vi.mock('@/lib/marketing/attribution-events', () => ({ logAttributionEvent: async (event: Row) => { state.events.push(event); } }));
vi.mock('@/lib/supabase', () => ({ supabaseAdmin: () => ({ from: (table: string) => {
    let payload: Row | null = null;
    const query = {
        select: () => query,
        eq: () => query,
        insert: (row: Row) => { payload = row; return query; },
        maybeSingle: async () => ({ data: table === 'marketing_campaigns' && state.mappedProject ? { project_id: state.mappedProject } : null, error: null }),
        single: async () => {
            if (table === 'shops') return { data: { id: 'shop-1', facebook_page_access_token: 'page-token' }, error: null };
            state.inserts.push(payload!);
            if (state.insertError) return { data: null, error: state.insertError };
            const key = String(payload!.client_request_id);
            if (state.savedRequestIds.has(key)) return { data: null, error: { code: '23505', message: 'duplicate key' } };
            state.savedRequestIds.add(key);
            return { data: { id: `lead-${state.savedRequestIds.size}` }, error: null };
        },
    };
    return query;
} }) }));

import { POST } from '../route';

const webhook = (leadgenId = '9001') => new NextRequest('https://app.example/api/marketing/facebook/leadgen', {
    method: 'POST',
    body: JSON.stringify({ entry: [{ id: 'page-1', changes: [{ field: 'leadgen', value: { leadgen_id: leadgenId, page_id: 'page-1' } }] }] }),
});

beforeEach(() => {
    state.inserts = []; state.savedRequestIds = new Set(); state.insertError = null; state.events = []; state.mappedProject = 'project-garden';
    vi.stubEnv('FACEBOOK_APP_SECRET', '');
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
        campaign_id: 'cmp-1',
        field_data: [
            { name: 'full_name', values: ['Бат Дорж'] },
            { name: 'phone_number', values: ['+976 9911 2233'] },
            { name: 'email', values: ['bat@example.mn'] },
        ],
    }), { status: 200 })));
});

describe('Facebook Lead Ads intake', () => {
    it('saves the lead into the real CRM columns and logs attribution', async () => {
        const response = await POST(webhook());
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ success: true, ingested: 1 });
        expect(state.inserts[0]).toMatchObject({
            shop_id: 'shop-1', customer_name: 'Бат Дорж', customer_phone: '+976 9911 2233', customer_email: 'bat@example.mn',
            source: 'facebook_ads', facebook_campaign_id: 'cmp-1', project_id: 'project-garden',
        });
        expect(state.inserts[0].client_request_id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/);
        expect(state.events).toEqual([expect.objectContaining({ leadId: 'lead-1', eventType: 'lead' })]);
    });

    it('keeps leads from unmapped campaigns for an admin to assign a project', async () => {
        state.mappedProject = null;
        expect((await POST(webhook('9004'))).status).toBe(200);
        expect(state.inserts[0]).toMatchObject({ project_id: null, customer_name: 'Бат Дорж' });
    });

    it('stores a lead without a name as anonymous instead of a placeholder', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
            campaign_id: 'cmp-1', field_data: [{ name: 'phone_number', values: ['99112233'] }],
        }), { status: 200 })));
        expect((await POST(webhook('9005'))).status).toBe(200);
        expect(state.inserts[0]).toMatchObject({ customer_name: null, customer_phone: '99112233' });
    });

    it('does not duplicate a lead when Meta delivers it again', async () => {
        await POST(webhook('9002'));
        const retry = await POST(webhook('9002'));
        expect(retry.status).toBe(200);
        expect(state.inserts).toHaveLength(2);
        expect(state.inserts[1].client_request_id).toBe(state.inserts[0].client_request_id);
        expect(state.events).toHaveLength(1);
    });

    it('asks Meta to retry when the lead could not be stored', async () => {
        state.insertError = { code: 'PGRST204', message: 'column missing' };
        const response = await POST(webhook());
        expect(response.status).toBe(500);
        expect(state.events).toEqual([]);
        vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 400 })));
        state.insertError = null;
        expect((await POST(webhook('9003'))).status).toBe(500);
    });
});
