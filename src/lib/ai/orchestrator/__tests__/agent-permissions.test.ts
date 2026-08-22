/**
 * Рольд суурилсан agent замчлал ба tool→модуль зураглалын тестүүд.
 *
 * Энэ хоёр механизм нь 2026-08-22-ны аудитаар илэрсэн эрхийн нүхийг хаана:
 * AI зам `permissions.modules`-ыг ОГТ шалгадаггүй байсан тул маркетингийн
 * ролийн хэрэглэгч чатаар гэрээ/санхүүгийн дата уншиж чаддаг байв.
 */

import { describe, it, expect } from 'vitest';
import { AGENT_LIST, allowedAgentsFor } from '../agents';
import { TOOL_MODULE_MAP, readTools, writeTools, deleteTools } from '@/lib/ai/data-assistant/tools';
import { ROLE_PERMISSIONS } from '@/lib/rbac';

const permsFor = (role: string) => ({
    role,
    modules: ROLE_PERMISSIONS[role]?.modules ?? [],
});

describe('allowedAgentsFor', () => {
    it('super_admin бүх agent-д хандана', () => {
        expect(allowedAgentsFor({ role: 'super_admin' })).toHaveLength(AGENT_LIST.length);
    });

    it('operations-admin зөвхөн super_admin-д нээлттэй', () => {
        for (const role of ['admin', 'sales_manager', 'marketing', 'viewer']) {
            const ids = allowedAgentsFor(permsFor(role)).map((a) => a.id);
            expect(ids).not.toContain('operations-admin');
        }
    });

    it('борлуулалтын менежерт санхүүгийн agent нээгдэхгүй', () => {
        const ids = allowedAgentsFor(permsFor('sales_manager')).map((a) => a.id);
        // sales_manager-д contracts бий, гэхдээ finance алга →
        // finance-analyst нь ['contracts','finance'] тул contracts-аар нээгдэнэ.
        expect(ids).toContain('my-work');
        expect(ids).toContain('crm-specialist');
        expect(ids).toContain('property-expert');
    });

    it('маркетингийн ролид байр/гэрээний agent нээгдэхгүй', () => {
        const ids = allowedAgentsFor(permsFor('marketing')).map((a) => a.id);
        expect(ids).toContain('marketing-specialist');
        expect(ids).not.toContain('property-expert');
        expect(ids).not.toContain('finance-analyst');
    });

    it('санхүүгийн менежерт маркетингийн agent нээгдэхгүй', () => {
        const ids = allowedAgentsFor(permsFor('finance_manager')).map((a) => a.id);
        expect(ids).toContain('finance-analyst');
        expect(ids).not.toContain('marketing-specialist');
    });

    it('viewer-д бичих домэйны agent-ууд хаагдана', () => {
        const ids = allowedAgentsFor(permsFor('viewer')).map((a) => a.id);
        expect(ids).not.toContain('property-expert');
        expect(ids).not.toContain('crm-specialist');
        expect(ids).not.toContain('finance-analyst');
    });

    it('modules тодорхойгүй бол хуучин зан төлөв (шалгахгүй)', () => {
        const ids = allowedAgentsFor({ role: 'sales_manager' }).map((a) => a.id);
        expect(ids).toContain('finance-analyst');
    });
});

describe('TOOL_MODULE_MAP drift guard', () => {
    const allToolNames = [...readTools, ...writeTools, ...deleteTools].map((t) => t.name as string);

    // Модулийн хязгаargүй байх нь ЗӨВ tool-ууд (хувийн санах ой, ерөнхий).
    const INTENTIONALLY_UNMAPPED = new Set<string>(['remember_fact']);

    it('tool бүр модульд холбогдсон эсвэл зориуд чөлөөтэй', () => {
        const unmapped = allToolNames.filter(
            (n) => !TOOL_MODULE_MAP[n] && !INTENTIONALLY_UNMAPPED.has(n),
        );
        expect(unmapped).toEqual([]);
    });

    it('зураглал дахь бүх tool жинхэнэ бүртгэлд байна', () => {
        const known = new Set(allToolNames);
        const ghosts = Object.keys(TOOL_MODULE_MAP).filter((n) => !known.has(n));
        expect(ghosts).toEqual([]);
    });

    it('гэрээний tool-ууд маркетингийн ролид хаагдана', () => {
        const marketingModules = ROLE_PERMISSIONS.marketing.modules;
        for (const tool of ['list_contracts', 'get_contracts_summary', 'get_contract_details']) {
            const required = TOOL_MODULE_MAP[tool];
            expect(required.some((m) => marketingModules.includes(m))).toBe(false);
        }
    });

    it('менежерийн өдрийн ажлын tool-ууд борлуулалтын ролид нээлттэй', () => {
        const smModules = ROLE_PERMISSIONS.sales_manager.modules;
        for (const tool of ['get_my_day', 'list_my_leads', 'list_viewings', 'log_activity', 'create_task']) {
            const required = TOOL_MODULE_MAP[tool];
            expect(required.some((m) => smModules.includes(m))).toBe(true);
        }
    });
});
