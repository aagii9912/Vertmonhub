import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { MUTATING_TOOL_NAMES } from '../tools';

/**
 * 2026-09 review H1: 6 write tool `confirm`-гүй шууд mutate хийж, audit-д бүртгэгддэггүй байв.
 * Энэ тест executeDataTool-ийн switch дахь mutating tool БҮРИЙН дуудлага `confirm` параметрийг
 * дамжуулж байгааг статикаар баталгаажуулна (шинэ mutating tool нэмэхэд мартахаас сэргийлнэ).
 */
describe('executeDataTool confirm gating', () => {
    const src = readFileSync(path.join(process.cwd(), 'src/lib/ai/data-assistant/index.ts'), 'utf8');

    it.each(MUTATING_TOOL_NAMES)('%s is called with confirm', (tool) => {
        const line = src.split('\n').find((l) => l.includes(`case '${tool}':`));
        expect(line, `case '${tool}' олдсонгүй`).toBeTruthy();
        expect(line, `${tool} дуудлага confirm параметргүй`).toMatch(/confirm/);
    });

    it('audit is written only on real execution (confirm=true)', () => {
        expect(src).toMatch(/\(isWrite \|\| isDelete \|\| isAdmin\) && confirm/);
    });
});
