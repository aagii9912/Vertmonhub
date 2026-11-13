/**
 * Сарын «бусад ажлын төлөвлөгөө» — хариуцагчтай, чеклэдэг жагсаалт (борлуулалтын багийн хүсэлт 2026-11-12).
 * Client-safe, pure: төрөл, оролтын шалгалт, хариуцагчийн нэрийн товчлол. DB-ийн уншилт, бичилт `work-plan-store.ts`-д.
 *
 * • Төсөл (= shop) × сар бүр өөрийн жагсаалттай (`sales_work_plan_items`); Лхагвын хурлын хуудсанд баг бүхэлдээ харж,
 *   `dashboard` модулийн бичих эрхтэй хүн нэмж, хариуцагч оноож, хийгдсэнийг чеклэнэ.
 * • Хариуцагч = борлуулалтын менежерийн жагсаалтын мөр (`sales_managers.id`) — нэр түлхүүр биш, нэр солигдоход хэвээр.
 * • Илтгэлд хариуцагчийн нэрийн эхний үсэг гарна (`assigneeInitials`): жагсаалтад давхцахгүй хамгийн богино эхлэл.
 */
import { z } from 'zod';

export const WORK_PLAN_TITLE_MAX = 200;
export const WORK_PLAN_ASSIGNEE_MAX = 20;
/** Нэг сард идэвхтэй (устгаагүй) ажлын дээд тоо. */
export const WORK_PLAN_MONTH_LIMIT = 60;

export interface WorkPlanAssignee { id: string; name: string }
export interface WorkPlanItem {
    id: string;
    month: string;
    title: string;
    assignees: WorkPlanAssignee[];
    done: boolean;
    done_at: string | null;
    done_by_name: string | null;
    created_by: string | null;
    created_by_name: string | null;
    sort_order: number;
}
export interface WorkPlanData {
    month: string;
    items: WorkPlanItem[];
    /** Оноож болох менежерүүд (энэ төслийн идэвхтэй жагсаалт), нэрээр эрэмбэлсэн. */
    roster: WorkPlanAssignee[];
    /** Хүснэгт DB-д бий эсэх (migration 20261113150000). */
    available: boolean;
}

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
export const WorkPlanMonthSchema = z.string({ error: 'Сарыг сонгоно уу' }).regex(MONTH_PATTERN, 'Сарын огноо буруу байна');

const TitleSchema = z.string({ error: 'Ажлын нэрийг оруулна уу' })
    .transform(value => value.trim().replace(/\s+/g, ' '))
    .pipe(z.string().min(1, 'Ажлын нэрийг оруулна уу').max(WORK_PLAN_TITLE_MAX, `Ажлын нэр ${WORK_PLAN_TITLE_MAX} тэмдэгтээс ихгүй байна`));
const AssigneesSchema = z.array(z.guid({ error: 'Хариуцагч буруу байна' }), { error: 'Хариуцагчийн жагсаалт буруу байна' })
    .max(WORK_PLAN_ASSIGNEE_MAX, `Нэг ажилд ${WORK_PLAN_ASSIGNEE_MAX}-оос олон хариуцагч оноохгүй`)
    .transform(ids => [...new Set(ids)]);

export const WorkPlanCreateSchema = z.object({
    month: WorkPlanMonthSchema,
    title: TitleSchema,
    assigneeIds: AssigneesSchema.default([]),
}).strict();
export type WorkPlanCreateInput = z.infer<typeof WorkPlanCreateSchema>;

/** Засвар: гарчиг, хариуцагчид, хийгдсэн эсэх — өгсөн талбар л өөрчлөгдөнө. */
export const WorkPlanPatchSchema = z.object({
    title: TitleSchema.optional(),
    assigneeIds: AssigneesSchema.optional(),
    done: z.boolean({ error: 'Хийгдсэн эсэхийг зөв заана уу' }).optional(),
}).strict().refine(value => value.title !== undefined || value.assigneeIds !== undefined || value.done !== undefined, 'Өөрчлөх талбар алга');
export type WorkPlanPatchInput = z.infer<typeof WorkPlanPatchSchema>;

/** Zod-ийн алдааг хэрэглэгчид харуулах монгол мессеж болгоно. */
export function workPlanInputError(error: z.ZodError): string {
    const issue = error.issues[0];
    if (!issue) return 'Ажлын төлөвлөгөөний мэдээлэл буруу байна';
    if (issue.code === 'unrecognized_keys') return `Зөвшөөрөгдөөгүй талбар: ${issue.keys.join(', ')}`;
    return /[А-Яа-яЁёӨөҮү]/.test(issue.message) ? issue.message : 'Ажлын төлөвлөгөөний мэдээлэл буруу байна';
}

/** 'YYYY-MM-DD' (тайлант өдөр) → 'YYYY-MM'. */
export const workPlanMonth = (date: string) => date.slice(0, 7);
/** «11-р сар». */
export const workPlanMonthLabel = (month: string) => `${Number(month.slice(5, 7))}-р сар`;

/** Жагсаалтын нэрийн өөрийн нэр («Чанцалдулам.Раднаа» → «Чанцалдулам»). */
const givenName = (name: string) => name.split('.')[0]?.trim() || name.trim();

/**
 * Нэр бүрийн товчлол: өөрийн нэрийн эхлэл, `roster` дотор (том/жижиг үсэг ялгахгүй) давхцахгүй хамгийн богино нь —
 * «Чанцалдулам» → «Ч», «Хонгорзул» ба «Хулан» → «Хо», «Ху». Яг ижил өөрийн нэртэй хоёр хүн бүтэн нэрээрээ.
 * `roster`-т байхгүй нэр өөрийгөө л харьцуулна.
 */
export function assigneeInitials(names: readonly string[], roster: readonly string[]): string[] {
    const all = [...new Set([...roster, ...names].map(givenName))];
    return names.map(name => {
        const given = givenName(name);
        const others = all.filter(other => other !== given).map(other => other.toLowerCase());
        for (let length = 1; length <= given.length; length++) {
            const prefix = given.slice(0, length);
            if (!others.some(other => other.startsWith(prefix.toLowerCase()))) return prefix;
        }
        return given;
    });
}

/** Хариуцагчдын товчлолын мөр («Ч, Хо»); хариуцагчгүй бол null. */
export function assigneeInitialsText(assignees: readonly WorkPlanAssignee[], roster: readonly WorkPlanAssignee[]): string | null {
    if (!assignees.length) return null;
    return assigneeInitials(assignees.map(item => item.name), roster.map(item => item.name)).join(', ');
}

/** Хийгдсэн / нийт. */
export function workPlanProgress(items: readonly Pick<WorkPlanItem, 'done'>[]): { done: number; total: number } {
    return { done: items.filter(item => item.done).length, total: items.length };
}
