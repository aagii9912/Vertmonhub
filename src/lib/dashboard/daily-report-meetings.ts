/**
 * «Өдрийн тайлан»-гийн уулзалт (эзэмшигч 2026-10-19): ээлжийн менежер хамт олныхоо БОЛСОН уулзалтыг
 * тухайн менежерийн нэр дээр бүртгэж, тэр өдрийн товлосон уулзалтыг «Болсон» / «Ирээгүй» гэж
 * тэмдэглэнэ; админ уулзалтын менежерийг засна. Уулзалт нь `property_viewings` хэвээр (KPI-ийн дүрэм
 * өөрчлөгдөхгүй). Client-safe, pure: сервер `lib/services/DailyMeetingService.ts`.
 */
import { z } from 'zod';
import { DailyReportDateSchema } from '@/lib/dashboard/daily-report';
import { ubDateStr, ubLocalToIso } from '@/lib/utils/date';
import { normalizePhone } from '@/lib/utils/phone';

/** Бүртгэлтэй менежер өнөөдрөөс хойш хэдэн өдрийн өмнөх уулзалтыг бүртгэж/тэмдэглэж болох. */
export const DAILY_MEETING_BACKDATE_DAYS = 7;
/** Цаг заагаагүй өнгөрсөн өдрийн уулзалтын анхдагч цаг (УБ). */
export const DAILY_MEETING_DEFAULT_TIME = '12:00';

const ManagerSchema = z.string().trim().min(1, 'Менежерээ сонгоно уу').max(120);
const TextSchema = z.string().trim().max(4000).nullish().transform(value => value || null);
const InterestSchema = z.number().int().min(1).max(5).nullish().transform(value => value ?? null);

/** Нормчилсон дугаар (зөвхөн цифр, 8–15 орон) эсвэл null. */
export function dailyMeetingPhone(raw: string | null | undefined): string | null {
    const digits = normalizePhone(raw);
    return digits && /^\d{8,15}$/.test(digits) ? digits : null;
}

export const DailyMeetingRecordSchema = z.object({
    action: z.literal('record'),
    date: DailyReportDateSchema,
    /** Уулзалтыг хэний нэр дээр бүртгэх — төслийн идэвхтэй менежерийн бүртгэлийн нэр. */
    manager: ManagerSchema,
    meeting_type: z.enum(['new_customer', 'repeat_customer', 'existing_buyer']).default('new_customer'),
    /** УБ-ийн цаг «HH:mm»; заагаагүй бол өнөөдөр = одоо, өнгөрсөн өдөр = 12:00. */
    time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Цаг буруу байна').nullish(),
    customer_phone: z.string().trim().max(30).refine(value => !!dailyMeetingPhone(value), 'Утасны дугаараа бүтнээр оруулна уу'),
    customer_name: z.string().trim().max(200).nullish(),
    /** Шинэ харилцагч нэрээ хэлээгүй («Нэр тодорхойгүй»). */
    anonymous: z.boolean().default(false),
    notes: TextSchema,
    feedback: TextSchema,
    interest_level: InterestSchema,
}).strict();

export const DailyMeetingCompleteSchema = z.object({
    action: z.literal('complete'),
    date: DailyReportDateSchema,
    viewing_id: z.guid(),
    status: z.enum(['completed', 'no_show']),
    feedback: TextSchema,
    interest_level: InterestSchema,
}).strict();

export const DailyMeetingReassignSchema = z.object({
    action: z.literal('reassign'),
    date: DailyReportDateSchema,
    viewing_id: z.guid(),
    manager: ManagerSchema,
}).strict();

export const DailyMeetingRequestSchema = z.discriminatedUnion('action', [
    DailyMeetingRecordSchema, DailyMeetingCompleteSchema, DailyMeetingReassignSchema,
], { error: 'Уулзалтын мэдээллийг шалгана уу' });

export type DailyMeetingRequest = z.output<typeof DailyMeetingRequestSchema>;
/** Хөтчөөс илгээх body. */
export type DailyMeetingRequestBody = z.input<typeof DailyMeetingRequestSchema>;
export type DailyMeetingRecordInput = z.output<typeof DailyMeetingRecordSchema>;
export type DailyMeetingCompleteInput = z.output<typeof DailyMeetingCompleteSchema>;
export type DailyMeetingReassignInput = z.output<typeof DailyMeetingReassignSchema>;

/** Zod-ийн алдааг хэрэглэгчид харуулах монгол мессеж болгоно. */
export function dailyMeetingInputError(error: z.ZodError): string {
    const issue = error.issues[0];
    return issue && /[А-Яа-яЁёӨөҮү]/.test(issue.message) ? issue.message : 'Уулзалтын мэдээллийг шалгана уу';
}

export interface DailyMeetingResponse {
    ok: true;
    viewing_id: string;
    /** record: холбосон эсвэл шинээр үүсгэсэн лид. */
    lead_id?: string | null;
    lead_created?: boolean;
    /** complete: шинэ төлөв. */
    status?: 'completed' | 'no_show';
    /** reassign: менежер өөрчлөгдсөн эсэх. */
    changed?: boolean;
}

/**
 * Бүртгэх уулзалтын цаг (ISO instant). Огноо + «HH:mm»-ийг Улаанбаатарын цагаар уншина; цаг заагаагүй
 * бол өнөөдөр = `now`, өнгөрсөн өдөр = 12:00. Буруу утгад null.
 */
export function dailyMeetingScheduledAt(date: string, time: string | null | undefined, now: Date = new Date()): string | null {
    if (!time && date === ubDateStr(now)) return now.toISOString();
    return ubLocalToIso(`${date}T${time || DAILY_MEETING_DEFAULT_TIME}`);
}
