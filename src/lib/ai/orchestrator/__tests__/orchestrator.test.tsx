/**
 * AI Orchestrator unit tests — RBAC gating, registry integrity, markdown rendering.
 * Gemini/DB дуудахгүй замуудыг шалгана (gating нь DB-д хүрэхээс өмнө буцдаг).
 */

import React from 'react';
import { describe, it, expect, beforeAll } from 'vitest';
import { render } from '@testing-library/react';

import {
    readTools, writeTools, deleteTools, adminTools,
    MUTATING_TOOL_NAMES,
} from '@/lib/ai/data-assistant/tools';
import { AGENT_LIST } from '@/lib/ai/orchestrator/agents';
import { MarkdownMessage } from '@/components/ai-assistant/MarkdownMessage';

// executeDataTool нь GEMINI_API_KEY-тэй модулийг ачаалдаг тул env-ийг эхэлж тавиад dynamic import хийнэ.
let executeDataTool: (typeof import('@/lib/ai/data-assistant'))['executeDataTool'];
beforeAll(async () => {
    process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'test-key';
    ({ executeDataTool } = await import('@/lib/ai/data-assistant'));
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

describe('MarkdownMessage rendering', () => {
    it('хүснэгт ба тод текстийг render хийнэ', () => {
        const { container } = render(
            <MarkdownMessage content={'**Сайн** уу\n\n| A | B |\n|---|---|\n| 1 | 2 |'} />
        );
        expect(container.querySelector('table')).toBeTruthy();
        expect(container.querySelector('strong')?.textContent).toBe('Сайн');
        expect(container.querySelectorAll('tbody tr').length).toBe(1);
        expect(container.querySelectorAll('thead th').length).toBe(2);
    });

    it('жагсаалтыг render хийнэ', () => {
        const { container } = render(<MarkdownMessage content={'- нэг\n- хоёр\n- гурав'} />);
        expect(container.querySelectorAll('ul li').length).toBe(3);
    });
});

describe('buildGeminiHistory — SDK-ийн "эхнийх нь user" шаардлага', () => {
    let buildGeminiHistory: (typeof import('@/lib/ai/orchestrator/runAgent'))['buildGeminiHistory'];
    beforeAll(async () => {
        process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'test-key';
        ({ buildGeminiHistory } = await import('@/lib/ai/orchestrator/runAgent'));
    });

    const msg = (role: string, i: number) => ({ role, content: `msg-${i}` });

    it('сондгой урттай яриаг таслахад model-оор эхлэхгүй (1ms crash regression)', () => {
        // 11 мессеж: slice(-10) нь assistant-аар эхэлдэг байсан → SDK шууд шиддэг байв
        const history = Array.from({ length: 11 }, (_, i) => msg(i % 2 === 0 ? 'user' : 'assistant', i));
        const out = buildGeminiHistory(history);
        expect(out.length).toBeGreaterThan(0);
        expect(out[0].role).toBe('user');
    });

    it('бүх түүх model-ээр эхэлж байвал бүгдийг нь хасаж хоосон буцаана', () => {
        const out = buildGeminiHistory([msg('assistant', 0)]);
        expect(out).toEqual([]);
    });

    it('хоосон/undefined түүхэд хоосон буцаана', () => {
        expect(buildGeminiHistory(undefined)).toEqual([]);
        expect(buildGeminiHistory([])).toEqual([]);
    });

    it('MAX_HISTORY(10)-аас илүүг тайрч, user/model role зөв хөрвүүлнэ', () => {
        const history = Array.from({ length: 24 }, (_, i) => msg(i % 2 === 0 ? 'user' : 'assistant', i));
        const out = buildGeminiHistory(history);
        expect(out.length).toBeLessThanOrEqual(10);
        expect(out[0].role).toBe('user');
        expect(out.every((c) => c.role === 'user' || c.role === 'model')).toBe(true);
    });
});
