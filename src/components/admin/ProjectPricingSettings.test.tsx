import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, expect, it, vi } from 'vitest';
import { ProjectPricingSettings } from './ProjectPricingSettings';

const fetchMock = vi.fn();
beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ latest: null, active: null }) });
    vi.stubGlobal('fetch', fetchMock);
});
function mount() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(<QueryClientProvider client={client}><ProjectPricingSettings shopId="shop" projectName="Elysium" /></QueryClientProvider>);
}
it('starts empty with no copied prices or activation before review', async () => {
    mount();
    await screen.findByText('Идэвхтэй үнэ байхгүй.');
    expect(screen.getByRole('button', { name: 'Баталсан үнийг идэвхжүүлэх' })).toBeDisabled();
    expect(screen.queryByLabelText('1-р мөр м² үнэ (₮)')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Идэвхжүүлэхийн өмнө хянах' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('эх сурвалж');
});
it('preserves a reviewed draft on save failure and requires another review after rate edits', async () => {
    mount(); await screen.findByText('Идэвхтэй үнэ байхгүй.');
    fireEvent.change(screen.getByLabelText('Эх сурвалж'), { target: { value: 'Баталсан 10.08 үнэ' } });
    fireEvent.change(screen.getByLabelText('Эхлэх огноо'), { target: { value: '2026-10-01' } });
    fireEvent.change(screen.getByLabelText('Дуусах огноо'), { target: { value: '2026-10-31' } });
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Үнийн мөр нэмэх' }));
    for (const [label, value] of [['Блок','Б1'], ['Загвар','E3'], ['Давхар эхлэх','2'], ['Давхар дуусах','9'], ['Нөхцөл','50%'], ['м² үнэ (₮)','4000000'], ['Эхний урьдчилгаа (%)','50']]) {
        fireEvent.change(screen.getByLabelText(`1-р мөр ${label}`), { target: { value } });
    }
    fireEvent.click(screen.getByRole('button', { name: 'Идэвхжүүлэхийн өмнө хянах' }));
    expect(screen.getByRole('button', { name: 'Баталсан үнийг идэвхжүүлэх' })).toBeEnabled();
    fetchMock.mockResolvedValueOnce({ ok: false, status: 409, json: async () => ({ error: 'Тохиргоо өөрчлөгдсөн' }) });
    fireEvent.click(screen.getByRole('button', { name: 'Баталсан үнийг идэвхжүүлэх' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Тохиргоо өөрчлөгдсөн'));
    expect(screen.getByLabelText('1-р мөр м² үнэ (₮)')).toHaveValue('4000000');
    expect(screen.getByRole('button', { name: 'Ноорог хадгалах' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('1-р мөр м² үнэ (₮)'), { target: { value: '4100000' } });
    expect(screen.getByRole('button', { name: 'Баталсан үнийг идэвхжүүлэх' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Серверийн шинэ утгыг авах · миний засварыг цэвэрлэх' }));
    await waitFor(() => expect(screen.queryByLabelText('1-р мөр м² үнэ (₮)')).not.toBeInTheDocument());
});
it('an Excel import replaces only the imported block rows and keeps the draft unsaved until review', async () => {
    const rule = (block: string, model: string) => ({ block, model, floor_min: 2, floor_max: 9, payment_condition: '30%', price_per_sqm: 4_000_000, advance_percent: 30 });
    const latest = { id: 'c1', shop_id: 'shop', version: 1, status: 'draft', source: '', valid_from: null, valid_until: null, inventory_area_confirmed: false, rules: [rule('B1', 'E3'), rule('Б2', 'A')] };
    const file = { file: 'Б1.xlsx', skipped: [], sheets: [{ name: 'Б1', title: 'Б1 блок', kind: 'residential', block: 'Б1', valid_from: null, valid_until: null,
        modelColumns: [{ header: 'Загвар', sample: ['E6'] }], conditions: [{ label: '30%', base: false }],
        rows: [{ row: 8, floor_min: 3, floor_max: 4, models: ['E6'], prices: { '30%': 6_800_000 } }], issues: [] }] };
    fetchMock.mockImplementation(async (url: string) => ({ ok: true, json: async () => url === '/api/admin/pricing/import' ? file : { latest, active: null } }));
    mount();
    await screen.findByDisplayValue('E3');
    fireEvent.click(screen.getByRole('button', { name: 'Excel-ээс оруулах' }));
    fireEvent.change(document.querySelector('input[type=file]') as HTMLInputElement, { target: { files: [new File(['x'], 'Б1.xlsx')] } });
    await screen.findByText('Б1: одоогийн 1 мөрийг 1 мөрөөр солино');
    fireEvent.change(screen.getByLabelText('«30%» эхний урьдчилгаа (%)'), { target: { value: '30' } });
    fireEvent.click(screen.getByRole('button', { name: 'Засварт оруулах (1 мөр)' }));
    expect(screen.queryByDisplayValue('E3')).not.toBeInTheDocument();
    expect(screen.getByDisplayValue('A')).toBeInTheDocument();
    expect(screen.getByLabelText('2-р мөр Загвар')).toHaveValue('E6');
    expect(screen.getByLabelText('2-р мөр м² үнэ (₮)')).toHaveValue('6800000');
    expect(screen.getByLabelText('Эх сурвалж')).toHaveValue('Файл: Б1.xlsx');
    expect(fetchMock.mock.calls.filter(([url, init]) => url === '/api/admin/pricing' && init?.method === 'PUT')).toHaveLength(0);
    expect(screen.getByRole('button', { name: 'Баталсан үнийг идэвхжүүлэх' })).toBeDisabled();
});
it('fills the first advance once per payment condition so an imported draft can be activated', async () => {
    const rule = (model: string, payment_condition: string) => ({ block: 'Б1', model, floor_min: 2, floor_max: 9, payment_condition, price_per_sqm: 4_000_000, advance_percent: null });
    const latest = { id: 'c1', shop_id: 'shop', version: 2, status: 'draft', source: 'Файл: Б1.xlsx', valid_from: '2026-10-22', valid_until: '2026-11-30', inventory_area_confirmed: true,
        rules: [rule('E3', '30%'), rule('E6', '30%'), rule('E3', '10-30%')] };
    fetchMock.mockImplementation(async () => ({ ok: true, json: async () => ({ latest, active: null }) }));
    mount();
    await screen.findByLabelText('1-р мөр Загвар');
    fireEvent.click(screen.getByRole('button', { name: 'Идэвхжүүлэхийн өмнө хянах' }));
    expect(screen.getByRole('alert')).toHaveTextContent('3 мөр хоосон (30%, 10-30%)');
    expect(screen.getByRole('button', { name: 'Баталсан үнийг идэвхжүүлэх' })).toBeDisabled();

    expect(screen.getByRole('button', { name: '«30%» нөхцөлийн 2 мөрд урьдчилгаа оруулах' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('«30%» нөхцөлийн бүх мөрийн урьдчилгаа (%)'), { target: { value: '130' } });
    expect(screen.getByRole('button', { name: '«30%» нөхцөлийн 2 мөрд урьдчилгаа оруулах' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('«30%» нөхцөлийн бүх мөрийн урьдчилгаа (%)'), { target: { value: '30' } });
    fireEvent.click(screen.getByRole('button', { name: '«30%» нөхцөлийн 2 мөрд урьдчилгаа оруулах' }));
    expect(screen.getByLabelText('1-р мөр Эхний урьдчилгаа (%)')).toHaveValue('30');
    expect(screen.getByLabelText('2-р мөр Эхний урьдчилгаа (%)')).toHaveValue('30');
    expect(screen.getByLabelText('3-р мөр Эхний урьдчилгаа (%)')).toHaveValue('');
    fireEvent.click(screen.getByRole('button', { name: 'Идэвхжүүлэхийн өмнө хянах' }));
    expect(screen.getByRole('alert')).toHaveTextContent('1 мөр хоосон (10-30%)');

    fireEvent.change(screen.getByLabelText('«10-30%» нөхцөлийн бүх мөрийн урьдчилгаа (%)'), { target: { value: '10,5' } });
    fireEvent.click(screen.getByRole('button', { name: '«10-30%» нөхцөлийн 1 мөрд урьдчилгаа оруулах' }));
    expect(screen.getByLabelText('3-р мөр Эхний урьдчилгаа (%)')).toHaveValue('10.5');
    fireEvent.click(screen.getByRole('button', { name: 'Идэвхжүүлэхийн өмнө хянах' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Баталсан үнийг идэвхжүүлэх' }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([url, init]) => url === '/api/admin/pricing' && init?.method === 'PUT')).toBe(true));
    const [, init] = fetchMock.mock.calls.find(([url, init]) => url === '/api/admin/pricing' && init?.method === 'PUT')!;
    const body = JSON.parse(init.body);
    expect(body.status).toBe('active');
    expect(body.config.rules.map((item: { advance_percent: number }) => item.advance_percent)).toEqual([30, 30, 10.5]);
});
