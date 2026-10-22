import { render, screen, within } from '@testing-library/react';
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
    const [, changed, added] = screen.getAllByRole('row');
    expect(within(changed).getByText('4,200,000₮')).toBeInTheDocument();
    expect(within(changed).getByText('4,000,000₮').tagName).toBe('S');
    expect(within(changed).getByText('Өөрчлөгдсөн')).toBeInTheDocument();
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
    expect(screen.queryByText('Өмнөхөөс')).not.toBeInTheDocument();
});
