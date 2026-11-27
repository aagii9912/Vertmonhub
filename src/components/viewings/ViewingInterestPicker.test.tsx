import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { ViewingInterestPicker } from './ViewingInterestPicker';
import type { ViewingUnitOption } from '@/lib/viewings/interests';

vi.mock('@/hooks/useViewings', () => ({ useViewingQuote: () => ({ data: { available: false, reason: 'Тохиргоо алга' }, isFetching: false }) }));

const unit = (id: string, block: string, model: string, area_sqm: number, floor: number): ViewingUnitOption =>
    ({ id, project_id: 'p', block, model, area_sqm, floor, unit_number: id, code: `${block}-${id}`, status: 'available' });
// Mandala Garden: the area of plan A changes by floor, and A is another plan in block 202.
const units = [unit('446', '201', 'A', 96.81, 3), unit('462', '201', 'A', 96.57, 5), unit('470', '201', 'A', 96.57, 6), unit('448', '201', 'D', 48.48, 3), unit('601', '202', 'A', 105.55, 3)];
const option = (select: HTMLElement) => [...select.querySelectorAll('option')].map(item => item.textContent);

it('a project that names a plan with its area picks both in one select', () => {
    const onDraftChange = vi.fn();
    render(<ViewingInterestPicker units={units} modelWithArea value={[]} onChange={vi.fn()} onDraftChange={onDraftChange} />);
    expect(screen.queryByRole('combobox', { name: 'Талбай' })).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Загвар' })).not.toBeInTheDocument();
    const plan = screen.getByRole('combobox', { name: 'Загвар, талбай' });
    expect(plan).toBeDisabled();
    fireEvent.change(screen.getByRole('combobox', { name: 'Блок' }), { target: { value: '201' } });
    expect(option(plan)).toEqual(['Сонгох', 'A · 96.57 м²', 'A · 96.81 м²', 'D · 48.48 м²']);
    fireEvent.change(plan, { target: { value: 'A|96.57' } });
    expect(onDraftChange).toHaveBeenLastCalledWith({ block: '201', model: 'A', area_sqm: 96.57, floor: null, unit_id: null, payment_condition: null });
    // Floors and units follow the chosen plan and area.
    expect(option(screen.getByRole('combobox', { name: 'Давхар' }))).toEqual(['Тодорхойгүй', '5-р давхар', '6-р давхар']);
    expect(option(screen.getByRole('combobox', { name: 'Тоот' }))).toHaveLength(3);
    fireEvent.change(plan, { target: { value: '' } });
    expect(onDraftChange).toHaveBeenLastCalledWith(null);
});

it('other projects keep the separate model and area selects', () => {
    render(<ViewingInterestPicker units={units} value={[]} onChange={vi.fn()} />);
    expect(screen.queryByRole('combobox', { name: 'Загвар, талбай' })).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole('combobox', { name: 'Блок' }), { target: { value: '201' } });
    expect(option(screen.getByRole('combobox', { name: 'Загвар' }))).toEqual(['Сонгох', 'A', 'D']);
    fireEvent.change(screen.getByRole('combobox', { name: 'Загвар' }), { target: { value: 'A' } });
    expect(option(screen.getByRole('combobox', { name: 'Талбай' }))).toEqual(['Сонгох', '96.57 м²', '96.81 м²']);
});
