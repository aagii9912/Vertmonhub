/**
 * AI Orchestrator v3 unit tests — RBAC gating, registry integrity, tool conversion,
 * history building, summary trigger, tool result summaries, markdown rendering.
 * Claude/DB дуудахгүй замуудыг шалгана.
 */

import React from 'react';
import { describe, it, expect, beforeAll } from 'vitest';
import { render } from '@testing-library/react';

import { readTools, writeTools, deleteTools, adminTools, MUTATING_TOOL_NAMES } from '@/lib/ai/data-assistant/tools';
import { AGENT_LIST } from '@/lib/ai/orchestrator/agents';
import { MarkdownMessage } from '@/components/ai-assistant/MarkdownMessage';
import { toClaudeTool, dataToolsForPerms, buildDelegateTool, ASK_USER_TOOL } from '@/lib/ai/claude/tools';
import { needsSummary, SUMMARY_TRIGGER, KEEP_RECENT } from '@/lib/ai/orchestrator/memory';
import { buildSystemBlocks } from '@/lib/ai/orchestrator/prompt';

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
        const t = toClaudeTool(readTools.find((x: { name: string }) => x.name === 'list_leads'));
        expect(t.input_schema.type).toBe('object');
        const props = t.input_schema.properties as Record<string, { type: string; enum?: string[] }>;
        expect(props.status.type).toBe('string');
        expect(props.status.enum).toContain('new');
        expect(props.limit.type).toBe('number');
    });
    it('required болон nested array item-үүдийг хадгална', () => {
        const t = toClaudeTool(adminTools.find((x: { name: string }) => x.name === 'create_role'));
        expect(t.input_schema.required).toEqual(['name', 'display_name_mn']);
        const props = t.input_schema.properties as Record<string, { type: string; items?: { type: string } }>;
        expect(props.modules.type).toBe('array');
        expect(props.modules.items?.type).toBe('string');
    });
    it('RBAC: viewer зөвхөн read tool, super_admin бүгд; e-commerce tool нуугдана', () => {
        const viewer = dataToolsForPerms({ canWrite: false, canDelete: false, role: 'viewer' }).map((t) => t.name);
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
    const readNames = new Set(readTools.map((t: { name: string }) => t.name));
    const writeNames = new Set(writeTools.map((t: { name: string }) => t.name));
    const deleteNames = new Set(deleteTools.map((t: { name: string }) => t.name));
    const adminNames = new Set(adminTools.map((t: { name: string }) => t.name));

    it('agent бүрийн tool нэрс тодорхойлолтод бодитоор байна', () => {
        for (const agent of AGENT_LIST) {
            agent.readToolNames.forEach((n) => expect(readNames.has(n), `${agent.id} read:${n}`).toBe(true));
            agent.writeToolNames.forEach((n) => expect(writeNames.has(n), `${agent.id} write:${n}`).toBe(true));
            (agent.deleteToolNames || []).forEach((n) => expect(deleteNames.has(n), `${agent.id} delete:${n}`).toBe(true));
            (agent.adminToolNames || []).forEach((n) => expect(adminNames.has(n), `${agent.id} admin:${n}`).toBe(true));
        }
    });
    it('MUTATING_TOOL_NAMES шинэ tool-уудыг агуулна', () => {
        ['schedule_viewing', 'delete_viewing', 'create_contract', 'delete_contract', 'create_customer', 'delete_customer', 'attach_file', 'bulk_update_leads', 'invite_user', 'assign_role', 'create_role']
            .forEach((t) => expect(MUTATING_TOOL_NAMES, t).toContain(t));
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
