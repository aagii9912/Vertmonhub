// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { buildWeeklyFiles, type WeeklyFile } from '@/lib/dashboard/weekly-files';
import { WeeklyDataFiles } from './WeeklyDataFiles';

const range = { from: '2026-11-04', to: '2026-11-10' };

function open(files: WeeklyFile[] | undefined, access: { hub?: boolean; erp?: boolean } = { hub: true, erp: true }) {
    const query = { data: files ? { files } : undefined, isPending: false, error: files ? null : new Error('Сүлжээний алдаа') } as never;
    render(<WeeklyDataFiles query={query} range={range} canImportHub={!!access.hub} canImportErp={!!access.erp} />);
}
const row = (title: string) => screen.getByRole('heading', { name: title }).closest('li') as HTMLElement;

describe('weekly report: ERP files step', () => {
    it('asks for this week\'s contract list first and sends the user to its import page', () => {
        open(buildWeeklyFiles({ range, hub: { date: '2026-11-03', name: 'hub-11-03.xlsx', by: 'Ану' }, products: { date: '2026-10-05', name: 'Elysium ERP' }, sales: null }));
        expect(screen.getByRole('status')).toHaveTextContent('Шинэ файл хэрэгтэй: Гэрээний жагсаалт (HUB Excel).');
        const hub = row('Гэрээний жагсаалт (HUB Excel)');
        expect(hub).toHaveTextContent('Хуучин');
        expect(hub).toHaveTextContent('Сүүлийн файл 11-03-нийх — энэ долоо хоногийн (11-04–11-10) мэдээлэл ороогүй.');
        expect(hub).toHaveTextContent('hub-11-03.xlsx · оруулсан Ану');
        expect(within(hub).getByRole('link', { name: /Файл оруулах.*Гэрээний жагсаалт \(HUB Excel\)/ })).toHaveAttribute('href', '/dashboard/contracts/import');
        // Үлдэгдлийг HUB гэрээнээс тооцож байгаа тул хуучин бүтээгдэхүүний экспортыг шаардахгүй.
        const products = row('ERP бүтээгдэхүүний экспорт');
        expect(products).toHaveTextContent('Заавал биш');
        expect(products).not.toHaveTextContent('Хуучин');
        expect(within(products).getByRole('link', { name: /Файл оруулах.*ERP бүтээгдэхүүний экспорт/ })).toHaveAttribute('href', '/dashboard/reports/erp');
        // Нэг ч удаа оруулаагүй гэрээний экспортыг санал болгохгүй.
        expect(screen.queryByRole('heading', { name: 'ERP гэрээний экспорт' })).not.toBeInTheDocument();
    });

    it('confirms the week is covered once every needed file reaches the closing Tuesday', () => {
        open(buildWeeklyFiles({ range, hub: { date: '2026-11-10', name: null }, products: null, sales: null }));
        expect(screen.getByRole('status')).toHaveTextContent('Энэ долоо хоногийн файл орсон.');
        expect(row('Гэрээний жагсаалт (HUB Excel)')).toHaveTextContent('Энэ долоо хоногийнх');
    });

    it('shows who imports instead of a link the server would refuse', () => {
        open(buildWeeklyFiles({ range, hub: { date: '2026-11-03', name: null }, products: null, sales: null }), { hub: false, erp: false });
        expect(screen.queryByRole('link')).not.toBeInTheDocument();
        expect(screen.getAllByText('Файлыг удирдлага (импортын эрхтэй хүн) оруулна.')).toHaveLength(2);
    });

    it('never reports missing file data as an empty project', () => {
        open(undefined);
        expect(screen.getByText(/Файлын төлөвийг ачаалж чадсангүй\. Сүлжээний алдаа/)).toBeInTheDocument();
    });
});
