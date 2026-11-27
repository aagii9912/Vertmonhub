import { fireEvent, render, screen, within } from '@testing-library/react';
import { expect, it } from 'vitest';
import { UnitPriceView } from './UnitPriceView';
import type { UnitPriceSheet } from '@/lib/sales/unit-pricing';

const sheet: UnitPriceSheet = {
    id: 'l1', list_key: 'zp-201', list_name: '201, 202-р блокийн зогсоол', category: 'parking', version: 2, source: 'PQ-ZP-206-005', note: '100% бэлэн төлөлтөд 10% хямдрал.',
    valid_from: '2026-10-08', valid_until: null, validity: 'valid', activated_at: '2026-10-09T02:00:00Z', activated_by: 'Болд',
    conditions: [{ label: '50%', advance_percent: 50 }, { label: '100%', advance_percent: null }, { label: '0-30%', advance_percent: 0 }],
    rows: [
        { block: '201', code: '201-288', model: 'VIP 1', area_sqm: 34.2, prices: { '50%': 73_900_000, '100%': 72_600_000 } },
        { block: '201', code: '201-160', model: 'Энгийн', area_sqm: 12.5, prices: { '50%': 49_900_000, '100%': 47_800_000 } },
        { block: '202', code: '202-137', model: 'Энгийн', area_sqm: null, prices: { '50%': 49_400_000, '0-30%': 52_800_000 } },
    ],
};

it('lists one block units with a price per condition, as whole amounts per unit', () => {
    render(<UnitPriceView sheet={sheet} block="201" showList />);
    expect(screen.getByText('201, 202-р блокийн зогсоол · Хувилбар 2')).toBeInTheDocument();
    expect(screen.getByText('Хүчинтэй')).toBeInTheDocument();
    expect(screen.getByText('2026.10.08 – дуусах хугацаагүй')).toBeInTheDocument();
    expect(screen.getByText('100% бэлэн төлөлтөд 10% хямдрал.')).toBeInTheDocument();
    // Only this block's units, sorted by code; a condition no unit of the block has is not a column.
    const [head, first, second] = screen.getAllByRole('row');
    expect(within(head).getAllByRole('columnheader').map(cell => cell.textContent)).toEqual(['Код', 'Загвар', 'Талбай', '50%урьдчилгаа 50%', '100%']);
    expect(first).toHaveTextContent('201-160Энгийн12.5 м²49,900,000₮47,800,000₮');
    expect(second).toHaveTextContent('201-288VIP 134.2 м²73,900,000₮72,600,000₮');
    expect(screen.queryByText('202-137')).not.toBeInTheDocument();
    expect(screen.getByText(/нэг тоотын нийт үнэ \(м² үнэ биш\)/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'VIP 1' }));
    expect(screen.queryByText('201-160')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Бүгд' }));
    fireEvent.change(screen.getByLabelText('Кодоор хайх'), { target: { value: '160' } });
    expect(screen.queryByText('201-288')).not.toBeInTheDocument();
    expect(screen.getByText(/2 тоотоос 1 нь харагдаж байна/)).toBeInTheDocument();
});

it('shows a missing condition as a dash and warns when the list has ended', () => {
    render(<UnitPriceView sheet={{ ...sheet, validity: 'expired', valid_until: '2026-10-31' }} block="202" />);
    expect(screen.getByText('Хувилбар 2')).toBeInTheDocument();
    expect(screen.getByText(/Хүчинтэй хугацаа дууссан/)).toBeInTheDocument();
    const [, row] = screen.getAllByRole('row');
    expect(row).toHaveTextContent('202-137Энгийн—49,400,000₮52,800,000₮');
});
