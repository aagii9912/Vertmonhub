import { describe, expect, it } from 'vitest';
import {
    WorkPlanCreateSchema, WorkPlanMonthSchema, WorkPlanPatchSchema, assigneeInitials, assigneeInitialsText, workPlanInputError, workPlanMonth, workPlanMonthLabel, workPlanProgress,
} from '@/lib/sales/work-plan';

const id = (n: number) => `00000000-0000-4000-8000-00000000000${n}`;

describe('сарын ажлын төлөвлөгөө — дүрэм', () => {
    it('shortens each assignee to the shortest prefix of the given name that is unique in the roster', () => {
        const roster = ['Чанцалдулам.Раднаа', 'Хонгорзул.Мөнхсайхан', 'Ариунбилэг.Бат'];
        expect(assigneeInitials(['Чанцалдулам.Раднаа', 'Ариунбилэг.Бат'], roster)).toEqual(['Ч', 'А']);
        // Ижил үсгээр эхэлсэн хоёр нэр ялгарах хүртэл уртасна — жагсаалтад байгаа бол оноогоогүй ч гэсэн.
        const twoKh = [...roster, 'Хулан.Дорж'];
        expect(assigneeInitials(['Хонгорзул.Мөнхсайхан'], twoKh)).toEqual(['Хо']);
        expect(assigneeInitials(['Хулан.Дорж', 'Хонгорзул.Мөнхсайхан'], twoKh)).toEqual(['Ху', 'Хо']);
        // Том/жижиг үсэг ялгахгүй харьцуулна; өөрийн нэр нь өөр нэрийн эхлэл бол бүтэн нэрээрээ.
        expect(assigneeInitials(['Бат.А'], ['Бат.А', 'батаа.Б'])).toEqual(['Бат']);
        // Овоггүй (цэггүй) нэр ч ажиллана; жагсаалтад байхгүй нэр өөрийгөө л харьцуулна.
        expect(assigneeInitials(['Номин'], [])).toEqual(['Н']);
        expect(assigneeInitialsText([], [])).toBeNull();
        expect(assigneeInitialsText([{ id: id(1), name: 'Чанцалдулам.Раднаа' }, { id: id(2), name: 'Хонгорзул.Мөнхсайхан' }], roster.map((name, index) => ({ id: id(index + 1), name }))))
            .toBe('Ч, Х');
    });

    it('reads the month from the report day and counts progress', () => {
        expect(workPlanMonth('2026-11-17')).toBe('2026-11');
        expect(workPlanMonthLabel('2026-11')).toBe('11-р сар');
        expect(workPlanMonthLabel('2026-03')).toBe('3-р сар');
        expect(workPlanProgress([{ done: true }, { done: false }, { done: true }])).toEqual({ done: 2, total: 3 });
        expect(WorkPlanMonthSchema.safeParse('2026-13').success).toBe(false);
        expect(WorkPlanMonthSchema.safeParse('2026-11-01').success).toBe(false);
    });

    it('validates new items: trimmed title, a real month, unique roster ids, no extra fields', () => {
        expect(WorkPlanCreateSchema.parse({ month: '2026-11', title: '  Showroom   тохижуулах ', assigneeIds: [id(1), id(1), id(2)] }))
            .toEqual({ month: '2026-11', title: 'Showroom тохижуулах', assigneeIds: [id(1), id(2)] });
        expect(WorkPlanCreateSchema.parse({ month: '2026-11', title: 'Борлуулалтын оффис' }).assigneeIds).toEqual([]);
        const blank = WorkPlanCreateSchema.safeParse({ month: '2026-11', title: '   ' });
        expect(blank.success).toBe(false);
        if (!blank.success) expect(workPlanInputError(blank.error)).toBe('Ажлын нэрийг оруулна уу');
        expect(WorkPlanCreateSchema.safeParse({ month: '2026-11', title: 'а'.repeat(201) }).success).toBe(false);
        expect(WorkPlanCreateSchema.safeParse({ month: '2026-11', title: 'Ажил', assigneeIds: ['Чанцалдулам'] }).success).toBe(false);
        const extra = WorkPlanCreateSchema.safeParse({ month: '2026-11', title: 'Ажил', shop_id: 'x' });
        expect(extra.success).toBe(false);
        if (!extra.success) expect(workPlanInputError(extra.error)).toBe('Зөвшөөрөгдөөгүй талбар: shop_id');
    });

    it('patches only what is given and refuses an empty patch', () => {
        expect(WorkPlanPatchSchema.parse({ done: true })).toEqual({ done: true });
        expect(WorkPlanPatchSchema.parse({ assigneeIds: [] })).toEqual({ assigneeIds: [] });
        expect(WorkPlanPatchSchema.safeParse({}).success).toBe(false);
        expect(WorkPlanPatchSchema.safeParse({ done: 'yes' }).success).toBe(false);
        expect(WorkPlanPatchSchema.safeParse({ done: true, deleted_at: 'now' }).success).toBe(false);
    });
});
