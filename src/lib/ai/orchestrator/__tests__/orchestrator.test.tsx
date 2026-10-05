/**
 * AI Orchestrator v3 unit tests — RBAC gating, registry integrity, tool conversion,
 * history building, summary trigger, tool result summaries, markdown rendering.
 * Claude/DB дуудахгүй замуудыг шалгана.
 */

import React from 'react';
import { describe, it, expect, beforeAll } from 'vitest';
import { render } from '@testing-library/react';

import { TOOL_DEFINITIONS } from '@/lib/ai/data-assistant/tools';
import { MUTATING_TOOL_NAMES, WRITE_TOOL_NAMES, AUTO_TOOL_NAMES, canUseToolModule, isCatalogTool } from '@/lib/ai/tool-catalog';
import { ROLE_PERMISSIONS } from '@/lib/rbac';
import { paymentStatus } from '@/lib/services/PaymentService';
import { AGENT_LIST } from '@/lib/ai/orchestrator/agents';
import { MarkdownMessage } from '@/components/ai-assistant/MarkdownMessage';
import { toClaudeTool, dataToolsForPerms, buildDelegateTool, ASK_USER_TOOL } from '@/lib/ai/claude/tools';
import { needsSummary, SUMMARY_TRIGGER, KEEP_RECENT } from '@/lib/ai/orchestrator/memory';
import { buildSystemBlocks } from '@/lib/ai/orchestrator/prompt';

const definition = (name: string) => TOOL_DEFINITIONS.find((tool) => tool.name === name)!;

// data-assistant/index нь supabase env шаарддаг тул dynamic import.
let executeDataTool: (typeof import('@/lib/ai/data-assistant'))['executeDataTool'];
let loop: typeof import('@/lib/ai/orchestrator/loop');
beforeAll(async () => {
    ({ executeDataTool } = await import('@/lib/ai/data-assistant'));
    loop = await import('@/lib/ai/orchestrator/loop');
});

describe('executeDataTool RBAC gating (DB-д хүрэхгүй)', () => {
    const viewer = { canWrite: false, canDelete: false, role: 'viewer' };
    const writerNoDelete = { canWrite: true, canDelete: false, role: 'sales_manager' };
    const adminNotSuper = { canWrite: true, canDelete: true, role: 'admin' };

    it('бичих эрхгүй бол create_lead-ийг блоклоно', async () => {
        const r = await executeDataTool('create_lead', { customer_name: 'X' }, 'shop1', viewer, 'u1', false, '');
        expect(r.error).toMatch(/бичих эрх/);
    });
    it('устгах эрхгүй бол delete_lead-ийг блоклоно', async () => {
        const r = await executeDataTool('delete_lead', { lead_id: 'l1' }, 'shop1', writerNoDelete, 'u1', false, '');
        expect(r.error).toMatch(/устгах эрх/);
    });
    it('super_admin биш бол invite_user-ийг блоклоно', async () => {
        const r = await executeDataTool('invite_user', { email: 'a@b.com' }, 'shop1', adminNotSuper, 'u1', false, '');
        expect(r.error).toMatch(/super_admin/);
    });
});

describe('Claude tool хөрвүүлэлт (Gemini schema → input_schema)', () => {
    it('SchemaType утгуудыг JSON Schema type болгож, parameters → input_schema', () => {
        const t = toClaudeTool(definition('list_leads'));
        expect(t.input_schema.type).toBe('object');
        const props = t.input_schema.properties as Record<string, { type: string; enum?: string[] }>;
        expect(props.status.type).toBe('string');
        expect(props.status.enum).toContain('new');
        expect(props.limit.type).toBe('number');
    });
    it('required болон nested array item-үүдийг хадгална', () => {
        const t = toClaudeTool(definition('create_role'));
        expect(t.input_schema.required).toEqual(['name', 'display_name_mn']);
        const props = t.input_schema.properties as Record<string, { type: string; items?: { type: string } }>;
        expect(props.modules.type).toBe('array');
        expect(props.modules.items?.type).toBe('string');
    });
    it('RBAC: viewer зөвхөн read tool, super_admin бүгд; e-commerce tool нуугдана', () => {
        const viewer = dataToolsForPerms({ canWrite: false, canDelete: false, role: 'viewer', modules: ['leads'] }).map((t) => t.name);
        expect(viewer).toContain('list_leads');
        expect(viewer).not.toContain('create_lead');
        expect(viewer).not.toContain('list_orders');
        const sup = dataToolsForPerms({ canWrite: true, canDelete: true, role: 'super_admin' }).map((t) => t.name);
        expect(sup).toContain('delete_lead');
        expect(sup).toContain('invite_user');
        const admin = dataToolsForPerms({ canWrite: true, canDelete: true, role: 'admin' }).map((t) => t.name);
        expect(admin).not.toContain('invite_user');
    });
    it('delegate tool агентын жагсаалтыг тайлбартаа агуулна; ask_user question шаардана', () => {
        const d = buildDelegateTool(AGENT_LIST.map((a) => ({ id: a.id, name: a.name, description: a.description })));
        expect(d.description).toContain('finance-analyst');
        expect(ASK_USER_TOOL.input_schema.required).toEqual(['question']);
    });
});

describe('Agent registry бүрэн бүтэн байдал', () => {
    it('agent бүрийн tool нэрс бүртгэл ба тодорхойлолтод бодитоор байна', () => {
        const defined = new Set(TOOL_DEFINITIONS.map((tool) => tool.name));
        for (const agent of AGENT_LIST) {
            agent.toolNames.forEach((n) => {
                expect(isCatalogTool(n), `${agent.id}:${n}`).toBe(true);
                expect(defined.has(n), `${agent.id}:${n}`).toBe(true);
            });
        }
    });
    it('MUTATING_TOOL_NAMES шинэ tool-уудыг агуулна', () => {
        ['schedule_viewing', 'delete_viewing', 'create_contract', 'transfer_contract', 'delete_contract', 'create_customer', 'delete_customer', 'attach_file', 'bulk_update_leads', 'invite_user', 'assign_role', 'create_role']
            .forEach((t) => expect(MUTATING_TOOL_NAMES, t).toContain(t));
    });
});

describe('Wave 1 — өдөр тутмын tool-ууд', () => {
    it('AUTO tool бүр WRITE tool бөгөөд устгах/төлбөр/шилжүүлэлт AUTO биш', () => {
        AUTO_TOOL_NAMES.forEach((t) => expect(WRITE_TOOL_NAMES, t).toContain(t));
        ['delete_lead', 'add_contract_payment', 'mark_payment_paid', 'assign_lead_manager', 'reschedule_viewing', 'create_contract', 'transfer_contract'].forEach((t) => expect(AUTO_TOOL_NAMES).not.toContain(t));
    });
    it('шинэ tool бүр тодорхойлолттой бөгөөд Claude schema болж хөрвөнө', () => {
        const all = TOOL_DEFINITIONS.map((t) => t.name);
        ['list_viewings', 'list_my_tasks', 'list_contract_payments', 'log_call', 'set_followup', 'assign_lead_manager', 'record_viewing_outcome', 'reschedule_viewing', 'create_task', 'complete_task', 'add_contract_payment', 'mark_payment_paid']
            .forEach((t) => expect(all, t).toContain(t));
        const t = toClaudeTool(definition('log_call'));
        expect(t.input_schema.required).toEqual(['summary']);
    });
    it('wave 2–4: модулийн эрхгүй хэрэглэгч тайлан/маркетингийн tool-ыг харахгүй, super_admin бүгдийг', () => {
        const base = { canWrite: true, canDelete: false, role: 'sales_manager' as const };
        const reportsOnly = dataToolsForPerms({ ...base, modules: ['dashboard', 'leads', 'reports'] }).map((t) => t.name);
        expect(reportsOnly).toContain('get_kpi_report');
        expect(reportsOnly).not.toContain('log_marketing_spend');
        const marketingOnly = dataToolsForPerms({ ...base, modules: ['dashboard', 'marketing-roi'] }).map((t) => t.name);
        expect(marketingOnly).toContain('log_marketing_spend');
        expect(marketingOnly).not.toContain('get_kpi_report');
        const sup = dataToolsForPerms({ canWrite: true, canDelete: true, role: 'super_admin', modules: [] }).map((t) => t.name);
        expect(sup).toContain('get_kpi_report');
        for (const removed of ['get_finance_summary', 'list_finance_transactions', 'add_finance_transaction', 'list_vendor_bills', 'pay_vendor_bill']) expect(sup).not.toContain(removed);
        // Missing permissions cannot silently grant access to legacy callers.
        expect(dataToolsForPerms(base)).toEqual([]);
    });
    it('executeDataTool модулийн эрхийг шалгана (DB-д хүрэхгүй)', async () => {
        const r = await executeDataTool('get_kpi_report', {}, 'shop1', { canWrite: true, canDelete: false, role: 'admin', modules: ['dashboard'] }, 'u1', false, '');
        expect(r.error).toMatch(/reports/);
        expect(await executeDataTool('pay_vendor_bill', {}, 'shop1', { canWrite: true, canDelete: false, role: 'super_admin', modules: [] }, 'u1', true, '')).toHaveProperty('error');
    });
    it('marketing cannot read or mutate contracts, properties or viewings through AI', async () => {
        const perms = { ...ROLE_PERMISSIONS.marketing, role: 'marketing' };
        const visible = dataToolsForPerms(perms).map(tool => tool.name);
        for (const tool of ['list_contracts', 'get_contract_details', 'create_contract', 'transfer_contract', 'add_contract_payment', 'mark_payment_paid', 'update_property_price', 'schedule_viewing']) {
            expect(visible).not.toContain(tool);
            expect(await executeDataTool(tool, {}, 'shop1', perms, 'u1', true)).toHaveProperty('error');
        }
        expect(visible).toContain('list_leads');
        expect(visible).toContain('get_marketing_summary');
        expect(canUseToolModule('attach_file', perms, { entity_type: 'lead' })).toBe(true);
        expect(await executeDataTool('attach_file', { entity_type: 'contract' }, 'shop1', perms, 'u1', true)).toHaveProperty('error');
    });
    it('fails closed for missing module permissions and unmapped tools, including new tools', async () => {
        expect(await executeDataTool('list_leads', {}, 'shop1', { role: 'admin', canWrite: true, canDelete: true }, 'u1')).toHaveProperty('error');
        expect(canUseToolModule('toString', { role: 'super_admin' })).toBe(false);
        const perms = { role: 'super_admin', canWrite: true, canDelete: true, modules: [] };
        expect(await executeDataTool('unregistered_tool', { title: 'Must not save' }, 'shop1', perms, 'u1', true)).toEqual({ error: 'Unknown tool: unregistered_tool' });
        expect(await executeDataTool('toString', {}, 'shop1', perms, 'u1', true)).toHaveProperty('error');
    });
    it('paymentStatus: төлсөн/хагас/хүлээгдэж буй', () => {
        expect(paymentStatus(100, 100)).toBe('paid');
        expect(paymentStatus(40, 100)).toBe('partial');
        expect(paymentStatus(0, 100)).toBe('pending');
        expect(paymentStatus(0, 0)).toBe('pending');
    });
});

describe('buildHistory — эхнийх заавал user, MAX_HISTORY тайрна', () => {
    const msg = (role: string, i: number) => ({ role, content: `msg-${i}` });
    it('сондгой урттай яриаг таслахад assistant-аар эхлэхгүй', () => {
        const history = Array.from({ length: 21 }, (_, i) => msg(i % 2 === 0 ? 'user' : 'assistant', i));
        const out = loop.buildHistory(history);
        expect(out.length).toBeGreaterThan(0);
        expect(out[0].role).toBe('user');
        expect(out.length).toBeLessThanOrEqual(loop.MAX_HISTORY);
    });
    it('assistant-аар эхэлсэн/хоосон түүхийг зөв', () => {
        expect(loop.buildHistory([msg('assistant', 0)])).toEqual([]);
        expect(loop.buildHistory(undefined)).toEqual([]);
        expect(loop.buildHistory([{ role: 'user', content: '  ' }])).toEqual([]);
    });
});

describe('summarizeToolResult — UI мөрний товч', () => {
    it('тоо, алдаа, баталгаажуулалтыг ялгана', () => {
        expect(loop.summarizeToolResult('list_leads', { leads: [1, 2, 3] })).toEqual({ ok: true, summary: '3 лид олдлоо' });
        expect(loop.summarizeToolResult('list_leads', [])).toEqual({ ok: true, summary: 'Олдсонгүй' });
        expect(loop.summarizeToolResult('create_lead', { requiresConfirmation: true })).toEqual({ ok: true, summary: 'Баталгаажуулалт хүлээж байна' });
        expect(loop.summarizeToolResult('x', { error: 'Эрх алга' })).toEqual({ ok: false, summary: 'Эрх алга' });
    });
});

describe('Ярианы санах ой — хураангуй trigger', () => {
    it('богино яриаг хураангуйлахгүй; урт яриаг сүүлийн KEEP_RECENT-ээс бусдыг', () => {
        expect(needsSummary(5, 0)).toBe(false);
        expect(needsSummary(SUMMARY_TRIGGER, 0)).toBe(true);
        expect(needsSummary(SUMMARY_TRIGGER + 2, SUMMARY_TRIGGER + 2 - KEEP_RECENT)).toBe(false);
        expect(needsSummary(SUMMARY_TRIGGER + KEEP_RECENT + 1, SUMMARY_TRIGGER - KEEP_RECENT)).toBe(true);
    });
});

describe('Систем prompt — cache-лэгдэх тогтмол хэсэг + хувьсах хэсэг', () => {
    it('эхний блок cache_control-той, огноо/хэрэглэгч сүүлийн блокт', () => {
        const blocks = buildSystemBlocks({ shopId: 's', userId: 'u', perms: { canWrite: true, canDelete: false, role: 'sales_manager' }, userName: 'Болд', conversationSummary: 'Өмнө нь X' });
        expect(blocks[0].cache_control).toEqual({ type: 'ephemeral', ttl: '1h' });
        const last = blocks[blocks.length - 1];
        expect(last.cache_control).toBeUndefined();
        expect(last.text).toContain('Болд');
        expect(last.text).toContain('Өмнө нь X');
        expect(blocks[0].text).not.toMatch(/ОДОО:/);
    });
});

describe('MarkdownMessage rendering', () => {
    it('хүснэгт ба тод текстийг render хийнэ', () => {
        const { container } = render(<MarkdownMessage content={'**Сайн** уу\n\n| A | B |\n|---|---|\n| 1 | 2 |'} />);
        expect(container.querySelector('table')).toBeTruthy();
        expect(container.querySelector('strong')?.textContent).toBe('Сайн');
    });
});
