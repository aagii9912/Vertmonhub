import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { MUTATING_TOOL_NAMES, TOOL_CATALOG, type ToolName } from '@/lib/ai/tool-catalog';

/**
 * 2026-09 review H1: 6 write tool `confirm`-гүй шууд mutate хийж, audit-д бүртгэгддэггүй байв.
 * Энэ тест executeDataTool-ийн HANDLERS дахь mutating tool БҮР `confirm`-ийг дамжуулж
 * байгааг статикаар шалгана. AUTO tool-уудыг executor-ийн нэгдсэн хаалт preview болгоно.
 */
describe('executeDataTool confirm gating', () => {
    const src = readFileSync(path.join(process.cwd(), 'src/lib/ai/data-assistant/index.ts'), 'utf8');

    it.each([...MUTATING_TOOL_NAMES])('%s is called with confirm unless the AUTO gate covers it', (tool) => {
        const line = src.split('\n').find((l) => l.trimStart().startsWith(`${tool}: `));
        expect(line, `${tool} handler олдсонгүй`).toBeTruthy();
        if (!TOOL_CATALOG[tool as ToolName].auto) expect(line, `${tool} дуудлага confirm параметргүй`).toMatch(/\bconfirm\b/);
    });

    it('previews AUTO tools without confirm and audits only real execution', () => {
        expect(src).toMatch(/if \(meta\.auto && !confirm\)/);
        expect(src).toMatch(/meta\.kind !== 'read' && confirm/);
    });
});
