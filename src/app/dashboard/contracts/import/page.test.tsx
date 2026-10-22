// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const transport = vi.hoisted(() => ({ json: vi.fn(), fetch: vi.fn(), confirm: vi.fn() }));
const auth = vi.hoisted(() => ({ role: 'super_admin', modules: [] as string[], canWrite: true }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ shop: { id: 'shop-1' }, user: { id: 'user-1', role: auth.role, permissions: { role: auth.role, modules: auth.modules, canWrite: auth.canWrite, canDelete: false } } }) }));
vi.mock('@/lib/api/dashboardFetch', () => ({ dashboardJson: transport.json, dashboardFetch: transport.fetch }));
vi.mock('@/components/ui/Toast', () => ({ confirmToast: transport.confirm }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('next/navigation', () => ({ usePathname: () => '/dashboard/contracts/import', useRouter: () => ({ push: vi.fn() }) }));

import ContractImportPage from './page';

const preview = (overrides: Record<string, unknown> = {}) => ({
    fileName: 'HUB data.xlsx', reportDate: '2026-10-22', sheetName: 'Sheet1', rowCount: 83,
    counts: { insert: 11, insertCancelled: 5, update: 67, unchanged: 0, review: 1, blocking: 0, missing: 10 },
    fileTotals: [{ status: 'active', label: 'Гэрээ үүссэн', rows: 76, total: 24613666010.3, prepaymentDue: 9757350348.79, overdue: 2482828893 }],
    units: { distinct: 81, resold: 2 },
    review: [{ contractId: 'c-10', label: 'Зогсоол Б1-10 (01)', row: 35, changes: [{ field: 'total_price', label: 'Нийт дүн', from: 66700000, to: 59000000 }] }],
    updates: [{ field: 'order_date', label: 'Захиалга өгсөн огноо', count: 67, items: [{ contractId: 'c-1', label: 'Б1-16', from: null, to: '2026-09-15' }] }],
    inserts: [{ label: 'Б2-231', row: 2, status: 'active', orderDate: '2026-10-15', total: 452400000, name: 'Тест.Нэр' }],
    missing: [{ contractId: 'c-31', label: 'Б1-31', status: 'active', orderDate: null, total: 300000000, undated: true }],
    stillUndated: 10,
    unitStatusMismatches: [{ label: 'Б2-231', unitStatus: 'available', unitStatusLabel: 'Чөлөөтэй', kind: 'live_on_free' }],
    info: [{ code: 'holder_differs', label: 'Б2-199', row: 8, message: 'Эзэмшигч зөрүүтэй — импорт өөрчлөхгүй; «Гэрээ шилжүүлэх» → нэр засах', fileName: '88112233', currentName: 'Тест.Эзэн' }],
    blocking: [], olderThanLatest: null, extraColumns: [], ignoredColumns: ['Банкны төлөв'], skipped: [],
    planHash: 'f'.repeat(64), opsCount: 83, canCommit: true, ...overrides,
});
const reply = (status: number, body: unknown) => ({ ok: status < 400, status, json: async () => body });

function renderPage() {
    const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={cache}><ContractImportPage /></QueryClientProvider>);
    return cache;
}
async function upload() {
    const input = screen.getByLabelText('Файл') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(['x'], 'HUB data.xlsx')] } });
    fireEvent.click(screen.getByRole('button', { name: 'Файл шалгах' }));
    return screen.findByText('Файлын нийлбэр');
}

beforeEach(() => {
    auth.role = 'super_admin'; auth.modules = []; auth.canWrite = true;
    transport.json.mockResolvedValue({ latest: { report_date: '2026-10-15', file_name: 'old.xlsx', row_count: 80, created_at: '2026-10-15T02:00:00Z', created_by_name: 'Номин' }, available: true });
    transport.confirm.mockResolvedValue(true);
});
afterEach(() => { vi.clearAllMocks(); });

it('is hidden without contracts and ERP import write access', () => {
    auth.role = 'viewer'; auth.modules = ['contracts']; auth.canWrite = true;
    renderPage();
    expect(screen.getByText(/«ERP импорт»-ын бичих эрх шаардлагатай/)).toBeInTheDocument();
    expect(screen.queryByText('Файл шалгах')).not.toBeInTheDocument();
});

it('previews the file, gates «Батлах» on the review checkbox and saves through the API', async () => {
    transport.fetch.mockResolvedValueOnce(reply(200, preview()))
        .mockResolvedValueOnce(reply(201, { ok: true, import_id: 'i-1', inserted: 16, updated: 67, replayed: false }));
    const cache = renderPage();
    const invalidate = vi.spyOn(cache, 'invalidateQueries');
    expect(await screen.findByText(/Сүүлийн импорт:/)).toBeInTheDocument();
    await upload();

    const [url, init] = transport.fetch.mock.calls[0];
    expect(url).toBe('/api/dashboard/contracts/import');
    expect((init.body as FormData).get('action')).toBe('preview');
    expect(init.shopId).toBe('shop-1');
    expect(screen.getByText('Шалгах шаардлагатай')).toBeInTheDocument();
    expect(screen.getByText(/Нийт дүн 66,700,000 → 59,000,000/)).toBeInTheDocument();
    expect(screen.getByText('Файлд байхгүй — өөрчлөхгүй')).toBeInTheDocument();
    expect(screen.getByText('Байрны төлөв зөрүүтэй — импорт байрны төлөвийг өөрчлөхгүй')).toBeInTheDocument();
    expect(screen.getByText('Төлсөн дүн, үлдэгдлийг энэ импорт өөрчлөхгүй.')).toBeInTheDocument();
    expect(screen.getByText('Импортлохгүй багана: Банкны төлөв')).toBeInTheDocument();

    const confirm = screen.getByRole('button', { name: 'Батлах' });
    expect(confirm).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Дүн, төлөв өөрчлөгдөх гэрээг шалгасан' }));
    expect(confirm).toBeEnabled();
    fireEvent.click(confirm);

    expect(await screen.findByText('Хадгалсан')).toBeInTheDocument();
    const form = transport.fetch.mock.calls[1][1].body as FormData;
    expect(form.get('action')).toBe('commit');
    expect(form.get('planHash')).toBe('f'.repeat(64));
    expect(form.get('acceptReview')).toBe('true');
    expect(form.get('requestId')).toMatch(/^[0-9a-f-]{36}$/);
    expect(screen.getByRole('link', { name: 'Гэрээ харах' })).toHaveAttribute('href', '/dashboard/contracts');
    expect(screen.getByRole('link', { name: 'Өөрчлөлтийн түүх' })).toHaveAttribute('href', '/admin/history');
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['contracts'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['plan-performance'] });
});

it('disables «Батлах» for blocking conflicts and for files with nothing to change', async () => {
    transport.fetch.mockResolvedValueOnce(reply(200, preview({ review: [], counts: { insert: 0, insertCancelled: 0, update: 0, unchanged: 83, review: 0, blocking: 1, missing: 10 },
        blocking: [{ code: 'unit_taken', label: 'Б1-16', row: 3, message: 'Мөр 3: байранд өөр идэвхтэй гэрээ байна' }], canCommit: false, opsCount: 0 })));
    renderPage();
    await upload();
    expect(screen.getByText(/Батлах боломжгүй/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Батлах' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Болих' }));
    transport.fetch.mockResolvedValueOnce(reply(200, preview({ review: [], blocking: [], counts: { insert: 0, insertCancelled: 0, update: 0, unchanged: 83, review: 0, blocking: 0, missing: 10 }, canCommit: false, opsCount: 0 })));
    await upload();
    expect(screen.getByText('Бүгд хэвээр — өөрчлөх зүйлгүй.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Батлах' })).toBeDisabled();
});

it('lists every row error of a broken file and offers a re-check after a stale commit', async () => {
    transport.fetch.mockResolvedValueOnce(reply(400, { error: 'Файлд 2 алдаа байна — засаад дахин оруулна уу', errors: ['Мөр 3: «Нийт дүн» хоосон эсвэл 0', 'Мөр 9: Орон сууц Б1-999 байр олдсонгүй'] }));
    renderPage();
    fireEvent.change(screen.getByLabelText('Файл'), { target: { files: [new File(['x'], 'HUB.xlsx')] } });
    fireEvent.click(screen.getByRole('button', { name: 'Файл шалгах' }));
    const alert = await screen.findByText('Файлд 2 алдаа байна — засаад дахин оруулна уу');
    expect(within(alert.closest('[data-slot="alert"]') as HTMLElement).getByText('Мөр 9: Орон сууц Б1-999 байр олдсонгүй')).toBeInTheDocument();

    transport.fetch.mockResolvedValueOnce(reply(200, preview({ review: [] })))
        .mockResolvedValueOnce(reply(409, { error: 'Өгөгдөл өөрчлөгдсөн, дахин шалгана уу', code: 'stale_preview' }));
    fireEvent.click(screen.getByRole('button', { name: 'Файл шалгах' }));
    await screen.findByText('Файлын нийлбэр');
    fireEvent.click(screen.getByRole('button', { name: 'Батлах' }));
    expect(await screen.findByText('Өгөгдөл өөрчлөгдсөн, дахин шалгана уу')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Дахин шалгах' })).toBeEnabled());
});

it('requires confirming a file dated before the latest import', async () => {
    renderPage();
    await screen.findByText(/Сүүлийн импорт:/);
    fireEvent.change(screen.getByLabelText('Файлын огноо'), { target: { value: '2026-10-01' } });
    fireEvent.change(screen.getByLabelText('Файл'), { target: { files: [new File(['x'], 'HUB.xlsx')] } });
    expect(screen.getByText(/Хуучин файл хоцролт, төлвийг хуучин утгаар солино/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Файл шалгах' })).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Хуучин файлыг мэдсээр оруулж байна' }));
    expect(screen.getByRole('button', { name: 'Файл шалгах' })).toBeEnabled();
});
