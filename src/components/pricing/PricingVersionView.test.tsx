import { fireEvent, render, screen, within } from '@testing-library/react';
import { expect, it } from 'vitest';
import { PricingVersionView } from './PricingVersionView';
import type { PricingSheetVersion } from '@/lib/sales/pricing-history';

const rule = { block: 'Б1', model: 'E3', floor_min: 2, floor_max: 9, payment_condition: '30%', price_per_sqm: 4_200_000, advance_percent: 30 };
const version = (overrides: Partial<PricingSheetVersion> = {}): PricingSheetVersion => ({
    id: 'c3', version: 3, status: 'active', source: 'Баталсан 10.20 үнэ', valid_from: '2026-10-20', valid_until: '2026-12-31',
    activated_at: '2026-10-20T02:00:00Z', activated_by: 'Болд', archived_at: null, validity: 'valid', previous_version: 1,
    rows: [
        { rule, change: 'changed', previous: { price_per_sqm: 4_000_000, advance_percent: 30 } },
        { rule: { ...rule, model: 'E7' }, change: 'added', previous: null },
    ],
    removed: [{ ...rule, model: 'E5', price_per_sqm: 4_100_000 }],
    ...overrides,
});

it('shows the valid price with the replaced price, new rows and removed rows', () => {
    render(<PricingVersionView version={version()} />);
    expect(screen.getByText('Хүчинтэй')).toBeInTheDocument();
    expect(screen.getByText('2026.10.20 – 2026.12.31')).toBeInTheDocument();
    expect(screen.getByText(/1 мөр өөрчлөгдсөн · 1 шинэ · 1 хасагдсан/)).toBeInTheDocument();
    // Price-list layout: one row per block × model × floors, one column per payment condition.
    expect(screen.getByRole('columnheader', { name: /30%/ })).toHaveTextContent('урьдчилгаа 30%');
    const [, changed, added] = screen.getAllByRole('row');
    expect(within(changed).getByText('4,200,000₮')).toBeInTheDocument();
    expect(within(changed).getByText('4,000,000₮').tagName).toBe('S');
    expect(within(changed).queryByText('Шинэ')).not.toBeInTheDocument();
    expect(within(added).getByText('Шинэ')).toBeInTheDocument();
    expect(screen.getByText(/E5/).textContent).toContain('4,100,000₮');
});

it('warns when the active price is outside its window and labels archived versions', () => {
    const { unmount } = render(<PricingVersionView version={version({ validity: 'expired' })} />);
    expect(screen.getByText('Хугацаа дууссан')).toBeInTheDocument();
    expect(screen.getByText(/үнийн санал тооцогдохгүй/)).toBeInTheDocument();
    unmount();
    render(<PricingVersionView version={version({ status: 'archived', archived_at: '2026-10-25T02:00:00Z', previous_version: null, removed: [],
        rows: [{ rule, change: null, previous: null }] })} />);
    expect(screen.getByText('Архивласан')).toBeInTheDocument();
    expect(screen.getByText('Архивт шилжсэн')).toBeInTheDocument();
    expect(screen.queryByText(/үнийн санал тооцогдохгүй/)).not.toBeInTheDocument();
    expect(screen.getByText(/Анхны баталсан хувилбар/)).toBeInTheDocument();
    expect(screen.queryByText('Шинэ')).not.toBeInTheDocument();
});

it('pivots conditions into columns, marks missing ones and filters by block', () => {
    render(<PricingVersionView version={version({ previous_version: null, removed: [], rows: [
        { rule: { ...rule, payment_condition: '50%', advance_percent: 50, price_per_sqm: 3_900_000 }, change: null, previous: null },
        { rule, change: null, previous: null },
        { rule: { ...rule, payment_condition: 'Ашиглалтад орсны дараа', advance_percent: 100, price_per_sqm: 4_500_000 }, change: null, previous: null },
        { rule: { ...rule, block: 'Б2', model: 'A', advance_percent: 10 }, change: null, previous: null },
    ] })} />);
    expect(screen.getAllByRole('columnheader').map(cell => cell.textContent)).toEqual([
        'Блок', 'Загвар', 'Давхар', 'Ашиглалтад орсны дарааурьдчилгаа 100%', '30%', '50%урьдчилгаа 50%',
    ]);
    const [, b1, b2] = screen.getAllByRole('row');
    expect(within(b1).getAllByRole('cell').map(cell => cell.textContent)).toEqual(['Б1', 'E3', '2–9', '4,500,000₮', '4,200,000₮урьдчилгаа 30%', '3,900,000₮']);
    expect(within(b2).getAllByRole('cell').map(cell => cell.textContent)).toEqual(['Б2', 'A', '2–9', '—', '4,200,000₮урьдчилгаа 10%', '—']);
    fireEvent.click(screen.getByRole('button', { name: 'Б2' }));
    expect(screen.getAllByRole('row')).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Б2' })).toHaveAttribute('aria-pressed', 'true');
});
