/**
 * POST /api/ai-assistant/action — баталгаажуулсан AI үйлдлийг гүйцэтгэх endpoint.
 *
 * Энэ нь confirm-flow-ийн server тал: auth, ai-assistant модулийн эрх, зөвшөөрөгдсөн
 * (mutating) tool мөн эсэх, shop scoping-ийг ДАХИН шалгаад confirm=true-ээр гүйцэтгэнэ.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { jsonRequest, makeSupabaseMock } from '@/test/api-harness';

const h = vi.hoisted(() => ({
    resolveApiUser: vi.fn(),
    fetchRolePermissions: vi.fn(),
    executeDataTool: vi.fn(),
    resolveSalesManagerName: vi.fn(),
    adminClient: null as unknown,
}));

vi.mock('@/lib/auth/resolve-user', () => ({ resolveApiUser: h.resolveApiUser }));
vi.mock('@/lib/rbac', () => ({ fetchRolePermissions: h.fetchRolePermissions }));
vi.mock('@/lib/supabase', () => ({ supabaseAdmin: () => h.adminClient }));
vi.mock('@/lib/ai/data-assistant', () => ({ executeDataTool: h.executeDataTool }));
vi.mock('@/lib/ai/data-assistant/functions', () => ({ resolveSalesManagerName: h.resolveSalesManagerName }));
vi.mock('@/lib/utils/logger', () => ({
    logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn(), success: vi.fn() },
}));

import { POST } from '@/app/api/ai-assistant/action/route';

const URL = 'http://localhost:3001/api/ai-assistant/action';

/** Эрх бүхий хэрэглэгч + хандах боломжтой shop-той стандарт орчин. */
function setupAuthorized() {
    h.resolveApiUser.mockResolvedValue({ id: 'user-1', email: 'a@b.c' });
    h.fetchRolePermissions.mockResolvedValue({
        modules: ['dashboard', 'ai-assistant'], canWrite: true, canDelete: true,
        canAccessAdmin: false, displayName: 'Admin', displayNameMN: 'Админ',
    });
    h.resolveSalesManagerName.mockResolvedValue('Болд');
    h.adminClient = makeSupabaseMock({
        user_roles: { data: { role: 'admin' } },
        shops: { data: [{ id: 'shop-1' }] },
        shop_members: { data: [] },
        ai_messages: { data: null, error: null },
        ai_conversations: { data: null, error: null },
    });
}

beforeEach(() => {
    vi.clearAllMocks();
    setupAuthorized();
});

describe('POST /api/ai-assistant/action — auth & эрх', () => {
    it('нэвтрээгүй бол 401', async () => {
        h.resolveApiUser.mockResolvedValue(null);
        const res = await POST(jsonRequest(URL, { tool: 'create_lead', args: {}, shopId: 'shop-1' }));
        expect(res.status).toBe(401);
    });

    it('ai-assistant модулийн эрхгүй бол 403', async () => {
        h.fetchRolePermissions.mockResolvedValue({
            modules: ['dashboard'], canWrite: true, canDelete: true,
            canAccessAdmin: false, displayName: 'x', displayNameMN: 'x',
        });
        const res = await POST(jsonRequest(URL, { tool: 'create_lead', args: {}, shopId: 'shop-1' }));
        expect(res.status).toBe(403);
        expect(h.executeDataTool).not.toHaveBeenCalled();
    });
});

describe('POST /api/ai-assistant/action — tool баталгаажуулалт', () => {
    it('tool дутуу бол 400', async () => {
        const res = await POST(jsonRequest(URL, { args: {}, shopId: 'shop-1' }));
        expect(res.status).toBe(400);
        expect(h.executeDataTool).not.toHaveBeenCalled();
    });

    it('mutating биш (read) tool бол 400 — зөвхөн зөвшөөрөгдсөн үйлдэл', async () => {
        const res = await POST(jsonRequest(URL, { tool: 'list_leads', args: {}, shopId: 'shop-1' }));
        expect(res.status).toBe(400);
        expect(h.executeDataTool).not.toHaveBeenCalled();
    });

    it('тодорхойгүй tool бол 400', async () => {
        const res = await POST(jsonRequest(URL, { tool: 'drop_table', args: {}, shopId: 'shop-1' }));
        expect(res.status).toBe(400);
    });
});

describe('POST /api/ai-assistant/action — shop scoping', () => {
    it('хандах эрхгүй shopId бол 403', async () => {
        const res = await POST(jsonRequest(URL, { tool: 'create_lead', args: {}, shopId: 'other-shop' }));
        expect(res.status).toBe(403);
        expect(h.executeDataTool).not.toHaveBeenCalled();
    });

    it('холбогдсон shop байхгүй бол 403', async () => {
        h.adminClient = makeSupabaseMock({
            user_roles: { data: { role: 'admin' } },
            shops: { data: [] },
            shop_members: { data: [] },
        });
        const res = await POST(jsonRequest(URL, { tool: 'create_lead', args: {} }));
        expect(res.status).toBe(403);
    });
});

describe('POST /api/ai-assistant/action — гүйцэтгэл', () => {
    it('амжилттай үйлдлийг confirm=true ба менежерийн нэрээр гүйцэтгэнэ', async () => {
        h.executeDataTool.mockResolvedValue({ message: 'Лийд үүсгэлээ' });
        const res = await POST(jsonRequest(URL, { tool: 'create_lead', args: { customer_name: 'A' }, shopId: 'shop-1' }));
        const body = await res.json();

        expect(res.status).toBe(200);
        expect(body.success).toBe(true);
        expect(body.message).toBe('Лийд үүсгэлээ');
        expect(h.executeDataTool).toHaveBeenCalledWith(
            'create_lead', { customer_name: 'A' }, 'shop-1',
            { canWrite: true, canDelete: true, role: 'admin' },
            'user-1', true, 'Болд',
        );
    });

    it('shopId дамжуулаагүй бол хандах боломжтой эхний shop-г сонгоно', async () => {
        h.executeDataTool.mockResolvedValue({ message: 'ok' });
        await POST(jsonRequest(URL, { tool: 'create_lead', args: {} }));
        expect(h.executeDataTool).toHaveBeenCalledWith(
            'create_lead', {}, 'shop-1', expect.any(Object), 'user-1', true, 'Болд',
        );
    });

    it('tool алдаа буцаавал success=false', async () => {
        h.executeDataTool.mockResolvedValue({ error: 'Байр олдсонгүй' });
        const res = await POST(jsonRequest(URL, { tool: 'delete_property', args: { property_id: 'p1' }, shopId: 'shop-1' }));
        const body = await res.json();
        expect(body.success).toBe(false);
        expect(body.message).toBe('Байр олдсонгүй');
    });
});
