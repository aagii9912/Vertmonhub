// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PRIVATE_ATTACHMENT_BUCKET, privateAttachmentUrl } from '@/lib/ai/private-attachments';
import { toResponseInput } from '@/lib/ai/openai/responses';

const state = vi.hoisted(() => ({
    rows: [] as Array<{ entity_type: string }>,
    metadataError: null as Error | null,
    downloadError: null as Error | null,
    file: null as Blob | null,
}));
vi.mock('@/lib/supabase', () => ({ supabaseAdmin: () => db }));
vi.mock('@/lib/ai/data-assistant', () => ({ executeDataTool: vi.fn() }));

const query = {
    select: () => query,
    eq: () => query,
    then: (resolve: (result: { data: typeof state.rows; error: typeof state.metadataError }) => unknown) =>
        Promise.resolve({ data: state.rows, error: state.metadataError }).then(resolve),
};
const download = vi.fn(async () => ({ data: state.file, error: state.downloadError }));
const db = { from: vi.fn(() => query), storage: { from: vi.fn(() => ({ download })) } };

import { buildUserContent } from '../loop';

const shopId = '10000000-0000-4000-8000-000000000001';
const userId = '10000000-0000-4000-8000-000000000002';
const otherId = '10000000-0000-4000-8000-000000000003';
const fileId = '10000000-0000-4000-8000-000000000004';
const path = `${shopId}/${userId}/${fileId}.pdf`;
const url = privateAttachmentUrl(path);
const attachment = { url, name: 'synthetic-contract.pdf', mimeType: 'application/pdf' };
const access = { shopId, userId, perms: { role: 'sales_manager', modules: ['ai-assistant', 'contracts'] } };
const modelInput = (content: Awaited<ReturnType<typeof buildUserContent>>) => toResponseInput([{ role: 'user', content }]);

beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetch).mockReset();
    state.rows = []; state.metadataError = null; state.downloadError = null;
    state.file = new Blob(['SYNTHETIC PDF BYTES'], { type: 'application/pdf' });
});

describe('private attachments in model input', () => {
    it('downloads an authorized upload from private Storage and sends inline PDF bytes to the model', async () => {
        const content = await buildUserContent('Файлыг унш', [attachment], access);
        expect(db.storage.from).toHaveBeenCalledExactlyOnceWith(PRIVATE_ATTACHMENT_BUCKET);
        expect(download).toHaveBeenCalledExactlyOnceWith(path);
        expect(fetch).not.toHaveBeenCalled();
        expect(modelInput(content)).toEqual([{ role: 'user', content: [
            { type: 'input_file', filename: 'attachment.pdf', file_data: `data:application/pdf;base64,${Buffer.from('SYNTHETIC PDF BYTES').toString('base64')}` },
            { type: 'input_text', text: expect.stringContaining(url) },
        ] }]);
    });

    it('allows a linked contract file for another member with contract permission', async () => {
        state.rows = [{ entity_type: 'contract' }];
        const content = await buildUserContent('Файлыг унш', [attachment], { ...access, userId: otherId });
        expect(download).toHaveBeenCalledExactlyOnceWith(path);
        expect(content[0]).toMatchObject({ type: 'document', source: { type: 'base64' } });
    });

    it('excludes a linked contract file when its original uploader loses contract permission', async () => {
        state.rows = [{ entity_type: 'contract' }];
        const content = await buildUserContent('Файлыг унш', [attachment], { ...access, perms: { role: 'viewer', modules: ['ai-assistant'] } });
        expect(content).toEqual([{ type: 'text', text: 'Файлыг унш' }]);
        expect(JSON.stringify(modelInput(content))).not.toContain(url);
        expect(db.storage.from).not.toHaveBeenCalled();
        expect(fetch).not.toHaveBeenCalled();
    });

    it.each(['no-context', 'foreign-shop', 'other-uploader'] as const)('rejects %s before any Storage download or fetch', async condition => {
        const context = condition === 'no-context' ? undefined
            : condition === 'foreign-shop' ? { ...access, shopId: otherId } : { ...access, userId: otherId };
        const content = await buildUserContent('Файлыг унш', [attachment], context);
        expect(content).toEqual([{ type: 'text', text: 'Файлыг унш' }]);
        expect(JSON.stringify(modelInput(content))).not.toContain(url);
        expect(db.storage.from).not.toHaveBeenCalled();
        expect(fetch).not.toHaveBeenCalled();
        if (condition !== 'other-uploader') expect(db.from).not.toHaveBeenCalled();
    });

    it('fails closed on metadata errors without passing the denied URL to model input', async () => {
        state.metadataError = new Error('Synthetic metadata error');
        const content = await buildUserContent('Файлыг унш', [attachment], access);
        expect(content).toEqual([{ type: 'text', text: 'Файлыг унш' }]);
        expect(db.storage.from).not.toHaveBeenCalled();
        expect(fetch).not.toHaveBeenCalled();
    });

    it.each(['mime-mismatch', 'storage-error'] as const)('excludes a private download with %s from model input', async condition => {
        if (condition === 'mime-mismatch') state.file = new Blob(['fixture'], { type: 'image/png' });
        else state.downloadError = new Error('Synthetic storage error');
        const content = await buildUserContent('Файлыг унш', [attachment], access);
        expect(content).toEqual([{ type: 'text', text: 'Файлыг унш' }]);
        expect(JSON.stringify(modelInput(content))).not.toContain(url);
        expect(fetch).not.toHaveBeenCalled();
    });

    it('lists an authorized ERP spreadsheet for import_erp_file without sending its bytes', async () => {
        const sheet = { url: privateAttachmentUrl(`${shopId}/${userId}/${fileId}.xlsx`), name: 'ERP.xlsx', mimeType: 'application/vnd.ms-excel' };
        const content = await buildUserContent('Импортлоорой', [sheet], access);
        expect(download).not.toHaveBeenCalled();
        expect(content).toEqual([{ type: 'text', text: expect.stringContaining(`ERP.xlsx — ${sheet.url} (application/vnd.openxmlformats-officedocument.spreadsheetml.sheet)`) }]);
        expect(JSON.stringify(content)).toContain('import_erp_file');
        state.metadataError = new Error('Synthetic metadata error');
        expect(await buildUserContent('Импортлоорой', [sheet], access)).toEqual([{ type: 'text', text: 'Импортлоорой' }]);
    });

    it('rejects foreign URLs without server fetching or including them in model content', async () => {
        const foreign = { ...attachment, url: 'http://169.254.169.254/latest/meta-data' };
        expect(await buildUserContent('Файлыг унш', [foreign], access)).toEqual([{ type: 'text', text: 'Файлыг унш' }]);
        expect(db.from).not.toHaveBeenCalled();
        expect(db.storage.from).not.toHaveBeenCalled();
        expect(fetch).not.toHaveBeenCalled();
    });
});
