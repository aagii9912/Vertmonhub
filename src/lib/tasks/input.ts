import { z } from 'zod';

/**
 * Хувийн ажил (user_tasks) үүсгэх хүсэлт — `/api/dashboard/tasks` POST болон
 * «Ажил нэмэх» түргэн форм НЭГ дүрмээр шалгана (client талын алдаа = серверийн алдаа).
 */
export const TaskCreateSchema = z.object({
    title: z.string().trim().min(1, 'Гарчиг хоосон байна').max(300, 'Гарчиг 300 тэмдэгтээс хэтрэхгүй байна'),
    note: z.string().max(4000, 'Тэмдэглэл 4000 тэмдэгтээс хэтрэхгүй байна').optional().nullable(),
    dueAt: z.string().datetime({ offset: true }).optional().nullable(),
    remindAt: z.string().datetime({ offset: true }).optional().nullable(),
});

/** Сануулга — дуусах хугацаанаас хэдэн минутын өмнө («Миний ажлууд» ба түргэн форм). */
export const REMIND_OPTIONS = [
    { value: 'none', label: 'Сануулгагүй' },
    { value: '0', label: 'Яг цагт нь' },
    { value: '15', label: '15 минутын өмнө' },
    { value: '60', label: '1 цагийн өмнө' },
    { value: '1440', label: '1 өдрийн өмнө' },
] as const;
