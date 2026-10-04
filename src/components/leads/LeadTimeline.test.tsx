import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LeadTimeline } from './LeadTimeline';
import { buildLeadTimeline } from '@/lib/leads/timeline';
import type { LeadDetail } from '@/hooks/useLeads';

const roster = [
    { name: 'Манда', user_id: 'u-manda', is_active: true },
    { name: 'Сараа', user_id: 'u-saraa', is_active: true },
];
const lead = { id: 'lead-1', customer_name: 'Болд', status: 'offered', source: 'phone', sales_manager_name: 'Манда', created_at: '2026-09-01T02:00:00Z' };

function detail(timeline: LeadDetail['timeline']): LeadDetail {
    return { lead: lead as LeadDetail['lead'], viewings: [], contracts: [], activities: [], property: null, partial: [], timeline };
}

const timeline = buildLeadTimeline({
    lead,
    roster,
    activities: [
        { id: 'a1', type: 'call', content: 'Анх ярьсан', meta: {}, created_by: 'u-manda', created_by_name: 'Манда', created_at: '2026-09-02T02:00:00Z' },
        { id: 'a2', type: 'quote', content: 'Үнийн санал: 450,000,000₮ · A-1203', meta: { amount: 450_000_000, unit_label: 'A-1203' }, created_by: 'u-manda', created_by_name: 'Манда', created_at: '2026-09-03T02:00:00Z' },
        { id: 'a3', type: 'quote', content: 'Хөнгөлөлт амласан', meta: { amount: 430_000_000, unit_label: 'A-1203' }, created_by: 'u-saraa', created_by_name: 'Сараа', created_at: '2026-09-04T02:00:00Z' },
        { id: 'a4', type: 'manager', content: 'Манда → Сараа', meta: { from: 'Манда', to: 'Сараа' }, created_by: 'u-admin', created_by_name: 'Админ', created_at: '2026-09-05T02:00:00Z' },
        { id: 'a5', type: 'manager', content: 'Сараа → Манда', meta: { from: 'Сараа', to: 'Манда' }, created_by: 'u-admin', created_by_name: 'Админ', created_at: '2026-09-06T02:00:00Z' },
    ],
    duplicates: { count: 1, managers: ['Сараа'], masked: true, leads: [] },
});

describe('LeadTimeline', () => {
    it('shows conflict warnings, the manager summary and an off-owner badge', () => {
        render(<LeadTimeline detail={detail(timeline)} />);
        const warnings = screen.getByLabelText('Менежерүүдийн зөрчил');
        expect(within(warnings).getByText('Үнийн санал зөрүүтэй')).toBeInTheDocument();
        expect(within(warnings).getByText('Үнийн санал зөрүүтэй (A-1203): Манда 450,000,000₮ · Сараа 430,000,000₮')).toBeInTheDocument();
        expect(within(warnings).getByText('Энэ утсаар өөр 1 лид бүртгэлтэй (Сараа)')).toBeInTheDocument();
        // Сануулга нь дэлгэц уншигчид «alert» болж давхар зарлагдахгүй.
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();

        const summary = screen.getByRole('region', { name: 'Холбогдсон менежерүүд' });
        const rows = within(summary).getAllByRole('listitem');
        expect(rows).toHaveLength(2);
        expect(within(rows[0]).getByText('Манда')).toBeInTheDocument();
        expect(within(rows[0]).getByText('Хариуцагч')).toBeInTheDocument();
        expect(within(rows[0]).getByText('450,000,000₮')).toBeInTheDocument();
        expect(within(rows[1]).getByText('Сараа')).toBeInTheDocument();

        expect(screen.getAllByText('Хариуцагч биш')).toHaveLength(1);
        expect(screen.getByText('Хөнгөлөлт амласан')).toBeInTheDocument();
        expect(screen.getAllByText('Хариуцагч:')).toHaveLength(2);
    });

    it('filters the history by manager and keeps ownership changes that involve them', () => {
        render(<LeadTimeline detail={detail(timeline)} />);
        const chips = screen.getByRole('group', { name: 'Менежерээр шүүх' });
        fireEvent.click(within(chips).getByRole('button', { name: 'Сараа' }));
        expect(within(chips).getByRole('button', { name: 'Сараа' })).toHaveAttribute('aria-pressed', 'true');
        expect(screen.queryByText('Анх ярьсан')).not.toBeInTheDocument();
        expect(screen.getByText('Хөнгөлөлт амласан')).toBeInTheDocument();
        expect(screen.getAllByText('Хариуцагч:')).toHaveLength(2);
        fireEvent.click(within(chips).getByRole('button', { name: 'Бүгд' }));
        expect(screen.getByText('Анх ярьсан')).toBeInTheDocument();
    });

    it('lists phone duplicates for organization users and opens them in place', () => {
        const open = vi.fn();
        const withLeads = buildLeadTimeline({
            lead, roster, activities: [],
            duplicates: { count: 1, managers: ['Сараа'], masked: false, leads: [{ id: 'dup-1', name: 'Нэргүй харилцагч', anonymous: true, status: 'new', sales_manager_name: 'Сараа', created_at: '2026-09-02T00:00:00Z' }] },
        });
        render(<LeadTimeline detail={detail(withLeads)} onOpenLead={open} />);
        const list = screen.getByRole('region', { name: 'Ижил утастай лид' });
        fireEvent.click(within(list).getByRole('button', { name: /Нэргүй харилцагч/ }));
        expect(open).toHaveBeenCalledWith('dup-1');
    });

    it('does not claim that nobody contacted the lead when the owner has no recorded contact', () => {
        render(<LeadTimeline detail={detail(buildLeadTimeline({ lead, roster, activities: [] }))} />);
        expect(screen.getByText('Холбоо бүртгээгүй')).toBeInTheDocument();
        expect(screen.queryByRole('group', { name: 'Менежерээр шүүх' })).not.toBeInTheDocument();
    });

    it('falls back to the simple history when the server sends no timeline', () => {
        const legacy = { ...detail(undefined), activities: [{ id: 'a', lead_id: 'lead-1', type: 'call' as const, content: 'Хуучин дуудлага', meta: {}, created_by_name: 'Манда', created_at: '2026-09-02T02:00:00Z' }] };
        render(<LeadTimeline detail={legacy} />);
        expect(screen.getByText('Хуучин дуудлага')).toBeInTheDocument();
        expect(screen.getByText('Лид үүсгэв')).toBeInTheDocument();
        expect(screen.queryByRole('region', { name: 'Холбогдсон менежерүүд' })).not.toBeInTheDocument();
    });
});
