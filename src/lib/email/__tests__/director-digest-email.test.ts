// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

// email.ts Resend client-ийг модуль ачаалах үед үүсгэдэг тул түлхүүрийг import-оос өмнө тавина.
const mocks = vi.hoisted(() => {
    vi.stubEnv('RESEND_API_KEY', 're_test_fixture');
    return { send: vi.fn() };
});
vi.mock('resend', () => ({ Resend: class { emails = { send: mocks.send }; } }));

import { sendDirectorDigestEmail, sendWeeklyReportEmail, type DirectorDigestData, type WeeklyReportData } from '../email';

const digest: DirectorDigestData = {
    shopName: 'Туршилт төсөл', date: '2026-10-19', newLeads: 1, newContracts: 2, activeContracts: 3,
    totalSales: 250, collected: null, overdueCount: 2, topManagers: [],
};
const html = () => mocks.send.mock.calls.at(-1)![0].html as string;
const tileValue = (label: string) => html().match(new RegExp(`>([^<]*)</div>\\s*<div[^>]*>${label}</div>`))?.[1];

afterAll(() => { vi.unstubAllEnvs(); });
beforeEach(() => {
    mocks.send.mockReset();
    mocks.send.mockResolvedValue({ data: { id: 'email-1' }, error: null });
});

describe('director digest email', () => {
    it('төлсөн дүн тодорхойгүй бол «Цуглуулсан» нь «—», хоцролтын дүнгүй бол tile гарахгүй', async () => {
        await expect(sendDirectorDigestEmail('director@example.test', digest)).resolves.toBe(true);
        expect(tileValue('Цуглуулсан')).toBe('—');
        expect(html()).not.toContain('Төлбөр хоцролт');
    });

    it('мэдэгдэж буй хэсэгчилсэн нийлбэрт «+», HUB-ийн хоцролтын дүнг огноотой нь харуулна', async () => {
        await sendDirectorDigestEmail('director@example.test', {
            ...digest, collected: 150, collectedPartial: true, overdueAmount: 20010000, overdueAsOf: '2026-10-18',
        });
        expect(tileValue('Цуглуулсан')).toBe('150₮+');
        expect(tileValue('Төлбөр хоцролт · 2026-10-18')).toBe('20,010,000₮');
    });

    it('бүх төлсөн дүн мэдэгдэж байвал «+»-гүй, 0 хоцролт 0₮', async () => {
        await sendDirectorDigestEmail('director@example.test', { ...digest, collected: 0, overdueAmount: 0, overdueAsOf: null });
        expect(tileValue('Цуглуулсан')).toBe('0₮');
        expect(tileValue('Төлбөр хоцролт')).toBe('0₮');
    });
});

describe('шинэ гэрээний тоо огноогүй гэрээтэй үед (contract-dates дүрэм)', () => {
    const weekly: WeeklyReportData = {
        shopName: 'Туршилт төсөл', weekStart: '2026-10-12', weekEnd: '2026-10-19', newLeads: 4, meetings: 2, wonLeads: 0,
        newContracts: 3, topSources: [],
    };

    it('огноогүй гэрээгүй бол тоо хэвээр, тайлбаргүй', async () => {
        await sendDirectorDigestEmail('director@example.test', digest);
        expect(tileValue('Шинэ гэрээ')).toBe('2');
        expect(html()).not.toContain('Огноогүй');
        await sendWeeklyReportEmail('director@example.test', weekly);
        expect(tileValue('Шинэ гэрээ')).toBe('3');
        expect(html()).not.toContain('Огноогүй');
    });

    it('огноогүй гэрээтэй бол «N+», нэг ч олдоогүй бол «—» (0 биш)', async () => {
        await sendDirectorDigestEmail('director@example.test', { ...digest, undatedContracts: 77 });
        expect(tileValue('Шинэ гэрээ')).toBe('2+');
        expect(html()).toContain('Огноогүй 77 гэрээ');
        await sendDirectorDigestEmail('director@example.test', { ...digest, newContracts: 0, undatedContracts: 77 });
        expect(tileValue('Шинэ гэрээ')).toBe('—');
        await sendWeeklyReportEmail('director@example.test', { ...weekly, newContracts: 0, undatedContracts: 5 });
        expect(tileValue('Шинэ гэрээ')).toBe('—');
        expect(html()).toContain('Огноогүй 5 гэрээ');
    });
});
