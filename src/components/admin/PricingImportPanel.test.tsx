import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { BASE_PRICE_CONDITION, type PricingImportFile } from '@/lib/sales/pricing-import';

const api = vi.hoisted(() => ({ dashboardFetch: vi.fn() }));
vi.mock('@/lib/api/dashboardFetch', () => api);
import { PricingImportPanel } from './PricingImportPanel';

const parsed: PricingImportFile = { file: 'Б1 үнийн санал.xlsx', skipped: [], sheets: [{
    name: 'PQ-EL-B1-002', title: 'ELYSIUM Residence B1 блокийн орон сууцны үнийн санал', kind: 'residential', block: 'Б1',
    valid_from: '2026-05-11', valid_until: '2026-08-31',
    modelColumns: [{ header: 'Загвар', sample: ['E1', 'E6'] }, { header: 'Загвар', sample: ['D'] }],
    conditions: [{ label: BASE_PRICE_CONDITION, base: true }, { label: '30%', base: false }, { label: '10-30%', base: false }],
    rows: [
        { row: 8, floor_min: 2, floor_max: 2, models: ['E1', 'D'], prices: { [BASE_PRICE_CONDITION]: 6_000_000, '30%': 5_900_000, '10-30%': 6_100_000 } },
        { row: 9, floor_min: 3, floor_max: 4, models: ['E6', 'D'], prices: { '30%': 6_800_000 } },
    ],
    issues: [{ row: null, message: 'Зоорийн давхрын 2 мөр (14–15-р мөр) орсонгүй: үнийн мөр 1–200 давхарын дугаартай байна' }],
}] };

beforeEach(() => {
    api.dashboardFetch.mockReset();
    api.dashboardFetch.mockResolvedValue({ ok: true, json: async () => parsed });
});

async function choose(onApply = vi.fn()) {
    render(<PricingImportPanel shopId="shop" currentBlocks={new Map([['B1', 3]])} onApply={onApply} onCancel={vi.fn()} />);
    const input = document.querySelector('input[type=file]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(['x'], 'Б1 үнийн санал.xlsx')] } });
    await screen.findByText('ELYSIUM Residence B1 блокийн орон сууцны үнийн санал');
    return onApply;
}

it('uploads to the preview route with the chosen project and shows what the file holds', async () => {
    await choose();
    expect(api.dashboardFetch).toHaveBeenCalledWith('/api/admin/pricing/import', expect.objectContaining({ shopId: 'shop', method: 'POST' }));
    expect(screen.getByText(/файлд 2026\.05\.11 – 2026\.08\.31 хүчинтэй/)).toBeInTheDocument();
    expect(screen.getByText(/Зоорийн давхрын 2 мөр/)).toBeInTheDocument();
    expect(screen.getByLabelText(`«${BASE_PRICE_CONDITION}» нөхцөлийг оруулах`)).not.toBeChecked();
    expect(screen.getByLabelText('«30%» нөхцөлийг оруулах')).toBeChecked();
    expect(screen.getByLabelText('«30%» эхний урьдчилгаа (%)')).toHaveValue('');
    expect(screen.getByText('Б1: одоогийн 3 мөрийг 3 мөрөөр солино')).toBeInTheDocument();
});

it('hands confirmed rules to the editor and never invents an advance', async () => {
    const onApply = await choose();
    fireEvent.change(screen.getByLabelText('«30%» эхний урьдчилгаа (%)'), { target: { value: '30' } });
    expect(screen.getByText('Урьдчилгаа оруулаагүй: 10-30%.')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Загварын багана'), { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: 'Засварт оруулах (3 мөр)' }));
    expect(onApply).toHaveBeenCalledWith({ files: ['Б1 үнийн санал.xlsx'], rules: [
        { block: 'Б1', model: 'E1', floor_min: 2, floor_max: 2, payment_condition: '30%', price_per_sqm: 5_900_000, advance_percent: 30 },
        { block: 'Б1', model: 'E1', floor_min: 2, floor_max: 2, payment_condition: '10-30%', price_per_sqm: 6_100_000, advance_percent: null },
        { block: 'Б1', model: 'E6', floor_min: 3, floor_max: 4, payment_condition: '30%', price_per_sqm: 6_800_000, advance_percent: 30 },
    ] });
});

it('blocks apply on an invalid advance or a missing block and reports server errors', async () => {
    await choose();
    fireEvent.change(screen.getByLabelText('«30%» эхний урьдчилгаа (%)'), { target: { value: '130' } });
    expect(screen.getByRole('button', { name: /Засварт оруулах/ })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('«30%» эхний урьдчилгаа (%)'), { target: { value: '30' } });
    fireEvent.change(screen.getByLabelText('Блок'), { target: { value: '' } });
    expect(screen.getByRole('alert')).toHaveTextContent('блокийг оруулна уу');
    api.dashboardFetch.mockResolvedValueOnce({ ok: false, json: async () => ({ error: '.xls формат дэмжигдэхгүй' }) });
    fireEvent.change(document.querySelector('input[type=file]') as HTMLInputElement, { target: { files: [new File(['x'], 'хуучин.xls')] } });
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('хуучин.xls: .xls формат дэмжигдэхгүй'));
});
