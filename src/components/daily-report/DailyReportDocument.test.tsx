import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { buildDailyReport, readDailyReportConfig, type BuildDailyReportInput } from '@/lib/dashboard/daily-report';
import { cellAuthorTitle, changeTime, DailyReportDocument, type DailyMeetingActions } from './DailyReportDocument';

const CHAN = 'Чанцалдулам.Раднаа';
const KHON = 'Хонгорзул.Мөнхгэрэл';
const config = { ...readDailyReportConfig(null).config, managers: [{ name: CHAN, short: 'Чан' }, { name: KHON, short: 'Хон' }] };
const input = (patch: Partial<BuildDailyReportInput> = {}): BuildDailyReportInput => ({
    date: '2026-10-19', title: 'Элизиум баг', config,
    roster: [{ name: CHAN, is_active: true, user_id: 'chan-account' }, { name: KHON, is_active: true, user_id: 'khon-account' }],
    counts: [
        // Чанцалдуламын тоог Хонгорзул оруулсан; Хонгорзул өөрийнхөө тоог.
        { manager_name: CHAN, metric: 'call.l1.total', value: 4, updated_by: 'khon-account', updated_by_name: 'М. Хонгорзул', updated_at: '2026-10-19T02:15:00.000Z' },
        { manager_name: KHON, metric: 'call.l1.total', value: 2, updated_by: 'khon-account', updated_by_name: 'М. Хонгорзул', updated_at: '2026-10-19T02:16:00.000Z' },
    ],
    meetings: [{ id: 'm1', manager: CHAN, type: 'new_customer', customer: 'Бат', property: null, notes: null, feedback: null, scheduled_at: '2026-10-19T02:00:00.000Z' }],
    pendingMeetings: [
        { id: 'p1', manager: KHON, type: 'new_customer', customer: 'Болд', scheduled_at: '2026-10-19T03:00:00.000Z' },
        { id: 'p2', manager: CHAN, type: 'repeat_customer', customer: 'Дорж', scheduled_at: '2026-10-19T11:00:00.000Z' },
    ],
    leads: [], notes: {}, completed: null, only: null, ...patch,
});
const actions = (patch: Partial<DailyMeetingActions> = {}): DailyMeetingActions => ({
    onAdd: vi.fn(), onComplete: vi.fn(), reassign: null, busy: null, isUpcoming: meeting => meeting.id === 'p2', completeUnassigned: false, ...patch,
});

afterEach(cleanup);

describe('DailyReportDocument', () => {
    it('marks counts entered by someone else on screen only, with who and when', () => {
        const { container } = render(<DailyReportDocument report={buildDailyReport(input())} />);
        const marked = container.querySelectorAll('td[data-author="other"]');
        expect(marked).toHaveLength(1);
        expect(marked[0].getAttribute('title')).toBe('Оруулсан: М. Хонгорзул · 10:15');
        const legend = screen.getByText('— өөр хүн оруулсан тоо (дээр нь очиж хэн оруулсныг харна)');
        expect(legend.className).toContain('print:hidden');
        expect(marked[0].querySelector('[aria-hidden]')?.getAttribute('class')).toContain('print:hidden');
    });

    it('keeps the image version free of author markers and meeting actions', () => {
        const onAdd = vi.fn();
        const { container } = render(<DailyReportDocument report={buildDailyReport(input())} forImage meetings={actions({ onAdd })} />);
        expect(container.querySelectorAll('td[data-author]')).toHaveLength(0);
        expect(container.querySelectorAll('td[title]')).toHaveLength(0);
        expect(screen.queryByText(/өөр хүн оруулсан тоо/)).toBeNull();
        expect(screen.queryByRole('button', { name: 'Уулзалт нэмэх' })).toBeNull();
        expect(screen.queryByRole('group', { name: 'Товлосон, үр дүн бүртгээгүй' })).toBeNull();
    });

    it('always shows «Нэмэлт тэмдэглэл», with «—» on a day without a note (screen and image)', () => {
        for (const forImage of [false, true]) {
            render(<DailyReportDocument report={buildDailyReport(input())} forImage={forImage} />);
            const notes = screen.getByRole('region', { name: 'Нэмэлт тэмдэглэл' });
            expect(within(notes).getByRole('heading', { name: 'Нэмэлт тэмдэглэл' })).toBeTruthy();
            expect(within(notes).getByText('—')).toBeTruthy();
            cleanup();
        }
        render(<DailyReportDocument report={buildDailyReport(input({ notes: { general: 'B2 блокын загварыг тохиролцлоо.' } }))} forImage />);
        const notes = screen.getByRole('region', { name: 'Нэмэлт тэмдэглэл' });
        expect(within(notes).getByText('B2 блокын загварыг тохиролцлоо.')).toBeTruthy();
        expect(within(notes).queryByText('—')).toBeNull();
    });

    it('keeps the image header on one line per item so wrapped text cannot overlap', () => {
        const { container, unmount } = render(<DailyReportDocument report={buildDailyReport(input())} forImage />);
        expect(container.querySelector('header')!.className).toContain('whitespace-nowrap');
        unmount();
        const screenVersion = render(<DailyReportDocument report={buildDailyReport(input())} />);
        expect(screenVersion.container.querySelector('header')!.className).not.toContain('whitespace-nowrap');
    });

    it('shows no legend when every count was entered by the manager’s own account', () => {
        const report = buildDailyReport(input({ counts: [{ manager_name: KHON, metric: 'call.l1.total', value: 2, updated_by: 'khon-account', updated_by_name: 'М. Хонгорзул' }] }));
        render(<DailyReportDocument report={report} />);
        expect(screen.queryByText(/өөр хүн оруулсан тоо/)).toBeNull();
    });

    it('labels inputs with the manager’s formal name and highlights the own row while editing', () => {
        const onCell = vi.fn();
        render(<DailyReportDocument report={buildDailyReport(input())} editing={{
            editable: new Set([CHAN, KHON]), own: KHON, draft: {}, onCell, notes: null, onNotes: vi.fn(),
        }} />);
        const chan = screen.getByRole('spinbutton', { name: 'Төслийн утас · Нийт · Р. Чанцалдулам' }) as HTMLInputElement;
        expect(chan.value).toBe('4');
        fireEvent.change(chan, { target: { value: '6' } });
        expect(onCell).toHaveBeenCalledWith(CHAN, 'call.l1.total', '6');
        expect(screen.getByRole('spinbutton', { name: 'Чат · Хувь чат · М. Хонгорзул' })).toBeTruthy();
        const table = screen.getByRole('region', { name: 'Менежерийн үзүүлэлт' });
        expect(within(table).getByRole('rowheader', { name: 'М. Хонгорзул' }).getAttribute('title')).toBe('М. Хонгорзул — таны мөр');
        expect(within(table).getByRole('rowheader', { name: 'Р. Чанцалдулам' }).getAttribute('title')).toBeNull();
        // Уулзалт системээс — засагдахгүй.
        expect(within(table).getAllByRole('spinbutton')).toHaveLength(8);
    });

    it('lays the report out as one table: managers in rows, lines/chat/meetings in columns, a total row below and no written summary', () => {
        const team = {
            ...config,
            lines: [{ key: 'l1', label: '7786', categories: [] }, { key: 'l2', label: '8888/9008', categories: ['new' as const, 'repeat' as const] }],
            chats: [{ key: 'chat', label: 'Менежерийн чат' }],
        };
        const report = buildDailyReport(input({
            config: team,
            counts: [
                { manager_name: CHAN, metric: 'call.l1.total', value: 4 },
                { manager_name: KHON, metric: 'call.l1.total', value: 0 },
                { manager_name: CHAN, metric: 'call.l2.new', value: 3 },
                { manager_name: KHON, metric: 'chat.chat', value: 5 },
            ],
            meetings: [
                { id: 'm1', manager: CHAN, type: 'new_customer', customer: 'Бат', property: null, notes: null, feedback: null, scheduled_at: '2026-10-19T02:00:00.000Z' },
                { id: 'm2', manager: CHAN, type: 'existing_buyer', customer: 'Сараа', property: null, notes: null, feedback: null, scheduled_at: '2026-10-19T04:00:00.000Z' },
                { id: 'm3', manager: KHON, type: 'new_customer', customer: 'Дулмаа', property: null, notes: null, feedback: null, scheduled_at: '2026-10-19T05:00:00.000Z' },
            ],
        }));
        const { container } = render(<DailyReportDocument report={report} />);
        const table = within(screen.getByRole('region', { name: 'Менежерийн үзүүлэлт' }));
        const [top, sub] = container.querySelectorAll('thead tr');
        expect([...top.children].map(cell => cell.textContent)).toEqual(['Дугаар', 'Менежер', '7786', '8888/9008', 'Чат', 'Шинэ уулзалт', 'Давтан', 'Захиалагч', 'Нийт уулзалт']);
        expect(top.children[3].getAttribute('colspan')).toBe('2');
        expect(top.children[4].getAttribute('title')).toBe('Менежерийн чат');
        expect([...sub.children].map(cell => cell.textContent)).toEqual(['Шинэ', 'Захиалагч, давтан']);
        const cells = (name: string) => [...table.getByRole('rowheader', { name }).closest('tr')!.children].map(cell => cell.textContent);
        expect(cells('Р. Чанцалдулам')).toEqual(['1', 'Р. Чанцалдулам', '4', '3', '', '', '1', '', '1', '2']);
        expect(cells('М. Хонгорзул')).toEqual(['2', 'М. Хонгорзул', '0', '', '', '5', '1', '', '', '1']);
        // Нийт: оруулсан тооны нийлбэр; хэн ч оруулаагүй багана хоосон (0 биш), уулзалт системээс тул тоо.
        expect(cells('Нийт')).toEqual(['Нийт', '4', '3', '', '5', '2', '0', '1', '3']);
        expect(screen.queryByRole('region', { name: 'Товч дүгнэлт' })).toBeNull();
        expect(screen.queryByText(/дуудлага ирсэн/)).toBeNull();
        expect(screen.queryByRole('textbox', { name: /тайлбар/ })).toBeNull();
    });

    it('keeps the total row in step with the numbers being entered', () => {
        render(<DailyReportDocument report={buildDailyReport(input())} editing={{
            editable: new Set([CHAN, KHON]), own: null, draft: { [`${CHAN}\u0000call.l1.total`]: '7', [`${KHON}\u0000chat.page`]: '2' }, onCell: vi.fn(), notes: null, onNotes: vi.fn(),
        }} />);
        const total = [...within(screen.getByRole('region', { name: 'Менежерийн үзүүлэлт' })).getByRole('rowheader', { name: 'Нийт' }).closest('tr')!.children].map(cell => cell.textContent);
        // Төслийн утас 7 + 2, Менежерийн дуудлага хоосон, Пэйж FB 2, Хувь чат хоосон, уулзалт 1 шинэ.
        expect(total).toEqual(['Нийт', '9', '', '2', '', '1', '0', '0', '1']);
    });

    it('adds an unassigned row only when a held meeting has no manager', () => {
        const meetings = [{ id: 'm9', manager: null, type: 'repeat_customer', customer: 'Нэргүй', property: null, notes: null, feedback: null, scheduled_at: '2026-10-19T02:00:00.000Z' }];
        render(<DailyReportDocument report={buildDailyReport(input({ meetings }))} />);
        const row = within(screen.getByRole('region', { name: 'Менежерийн үзүүлэлт' })).getByRole('rowheader', { name: 'Оноогдоогүй' }).closest('tr')!;
        expect([...row.children].map(cell => cell.textContent)).toEqual(['', 'Оноогдоогүй', '', '', '', '', '', '1', '', '1']);
        cleanup();
        render(<DailyReportDocument report={buildDailyReport(input({ leads: [{ manager: null, source: 'website' }] }))} />);
        expect(within(screen.getByRole('region', { name: 'Менежерийн үзүүлэлт' })).queryByRole('rowheader', { name: 'Оноогдоогүй' })).toBeNull();
    });

    it('lists scheduled meetings with «Болсон» / «Ирээгүй» and keeps upcoming ones locked', () => {
        const onComplete = vi.fn();
        const onAdd = vi.fn();
        const report = buildDailyReport(input());
        render(<DailyReportDocument report={report} meetings={actions({ onAdd, onComplete })} />);
        fireEvent.click(screen.getByRole('button', { name: 'Уулзалт нэмэх' }));
        expect(onAdd).toHaveBeenCalled();
        const pending = screen.getByRole('group', { name: 'Товлосон, үр дүн бүртгээгүй' });
        expect(pending.className).toContain('print:hidden');
        fireEvent.click(within(pending).getByRole('button', { name: 'Болсон: Болд (11:00)' }));
        expect(onComplete).toHaveBeenCalledWith(report.meetings.pendingItems[0], 'completed');
        fireEvent.click(within(pending).getByRole('button', { name: 'Ирээгүй: Болд (11:00)' }));
        expect(onComplete).toHaveBeenLastCalledWith(report.meetings.pendingItems[0], 'no_show');
        expect((within(pending).getByRole('button', { name: 'Болсон: Дорж (19:00)' }) as HTMLButtonElement).disabled).toBe(true);
        expect(screen.queryByRole('combobox', { name: /Менежер солих/ })).toBeNull();
    });

    it('shows the pending list without buttons to viewers who cannot record meetings, and the reassign control only to admins', () => {
        const report = buildDailyReport(input());
        const { rerender } = render(<DailyReportDocument report={report} meetings={actions({ onAdd: null, onComplete: null })} />);
        expect(screen.queryByRole('button', { name: 'Уулзалт нэмэх' })).toBeNull();
        const pending = screen.getByRole('group', { name: 'Товлосон, үр дүн бүртгээгүй' });
        expect(within(pending).getByText('Болд')).toBeTruthy();
        expect(within(pending).queryByRole('button')).toBeNull();
        rerender(<DailyReportDocument report={report} meetings={actions({ reassign: { managers: report.managers, onChange: vi.fn() } })} />);
        expect(screen.getByRole('combobox', { name: 'Менежер солих — Бат' })).toBeTruthy();
    });

    it('locks claim-pool meetings for managers but not for organisation users', () => {
        const report = buildDailyReport(input({ pendingMeetings: [
            { id: 'p1', manager: null, type: 'new_customer', customer: 'Болд', scheduled_at: '2026-10-19T03:00:00.000Z', assigned: false },
        ] }));
        const { rerender } = render(<DailyReportDocument report={report} meetings={actions()} />);
        const button = () => screen.getByRole('button', { name: 'Болсон: Болд (11:00)' }) as HTMLButtonElement;
        expect(button().disabled).toBe(true);
        expect(button().parentElement?.getAttribute('title')).toContain('Хариуцагчгүй');
        rerender(<DailyReportDocument report={report} meetings={actions({ completeUnassigned: true })} />);
        expect(button().disabled).toBe(false);
    });

    it('shows the day’s new leads by source and manager, read-only', () => {
        const report = buildDailyReport(input({ leads: [
            { manager: CHAN, source: 'facebook_ads' }, { manager: KHON, source: 'facebook_ads' }, { manager: null, source: 'website' },
        ] }));
        render(<DailyReportDocument report={report} editing={{ editable: new Set([CHAN, KHON]), own: null, draft: {}, onCell: vi.fn(), notes: null, onNotes: vi.fn() }} />);
        const region = screen.getByRole('region', { name: 'Шинэ лид' });
        expect(within(region).queryByRole('spinbutton')).toBeNull();
        expect(within(region).getByRole('columnheader', { name: '—' }).getAttribute('title')).toBe('Оноогдоогүй');
        const facebook = within(region).getByRole('rowheader', { name: 'Facebook Ads' }).closest('tr')!;
        expect([...facebook.querySelectorAll('td')].map(cell => cell.textContent)).toEqual(['1', '1', '', '2']);
        expect(within(region).getByRole('rowheader', { name: 'Вэбсайт' })).toBeTruthy();
        // Хариуцагчгүй лид менежерийн хүснэгтэд «Оноогдоогүй» мөр нэмэхгүй (дуудлага, чат түүнд оногдохгүй).
        expect(within(screen.getByRole('region', { name: 'Менежерийн үзүүлэлт' })).queryByRole('rowheader', { name: 'Оноогдоогүй' })).toBeNull();
    });

    it('shows no new-lead table while the section is switched off', () => {
        render(<DailyReportDocument report={buildDailyReport(input({ leads: null }))} />);
        expect(screen.queryByRole('region', { name: 'Шинэ лид' })).toBeNull();
        expect(screen.queryByRole('region', { name: 'Нэмэлт үзүүлэлт' })).toBeNull();
    });

    it('compares phone leads with the calls entered on screen only, and updates while counts are being entered', () => {
        const leads = [...Array.from({ length: 5 }, () => ({ manager: CHAN, source: 'phone' })), { manager: KHON, source: 'phone' }];
        const report = buildDailyReport(input({ leads }));
        // Эзэмшигч түр унтраасан (PHONE_LEAD_CHECK_ENABLED = false): анхдагчаар харагдахгүй.
        const { container, rerender } = render(<DailyReportDocument report={report} />);
        expect(screen.queryByRole('region', { name: 'Дуудлага ба утасны лид' })).toBeNull();
        rerender(<DailyReportDocument report={report} phoneCheck />);
        const region = screen.getByRole('region', { name: 'Дуудлага ба утасны лид' });
        expect(region.closest('.rounded-2xl')?.className).toContain('print:hidden');
        // Чан: 4 дуудлага < 5 утасны лид; Хон: 2 ≥ 1.
        const flagged = container.querySelectorAll('td[data-flag="short"]');
        expect(flagged).toHaveLength(1);
        expect(flagged[0].getAttribute('title')).toBe('Утсаар 5 лид бүртгэсэн ч бүх шугамд 4 дуудлага оруулсан');
        expect(within(region).queryByRole('rowheader', { name: 'Нийт' })).toBeNull();
        expect(report.lines[0].total).toBe(6);

        rerender(<DailyReportDocument report={report} phoneCheck editing={{
            editable: new Set([CHAN, KHON]), own: null, draft: { [`${CHAN}\u0000call.l1.total`]: '5' }, onCell: vi.fn(), notes: null, onNotes: vi.fn(),
        }} />);
        expect(container.querySelectorAll('td[data-flag="short"]')).toHaveLength(0);

        rerender(<DailyReportDocument report={report} phoneCheck forImage />);
        expect(screen.queryByRole('region', { name: 'Дуудлага ба утасны лид' })).toBeNull();
        rerender(<DailyReportDocument report={buildDailyReport(input({ leads: [{ manager: CHAN, source: 'facebook' }] }))} phoneCheck />);
        expect(screen.queryByRole('region', { name: 'Дуудлага ба утасны лид' })).toBeNull();
    });

    it('dates an author or history time that falls on another day than the report', () => {
        expect(cellAuthorTitle({ by: 'Б. Ариунаа', at: '2026-10-19T02:42:00.000Z', other: true }, '2026-10-19')).toBe('Оруулсан: Б. Ариунаа · 10:42');
        expect(changeTime('2026-10-20T01:05:00.000Z', '2026-10-19')).toBe('10.20 09:05');
    });

    it('keeps an unreadable number entry instead of clearing the cell', () => {
        const onCell = vi.fn();
        render(<DailyReportDocument report={buildDailyReport(input())} editing={{
            editable: new Set([CHAN]), own: null, draft: {}, onCell, notes: null, onNotes: vi.fn(),
        }} />);
        const chan = screen.getByRole('spinbutton', { name: 'Төслийн утас · Нийт · Р. Чанцалдулам' }) as HTMLInputElement;
        Object.defineProperty(chan, 'validity', { value: { badInput: true }, configurable: true });
        fireEvent.change(chan, { target: { value: '' } });
        expect(onCell).toHaveBeenCalledWith(CHAN, 'call.l1.total', '?');
    });
});
