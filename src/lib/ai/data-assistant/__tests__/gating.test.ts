/**
 * AI Data Assistant gating tests.
 *
 * Энэ нь AI-аар хийгдэх бичих/устгах/админ үйлдлийн аюулгүйн хаалтыг түгжинэ:
 *  - RBAC шалгалт (write→canWrite, delete→canDelete, admin→super_admin)
 *  - confirm дамжуулалт ба audit зөвхөн бодит үйлдэлд (confirm=true) бичигдэх
 *  - tool нэрийн жагсаалтуудын дотоод уялдаа (gating-аас гадуур tool үлдэхгүй)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// './functions' доторх бүх экспортыг sentinel буцаадаг mock-оор солино.
// fn нь vi.mock factory дотор hoist хийгддэг тул vi.hoisted-аар тодорхойлно.
const { fn } = vi.hoisted(() => ({ fn: () => vi.fn(async () => ({ ok: true })) }));
vi.mock('@/lib/ai/data-assistant/functions', () => ({
    fetchDashboardStats: fn(), fetchOrders: fn(), fetchProductStats: fn(),
    fetchProperties: fn(), fetchLeads: fn(), fetchLeadDetails: fn(), fetchCustomerInsights: fn(),
    fetchContracts: fn(), fetchContractDetails: fn(), fetchContractsSummary: fn(),
    fetchSalesSummary: fn(), fetchSalesForecast: fn(), compareProperties: fn(),
    updatePropertyStatus: fn(), updatePropertyPrice: fn(), updateLeadStatus: fn(),
    addLeadNote: fn(), processContractAction: fn(),
    createProperty: fn(), deleteProperty: fn(), createLead: fn(), deleteLead: fn(),
    createCustomer: fn(), scheduleViewing: fn(), deleteViewing: fn(), createContract: fn(),
    deleteContract: fn(), deleteCustomer: fn(), attachFile: fn(), bulkUpdateLeads: fn(),
    fetchMarketingSummary: fn(), createSocialPost: fn(), rememberFact: fn(),
    generateChartConfig: fn(),
}));

vi.mock('@/lib/ai/data-assistant/admin-functions', () => ({
    inviteUser: fn(), assignRole: fn(), createRole: fn(),
}));

const { logAiAuditMock } = vi.hoisted(() => ({ logAiAuditMock: vi.fn(async () => undefined) }));
vi.mock('@/lib/ai/data-assistant/audit', () => ({ logAiAudit: logAiAuditMock }));

vi.mock('@/lib/utils/logger', () => ({
    logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn(), success: vi.fn() },
}));

import { executeDataTool, type AssistantPerms } from '@/lib/ai/data-assistant';
import * as functions from '@/lib/ai/data-assistant/functions';
import * as adminFunctions from '@/lib/ai/data-assistant/admin-functions';
import {
    readTools, writeTools, deleteTools, adminTools,
    WRITE_TOOL_NAMES, DELETE_TOOL_NAMES, ADMIN_TOOL_NAMES, MUTATING_TOOL_NAMES,
} from '@/lib/ai/data-assistant/tools';

const VIEWER: AssistantPerms = { canWrite: false, canDelete: false, role: 'viewer' };
const WRITER: AssistantPerms = { canWrite: true, canDelete: false, role: 'sales_manager' };
const DELETER: AssistantPerms = { canWrite: true, canDelete: true, role: 'finance_manager' };
const SUPER: AssistantPerms = { canWrite: true, canDelete: true, role: 'super_admin' };

beforeEach(() => vi.clearAllMocks());

describe('executeDataTool — RBAC хаалт', () => {
    it('бичих эрхгүй хэрэглэгч write tool дуудахад татгалзаж, функцийг дуудахгүй', async () => {
        const res = await executeDataTool('create_lead', { customer_name: 'A' }, 'shop-1', VIEWER, 'u1');
        expect(res.error).toContain('бичих эрх');
        expect(functions.createLead).not.toHaveBeenCalled();
    });

    it('устгах эрхгүй хэрэглэгч (бичих эрхтэй ч) delete tool дуудахад татгалзана', async () => {
        const res = await executeDataTool('delete_lead', { lead_id: 'l1' }, 'shop-1', WRITER, 'u1');
        expect(res.error).toContain('устгах эрх');
        expect(functions.deleteLead).not.toHaveBeenCalled();
    });

    it('super_admin биш хэрэглэгч admin tool дуудахад татгалзана', async () => {
        const res = await executeDataTool('invite_user', { email: 'a@b.c' }, 'shop-1', DELETER, 'u1');
        expect(res.error).toContain('super_admin');
        expect(adminFunctions.inviteUser).not.toHaveBeenCalled();
    });

    it('read tool эрхийн шалгалтгүй ажиллана (viewer ч уншина)', async () => {
        await executeDataTool('list_leads', { status: 'new' }, 'shop-1', VIEWER, 'u1');
        expect(functions.fetchLeads).toHaveBeenCalledWith('shop-1', { status: 'new' });
    });

    it('тодорхойгүй tool → алдаа', async () => {
        const res = await executeDataTool('nope', {}, 'shop-1', SUPER, 'u1');
        expect(res.error).toContain('Unknown tool');
    });
});

describe('executeDataTool — эрх олгогдсон үед', () => {
    it('бичих эрхтэй хэрэглэгч create_lead-г confirm + userName дамжуулан гүйцэтгэнэ', async () => {
        await executeDataTool('create_lead', { customer_name: 'A' }, 'shop-1', WRITER, 'u1', true, 'Болд');
        expect(functions.createLead).toHaveBeenCalledWith('shop-1', { customer_name: 'A' }, true, 'Болд');
    });

    it('устгах эрхтэй хэрэглэгч delete_lead гүйцэтгэнэ', async () => {
        await executeDataTool('delete_lead', { lead_id: 'l1' }, 'shop-1', DELETER, 'u1', true);
        expect(functions.deleteLead).toHaveBeenCalledWith('shop-1', { lead_id: 'l1' }, true);
    });

    it('super_admin admin tool гүйцэтгэнэ', async () => {
        await executeDataTool('invite_user', { email: 'a@b.c' }, 'shop-1', SUPER, 'u1', true);
        expect(adminFunctions.inviteUser).toHaveBeenCalledWith('shop-1', { email: 'a@b.c' }, true, 'u1');
    });
});

describe('executeDataTool — баталгаажуулалт (confirm) дамжуулалт', () => {
    it('confirm=false-г mutating функцид дамжуулна (preview)', async () => {
        await executeDataTool('create_property', { name: 'X', type: 'apartment', price: 1 }, 'shop-1', WRITER, 'u1', false);
        expect(functions.createProperty).toHaveBeenCalledWith('shop-1', expect.any(Object), false);
    });
});

describe('executeDataTool — audit', () => {
    it('confirm=true mutating үйлдэлд audit бичнэ', async () => {
        await executeDataTool('create_lead', { customer_name: 'A' }, 'shop-1', WRITER, 'u1', true, 'Болд');
        expect(logAiAuditMock).toHaveBeenCalledWith(expect.objectContaining({
            shopId: 'shop-1', userId: 'u1', tool: 'create_lead', success: true,
        }));
    });

    it('confirm=false (зөвхөн preview) үед audit бичихгүй', async () => {
        await executeDataTool('create_lead', { customer_name: 'A' }, 'shop-1', WRITER, 'u1', false);
        expect(logAiAuditMock).not.toHaveBeenCalled();
    });

    it('read tool-д audit бичихгүй', async () => {
        await executeDataTool('list_leads', {}, 'shop-1', SUPER, 'u1', true);
        expect(logAiAuditMock).not.toHaveBeenCalled();
    });

    it('үйлдэл алдаатай бол audit success=false', async () => {
        (functions.deleteContract as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ error: 'not found' });
        await executeDataTool('delete_contract', { contract_id: 'c1' }, 'shop-1', DELETER, 'u1', true);
        expect(logAiAuditMock).toHaveBeenCalledWith(expect.objectContaining({
            tool: 'delete_contract', success: false,
        }));
    });
});

describe('tool нэрийн жагсаалтуудын уялдаа', () => {
    const namesOf = (defs: Array<{ name: string }>) => defs.map((t) => t.name).sort();

    it('MUTATING_TOOL_NAMES = WRITE ∪ DELETE ∪ ADMIN', () => {
        expect([...MUTATING_TOOL_NAMES].sort()).toEqual(
            [...WRITE_TOOL_NAMES, ...DELETE_TOOL_NAMES, ...ADMIN_TOOL_NAMES].sort()
        );
    });

    it('WRITE / DELETE / ADMIN жагсаалтууд давхцалгүй', () => {
        const all = [...WRITE_TOOL_NAMES, ...DELETE_TOOL_NAMES, ...ADMIN_TOOL_NAMES];
        expect(new Set(all).size).toBe(all.length);
    });

    it('write/delete/admin tool тодорхойлолтууд харгалзах нэрийн жагсаалттай яг таарна', () => {
        expect(namesOf(writeTools)).toEqual([...WRITE_TOOL_NAMES].sort());
        expect(namesOf(deleteTools)).toEqual([...DELETE_TOOL_NAMES].sort());
        expect(namesOf(adminTools)).toEqual([...ADMIN_TOOL_NAMES].sort());
    });

    it('нэг ч read tool mutating (gating шаардах) жагсаалтад ороогүй', () => {
        const mutating = new Set(MUTATING_TOOL_NAMES);
        for (const t of readTools) {
            expect(mutating.has(t.name), `${t.name} read боловч mutating жагсаалтад байна`).toBe(false);
        }
    });
});
