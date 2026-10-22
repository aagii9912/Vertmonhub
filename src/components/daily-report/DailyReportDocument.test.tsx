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

    it('shows no legend when every count was entered by the manager’s own account', () => {
        const report = buildDailyReport(input({ counts: [{ manager_name: KHON, metric: 'call.l1.total', value: 2, updated_by: 'khon-account', updated_by_name: 'М. Хонгорзул' }] }));
        render(<DailyReportDocument report={report} />);
        expect(screen.queryByText(/өөр хүн оруулсан тоо/)).toBeNull();
    });

    it('labels inputs with the manager’s formal name and highlights the own column while editing', () => {
        const onCell = vi.fn();
        render(<DailyReportDocument report={buildDailyReport(input())} editing={{
            editable: new Set([CHAN, KHON]), own: KHON, draft: {}, onCell, notes: null, onNotes: vi.fn(),
        }} />);
        const chan = screen.getByRole('spinbutton', { name: 'Төслийн утас · Нийт · Р. Чанцалдулам' }) as HTMLInputElement;
        expect(chan.value).toBe('4');
        fireEvent.change(chan, { target: { value: '6' } });
        expect(onCell).toHaveBeenCalledWith(CHAN, 'call.l1.total', '6');
        const region = screen.getByRole('region', { name: 'Төслийн утас' });
        expect(within(region).getByRole('columnheader', { name: 'Хон' }).getAttribute('title')).toBe('М. Хонгорзул — таны багана');
        expect(within(region).getByRole('columnheader', { name: 'Чан' }).getAttribute('title')).toBe('Р. Чанцалдулам');
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

    it('shows the day’s new leads by source and manager, read-only, in the summary as well', () => {
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
        // Хариуцагчгүй багана зөвхөн тоотой хүснэгтэд — дуудлагын хүснэгтэд хоосон «—» гаргахгүй.
        expect(within(screen.getByRole('region', { name: 'Төслийн утас' })).queryByRole('columnheader', { name: '—' })).toBeNull();
        const summary = screen.getByRole('region', { name: 'Товч дүгнэлт' });
        expect(within(summary).getByText('Шинэ лид').nextElementSibling?.textContent).toBe('Нийт 3 лид бүртгэгдсэн.');
    });

    it('compares phone leads with the calls entered on screen only, and updates while counts are being entered', () => {
        const leads = [...Array.from({ length: 5 }, () => ({ manager: CHAN, source: 'phone' })), { manager: KHON, source: 'phone' }];
        const report = buildDailyReport(input({ leads }));
        const { container, rerender } = render(<DailyReportDocument report={report} />);
        const region = screen.getByRole('region', { name: 'Дуудлага ба утасны лид' });
        expect(region.closest('.rounded-2xl')?.className).toContain('print:hidden');
        // Чан: 4 дуудлага < 5 утасны лид; Хон: 2 ≥ 1.
        const flagged = container.querySelectorAll('td[data-flag="short"]');
        expect(flagged).toHaveLength(1);
        expect(flagged[0].getAttribute('title')).toBe('Утсаар 5 лид бүртгэсэн ч бүх шугамд 4 дуудлага оруулсан');
        expect(within(region).queryByRole('rowheader', { name: 'Нийт' })).toBeNull();
        expect(report.lines[0].total).toBe(6);

        rerender(<DailyReportDocument report={report} editing={{
            editable: new Set([CHAN, KHON]), own: null, draft: { [`${CHAN}\u0000call.l1.total`]: '5' }, onCell: vi.fn(), notes: null, onNotes: vi.fn(),
        }} />);
        expect(container.querySelectorAll('td[data-flag="short"]')).toHaveLength(0);

        rerender(<DailyReportDocument report={report} forImage />);
        expect(screen.queryByRole('region', { name: 'Дуудлага ба утасны лид' })).toBeNull();
        rerender(<DailyReportDocument report={buildDailyReport(input({ leads: [{ manager: CHAN, source: 'facebook' }] }))} />);
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
