import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, expect, it, vi } from 'vitest';
import { ProjectPricingSettings } from './ProjectPricingSettings';

const fetchMock = vi.fn();
const overview = (latest: unknown, active: unknown = null) => ({ lists: [{ key: 'main', name: 'Үндсэн үнэ', latest, active }] });
beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({ ok: true, json: async () => overview(null) });
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
    fireEvent.click(screen.getByRole('checkbox', { name: /Одоогийн нөөцийн талбайгаар/ }));
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
    fetchMock.mockImplementation(async (url: string) => ({ ok: true, json: async () => url === '/api/admin/pricing/import' ? file : overview(latest) }));
    mount();
    // Two blocks: the editor opens on the block cards, and one block's rows show without the block column.
    fireEvent.click(await screen.findByRole('button', { name: 'B1 блокийн мөрүүд' }));
    expect(screen.getByLabelText('1-р мөр Загвар')).toHaveValue('E3');
    expect(screen.queryByLabelText('1-р мөр Блок')).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue('A')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Бүх мөр/ }));
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
    fetchMock.mockImplementation(async () => ({ ok: true, json: async () => overview(latest) }));
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
it('adds a separate price list with its own name and saves it under its own key from version 0', async () => {
    const rule = { block: '201', model: 'A', floor_min: 2, floor_max: 9, payment_condition: '50%', price_per_sqm: 4_000_000, advance_percent: 50 };
    const main = { id: 'c2', shop_id: 'shop', list_key: 'main', list_name: 'Үндсэн үнэ', version: 2, status: 'active', source: 'Баталсан үнэ', valid_from: '2026-11-01', valid_until: '2027-02-28', inventory_area_confirmed: true, rules: [rule] };
    fetchMock.mockImplementation(async (_url: string, init?: { method?: string }) => ({ ok: true, json: async () => init?.method === 'PUT' ? { config: {} } : overview(main, main) }));
    mount();
    await screen.findByText(/Идэвхтэй хувилбар 2: Баталсан үнэ/);
    expect(screen.getByRole('button', { name: /Үндсэн үнэ/ })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Үнийн жагсаалт нэмэх' }));
    fireEvent.change(screen.getByLabelText('Шинэ жагсаалтын нэр'), { target: { value: ' үндсэн үнэ ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Нэмэх' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Ийм нэртэй үнийн жагсаалт байна');
    fireEvent.change(screen.getByLabelText('Шинэ жагсаалтын нэр'), { target: { value: 'Forest Garden тусгай үнэ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Нэмэх' }));
    // The new list starts empty: nothing is copied from the default list.
    expect(await screen.findByText('Идэвхтэй үнэ байхгүй.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Forest Garden тусгай үнэ/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText('Жагсаалтын нэр')).toHaveValue('Forest Garden тусгай үнэ');
    expect(screen.queryByLabelText('1-р мөр Блок')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Идэвхтэй үнийг идэвхгүй болгох' })).not.toBeInTheDocument();

    // The same unit and condition on the default list's days is refused at review, naming that list.
    fireEvent.change(screen.getByLabelText('Эх сурвалж'), { target: { value: 'PQ-FG-503-001' } });
    fireEvent.change(screen.getByLabelText('Эхлэх огноо'), { target: { value: '2026-11-27' } });
    fireEvent.change(screen.getByLabelText('Дуусах огноо'), { target: { value: '2026-12-31' } });
    fireEvent.click(screen.getByRole('checkbox', { name: /Одоогийн нөөцийн талбайгаар/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Үнийн мөр нэмэх' }));
    for (const [label, value] of [['Блок','201'], ['Загвар','A'], ['Давхар эхлэх','9'], ['Давхар дуусах','12'], ['Нөхцөл','50%'], ['м² үнэ (₮)','4800000'], ['Эхний урьдчилгаа (%)','50']]) {
        fireEvent.change(screen.getByLabelText(`1-р мөр ${label}`), { target: { value } });
    }
    fireEvent.click(screen.getByRole('button', { name: 'Идэвхжүүлэхийн өмнө хянах' }));
    expect(screen.getByRole('alert')).toHaveTextContent('«Үндсэн үнэ» жагсаалтын идэвхтэй үнэтэй давхцаж байна');
    expect(screen.getByRole('button', { name: 'Баталсан үнийг идэвхжүүлэх' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('1-р мөр Блок'), { target: { value: '503' } });
    fireEvent.click(screen.getByRole('button', { name: 'Идэвхжүүлэхийн өмнө хянах' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Баталсан үнийг идэвхжүүлэх' }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'PUT')).toBe(true));
    const body = JSON.parse(fetchMock.mock.calls.find(([, init]) => init?.method === 'PUT')![1].body);
    expect(body).toMatchObject({ list_name: 'Forest Garden тусгай үнэ', expected_version: 0, status: 'active' });
    expect(body.list_key).toMatch(/^[a-z0-9-]{1,40}$/);
    expect(body.list_key).not.toBe('main');
    expect(body.config.rules).toEqual([{ ...rule, block: '503', floor_min: 9, floor_max: 12, price_per_sqm: 4_800_000 }]);
});
it('withdraws a list active price only after a second confirmation, with the list latest version', async () => {
    const active = { id: 'c1', shop_id: 'shop', list_key: 'forest', list_name: 'Forest Garden тусгай үнэ', version: 1, status: 'active', source: 'PQ-FG-503-001', valid_from: '2026-11-01', valid_until: '2026-12-31', inventory_area_confirmed: true, rules: [] };
    const draft = { ...active, id: 'c2', version: 2, status: 'draft' };
    fetchMock.mockImplementation(async () => ({ ok: true, json: async () => ({ lists: [{ key: 'main', name: 'Үндсэн үнэ', latest: null, active: null }, { key: 'forest', name: 'Forest Garden тусгай үнэ', latest: draft, active }] }) }));
    mount();
    fireEvent.click(await screen.findByRole('button', { name: /Forest Garden тусгай үнэ/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Идэвхтэй үнийг идэвхгүй болгох' }));
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'DELETE')).toBe(false);
    expect(screen.getByRole('status')).toHaveTextContent('хувилбар 1 архивт шилжинэ');
    fireEvent.click(screen.getByRole('button', { name: 'Тийм, идэвхгүй болгох' }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'DELETE')).toBe(true));
    const [url, init] = fetchMock.mock.calls.find(([, init]) => init?.method === 'DELETE')!;
    expect(url).toBe('/api/admin/pricing');
    expect(JSON.parse(init.body)).toEqual({ list_key: 'forest', expected_version: 2 });
});
it('edits a list of several blocks one block at a time as a price sheet: cards, price cells, a new row, condition and block', async () => {
    const rule = (block: string, model: string, advance_percent: number | null = 30) => ({ block, model, floor_min: 2, floor_max: 9, payment_condition: '30%', price_per_sqm: 4_000_000, advance_percent });
    const latest = { id: 'c1', shop_id: 'shop', list_key: 'main', list_name: 'Үндсэн үнэ', version: 1, status: 'draft', source: 'Үнийн санал', valid_from: '2026-11-01', valid_until: '2027-02-28', inventory_area_confirmed: true,
        rules: [rule('201', 'A'), rule('201', 'B'), rule('202', 'A', null)] };
    fetchMock.mockImplementation(async (_url: string, init?: { method?: string }) => ({ ok: true, json: async () => init?.method === 'PUT' ? { config: {} } : overview(latest) }));
    mount();
    const cards = await screen.findByRole('group', { name: 'Блок сонгох' });
    expect(cards).toHaveTextContent('2012 мөр · 2 загвар');
    expect(cards).toHaveTextContent('2021 мөр · 1 загварУрьдчилгаа дутуу · 1');
    expect(cards).toHaveTextContent('Бүх мөр3 мөр нэг хүснэгтээр');
    // No rows until a block is chosen; the list's terms stay in view.
    expect(screen.queryByLabelText('1-р мөр Загвар')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Эх сурвалж')).toHaveValue('Үнийн санал');

    fireEvent.click(screen.getByRole('button', { name: '202 блокийн мөрүүд' }));
    expect(screen.getByRole('button', { name: '202 блокийн мөрүүд' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText('3-р мөр Загвар')).toHaveValue('A');
    expect(screen.queryByLabelText('1-р мөр Загвар')).not.toBeInTheDocument();
    // A row added inside a block belongs to that block.
    // An opened block is a price sheet: one row per model and floor range, one price column per condition.
    expect(screen.getByRole('columnheader', { name: /30%/ })).toHaveTextContent('урьдчилгаа дутуу');
    expect(screen.queryByLabelText('3-р мөр Нөхцөл')).not.toBeInTheDocument();
    expect(screen.getByLabelText('A, 2–9 давхар · 30% м² үнэ (₮)')).toHaveValue('4000000');
    const group = (row: number, model: string) => {
        for (const [label, value] of [['Загвар', model], ['Давхар эхлэх', '2'], ['Давхар дуусах', '9']]) fireEvent.change(screen.getByLabelText(`${row}-р мөр ${label}`), { target: { value } });
    };
    // A new sheet row belongs to the open block; its price cell takes the advance the list already uses for that condition.
    fireEvent.click(screen.getByRole('button', { name: 'Үнийн мөр нэмэх' }));
    expect(screen.getByLabelText('4-р мөр Загвар')).toHaveValue('');
    group(4, 'B');
    fireEvent.change(screen.getByLabelText('B, 2–9 давхар · 30% м² үнэ (₮)'), { target: { value: '4100000' } });
    expect(screen.getByLabelText('B, 2–9 давхар · 30% м² үнэ (₮)')).toHaveValue('4100000');
    expect(screen.getByRole('group', { name: 'Блок сонгох' })).toHaveTextContent('2022 мөр · 2 загвар');
    // Clearing a price removes that condition from the row; typing it again brings it back.
    fireEvent.change(screen.getByLabelText('B, 2–9 давхар · 30% м² үнэ (₮)'), { target: { value: '' } });
    expect(screen.getByLabelText('4-р мөр Загвар')).toHaveValue('B');
    fireEvent.change(screen.getByLabelText('B, 2–9 давхар · 30% м² үнэ (₮)'), { target: { value: '4100000' } });

    // A new block starts as an empty sheet: add the condition column, then the row and its price.
    fireEvent.change(screen.getByLabelText('Шинэ блок'), { target: { value: '203' } });
    fireEvent.click(screen.getByRole('button', { name: 'Блок нэмэх' }));
    expect(screen.getByRole('button', { name: '203 блокийн мөрүүд' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.change(screen.getByLabelText('Шинэ нөхцөл'), { target: { value: '50%' } });
    fireEvent.click(screen.getByRole('button', { name: 'Нөхцөлийн багана нэмэх' }));
    group(5, 'C');
    fireEvent.change(screen.getByLabelText('C, 2–9 давхар · 50% м² үнэ (₮)'), { target: { value: '4500000' } });

    // Saving sends every block's rows, not only the one on screen.
    fireEvent.click(screen.getByRole('button', { name: 'Ноорог хадгалах' }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'PUT')).toBe(true));
    const body = JSON.parse(fetchMock.mock.calls.find(([, init]) => init?.method === 'PUT')![1].body);
    expect(body.config.rules.map((item: { block: string; model: string; payment_condition: string; price_per_sqm: number; advance_percent: number | null }) =>
        `${item.block}/${item.model} ${item.payment_condition} ${item.price_per_sqm} ${item.advance_percent}`)).toEqual([
        '201/A 30% 4000000 30', '201/B 30% 4000000 30', '202/A 30% 4000000 null', '202/B 30% 4100000 30', '203/C 50% 4500000 null',
    ]);
    expect(body.config.rules.every((item: object) => !('gid' in item))).toBe(true);
});
it('saves a step price only when it is switched on, and keeps a saved one', async () => {
    const rule = { block: '503', model: 'A', floor_min: 2, floor_max: 9, payment_condition: '50%', price_per_sqm: 4_800_000, advance_percent: 50 };
    const latest = { id: 'c1', shop_id: 'shop', list_key: 'main', list_name: 'Үндсэн үнэ', version: 1, status: 'draft', source: 'PQ-FG-503-001', valid_from: '2026-11-27', valid_until: '2026-12-31', inventory_area_confirmed: true, rules: [rule] };
    fetchMock.mockImplementation(async (_url: string, init?: { method?: string }) => ({ ok: true, json: async () => init?.method === 'PUT' ? { config: {} } : overview(latest) }));
    const puts = () => fetchMock.mock.calls.filter(([, init]) => init?.method === 'PUT').map(([, init]) => JSON.parse(init.body));
    mount();
    const toggle = await screen.findByRole('checkbox', { name: /гэрээ хийгдэх бүрд нэмэгдэнэ/ });
    expect(toggle).not.toBeChecked();
    expect(screen.queryByLabelText('Гэрээ бүрд нэмэх дүн (₮/м²)')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Ноорог хадгалах' }));
    await waitFor(() => expect(puts()).toHaveLength(1));
    expect(puts()[0].config).not.toHaveProperty('step');

    // Switched on without an amount: said before anything is sent.
    fireEvent.click(toggle);
    fireEvent.change(screen.getByLabelText('Гэрээ тоолж эхлэх огноо'), { target: { value: '2026-11-27' } });
    fireEvent.click(screen.getByRole('button', { name: 'Идэвхжүүлэхийн өмнө хянах' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Гэрээ бүрд нэмэх дүнг оруулна уу');
    fireEvent.change(screen.getByLabelText('Гэрээ бүрд нэмэх дүн (₮/м²)'), { target: { value: '100000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Идэвхжүүлэхийн өмнө хянах' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Баталсан үнийг идэвхжүүлэх' }));
    await waitFor(() => expect(puts()).toHaveLength(2));
    expect(puts()[1]).toMatchObject({ status: 'active', config: { step: { amount_per_sqm: 100_000, counts_from: '2026-11-27' } } });
});
it('opens a list that already has a step price with its amount and start day', async () => {
    const latest = { id: 'c1', shop_id: 'shop', list_key: 'main', list_name: 'Үндсэн үнэ', version: 1, status: 'draft', source: 'x', valid_from: '2026-11-27', valid_until: '2026-12-31', inventory_area_confirmed: true, rules: [],
        step: { amount_per_sqm: 100_000, counts_from: '2026-11-27' } };
    fetchMock.mockImplementation(async () => ({ ok: true, json: async () => overview(latest) }));
    mount();
    expect(await screen.findByRole('checkbox', { name: /гэрээ хийгдэх бүрд нэмэгдэнэ/ })).toBeChecked();
    expect(screen.getByLabelText('Гэрээ бүрд нэмэх дүн (₮/м²)')).toHaveValue('100000');
    expect(screen.getByLabelText('Гэрээ тоолж эхлэх огноо')).toHaveValue('2026-11-27');
});
