// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { newsletterHtml, defaultNewsletterDesign } from '@/lib/marketing/newsletter';

const mocks = vi.hoisted(() => ({ read: vi.fn(), write: vi.fn(), shop: vi.fn(), from: vi.fn(), rpc: vi.fn(), send: vi.fn(), get: vi.fn(), create: vi.fn(), contacts: vi.fn() }));
vi.mock('@/lib/auth/require-permission', () => ({ requireModule: mocks.read, requireModuleWrite: mocks.write }));
vi.mock('@/lib/auth/supabase-auth', () => ({ getUserShop: mocks.shop, getUserId: async () => 'user', supabaseAdmin: () => ({ from: mocks.from, rpc: mocks.rpc }) }));
vi.mock('resend', () => ({ Resend: class { broadcasts = { send: mocks.send, get: mocks.get, create: mocks.create }; contacts = { get: mocks.contacts }; } }));
import { GET as newsletterGet, POST as newsletterPost } from '@/app/api/marketing/newsletter/route';

type Row = Record<string, unknown>;
let tables: Record<string, Row[]>;
const own = '00000000-0000-4000-8000-000000000001';
const foreign = '00000000-0000-4000-8000-000000000002';
const projectId = '00000000-0000-4000-8000-000000000010';
const call = (body: object) => new NextRequest('http://localhost/api/marketing/newsletter', { method: 'POST', body: JSON.stringify({ projectId, ...body }) });
function query(table: string) {
    const filters: Array<(r: Row) => boolean> = [];
    let update: Row | null = null;
    let insert: Row | null = null;
    const execute = (single = false) => {
        if (insert) tables[table].push(insert);
        const data = tables[table].filter(r => filters.every(f => f(r)));
        if (update) for (const r of data) Object.assign(r, update);
        return { data: single ? data[0] ?? null : data, error: null, count: data.length };
    };
    const q = {
        select: () => q, eq: (key: string, value: unknown) => { filters.push(r => key === 'design' && typeof value === 'string' ? JSON.stringify(r[key]) === value : r[key] === value); return q; },
        is: (key: string, value: unknown) => { filters.push(r => r[key] === value); return q; },
        order: () => q, range: () => q, limit: () => q,
        update: (values: Row) => { update = values; return q; }, insert: (values: Row) => { insert = values; return q; },
        maybeSingle: async () => execute(true), single: async () => execute(true),
        then: (resolve: (v: ReturnType<typeof execute>) => unknown) => Promise.resolve(execute()).then(resolve),
    };
    return q;
}
beforeEach(() => {
    vi.clearAllMocks(); vi.stubEnv('RESEND_API_KEY', 'test-only'); vi.stubEnv('EMAIL_FROM', 'newsletter@example.invalid');
    mocks.read.mockResolvedValue(null); mocks.write.mockResolvedValue(null); mocks.shop.mockResolvedValue({ id: 'allowed', name: 'Shop' });
    tables = { projects: [{ id: projectId, shop_id: 'allowed' }], newsletter_project_settings: [{ project_id: projectId, shop_id: 'allowed', segment_id: 'own-segment', from_name: 'Test', from_email: 'newsletter@example.invalid' }], newsletters: [
        { id: own, project_id: projectId, shop_id: 'allowed', subject: 'Мэдээ', body: 'Агуулга', design: null, status: 'draft', broadcast_id: 'own-broadcast' },
        { id: foreign, shop_id: 'other', subject: 'Private', body: 'Private', status: 'draft', broadcast_id: 'foreign-broadcast' },
    ], erp_imports: [] };
    mocks.from.mockImplementation(query);
    mocks.get.mockResolvedValue({ data: { id: 'own-broadcast', status: 'draft', segment_id: 'own-segment', from: 'Test <newsletter@example.invalid>', subject: 'Мэдээ', html: newsletterHtml('Мэдээ', 'Агуулга') }, error: null });
    mocks.send.mockResolvedValue({ data: { id: 'own-broadcast' }, error: null });
});
it('checks dedicated read/write modules before any data or provider operations', async () => {
    mocks.read.mockResolvedValue(NextResponse.json({}, { status: 403 }));
    mocks.write.mockResolvedValue(NextResponse.json({}, { status: 403 }));
    expect((await newsletterGet(new NextRequest('http://localhost/api/marketing/newsletter'))).status).toBe(403);
    expect((await newsletterPost(call({ action: 'send', id: own, confirm: true }))).status).toBe(403);
    expect(mocks.read).toHaveBeenCalledWith('marketing-roi'); expect(mocks.write).toHaveBeenCalledWith('marketing-roi');
    expect(mocks.from).not.toHaveBeenCalled(); expect(mocks.send).not.toHaveBeenCalled();
});
it('scopes newsletter list and send to verified shop and blocks unconfirmed sends', async () => {
    const list = await newsletterGet(new NextRequest(`http://localhost/api/marketing/newsletter?shop_id=other&projectId=${projectId}`));
    expect((await list.json()).newsletters.map((n: Row) => n.id)).toEqual([own]);
    expect((await newsletterPost(call({ action: 'send', id: foreign, confirm: true }))).status).toBe(404);
    expect((await newsletterPost(call({ action: 'send', id: own }))).status).toBe(400);
    expect(mocks.send).not.toHaveBeenCalled();
});
it('queues one send and prevents a second send even if provider status is lagging', async () => {
    expect((await newsletterPost(call({ action: 'send', id: own, confirm: true }))).status).toBe(200);
    expect(tables.newsletters[0].status).toBe('queued');
    expect((await newsletterPost(call({ action: 'send', id: own, confirm: true }))).status).toBe(409);
    expect(mocks.send).toHaveBeenCalledTimes(1);
});
it('does not retry ambiguous network outcomes and never equates accepted with delivered', async () => {
    mocks.send.mockRejectedValueOnce(new Error('Network timeout'));
    expect((await newsletterPost(call({ action: 'send', id: own, confirm: true }))).status).toBe(502);
    expect(tables.newsletters[0].status).toBe('unknown');
    await newsletterPost(call({ action: 'refresh', id: own }));
    expect(tables.newsletters[0].status).toBe('unknown');
    expect((await newsletterPost(call({ action: 'send', id: own, confirm: true }))).status).toBe(409);
    expect(mocks.send).toHaveBeenCalledTimes(1);
});
it('keeps definite provider rejections retryable and rejects changed recipients/content', async () => {
    mocks.send.mockResolvedValueOnce({ data: null, error: { statusCode: 429, message: 'Rate limit' } });
    expect((await newsletterPost(call({ action: 'send', id: own, confirm: true }))).status).toBe(502);
    expect(tables.newsletters[0].status).toBe('draft');
    mocks.get.mockResolvedValueOnce({ data: { status: 'draft', segment_id: 'foreign' }, error: null });
    expect((await newsletterPost(call({ action: 'send', id: own, confirm: true }))).status).toBe(409);
    expect(mocks.send).toHaveBeenCalledTimes(1);
});
it('saves drafts without provider credentials and never resubscribes opted-out recipients', async () => {
    vi.stubEnv('RESEND_API_KEY', ''); tables.newsletters[0].broadcast_id = null;
    expect((await newsletterPost(call({ action: 'save', id: own, subject: 'Шинэ', body: 'Мэдээ' }))).status).toBe(200);
    expect((await newsletterPost(call({ action: 'prepare', id: own }))).status).toBe(503);
    expect(mocks.create).not.toHaveBeenCalled();
    vi.stubEnv('RESEND_API_KEY', 'test-only'); mocks.contacts.mockResolvedValueOnce({ data: { unsubscribed: true }, error: null });
    expect((await newsletterPost(call({ action: 'subscribe', email: 'a@example.com', consent: true }))).status).toBe(409);
});
it('persists design, prepares the same HTML and refuses changed provider templates', async () => {
    tables.newsletters[0].broadcast_id = null;
    const design = { ...defaultNewsletterDesign('Тест төсөл'), buttonText: 'Дэлгэрэнгүй', buttonUrl: 'https://example.com' };
    expect((await newsletterPost(call({ action: 'save', id: own, subject: 'Мэдээ', body: 'Агуулга', design }))).status).toBe(200);
    expect(tables.newsletters[0].design).toEqual(design);
    mocks.create.mockResolvedValueOnce({ data: { id: 'new-broadcast' }, error: null });
    expect((await newsletterPost(call({ action: 'prepare', id: own }))).status).toBe(200);
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ html: newsletterHtml('Мэдээ', 'Агуулга', design) }));
    // Provider still has the old plain-text rendering: sending must be blocked.
    expect((await newsletterPost(call({ action: 'send', id: own, confirm: true }))).status).toBe(409);
    expect(mocks.send).not.toHaveBeenCalled();
    mocks.get.mockResolvedValueOnce({ data: { status: 'draft', segment_id: 'own-segment', from: 'Test <newsletter@example.invalid>', subject: 'Мэдээ', html: newsletterHtml('Мэдээ', 'Агуулга', design) }, error: null });
    expect((await newsletterPost(call({ action: 'send', id: own, confirm: true }))).status).toBe(200);
});
it('rejects invalid design at the API boundary before any persistence or provider call', async () => {
    expect((await newsletterPost(call({ action: 'save', id: own, subject: 'Мэдээ', body: 'Агуулга', design: { ...defaultNewsletterDesign(), imageUrl: 'javascript:alert(1)' } }))).status).toBe(400);
    expect(mocks.from).not.toHaveBeenCalled(); expect(mocks.create).not.toHaveBeenCalled();
});

it('blocks foreign projects and prevents cross-project draft access', async () => {
    expect((await newsletterPost(call({ action: 'send', id: own, confirm: true, projectId: foreign }))).status).toBe(403);
    tables.projects.push({ id: foreign, shop_id: 'allowed' });
    tables.newsletter_project_settings.push({ ...tables.newsletter_project_settings[0], project_id: foreign });
    expect((await newsletterPost(call({ action: 'send', id: own, confirm: true, projectId: foreign }))).status).toBe(404);
    expect(mocks.send).not.toHaveBeenCalled();
});
