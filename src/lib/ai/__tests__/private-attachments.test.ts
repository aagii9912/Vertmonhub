import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { canReadPrivateAttachment, parsePrivateAttachmentUrl, privateAttachmentUrl } from '../private-attachments';

const shopId = '00000000-0000-4000-8000-000000000001';
const userId = '00000000-0000-4000-8000-000000000002';
const fileId = '00000000-0000-4000-8000-000000000003';
const url = privateAttachmentUrl(`${shopId}/${userId}/${fileId}.pdf`);
const state = { rows: [] as {entity_type:string}[], error: null as null | Error };
const query = { select: () => query, eq: () => query, then: (resolve: (r: unknown) => unknown) => Promise.resolve({ data: state.rows, error: state.error }).then(resolve) };
const db = { from: vi.fn(() => query) } as unknown as SupabaseClient;
const access = (modules: string[], id = userId) => ({shopId,userId:id,perms:{role:'viewer',modules}});
beforeEach(() => { state.rows=[];state.error=null;vi.clearAllMocks(); });

describe('private attachment references and read permissions', () => {
    it('accepts canonical private references and rejects traversal, foreign origins and duplicate paths', () => {
        expect(parsePrivateAttachmentUrl(url)?.userId).toBe(userId);
        for (const bad of [`https://evil.example${url}`, '/api/dashboard/upload?path=../../secret.pdf', `${url}&path=anything`, `${url}&alias=1`, url.replaceAll('%2F', '/'), `${url}#fragment`]) expect(parsePrivateAttachmentUrl(bad)).toBeNull();
    });
    it('unlinked uploads are only readable by their uploader with AI permission', async () => {
        expect(await canReadPrivateAttachment(db,url,access(['ai-assistant']))).toBe(true);
        expect(await canReadPrivateAttachment(db,url,access(['contracts']))).toBe(false);
        expect(await canReadPrivateAttachment(db,url,access(['ai-assistant'],fileId))).toBe(false);
    });
    it('entity links require their module even for the original uploader', async () => {
        state.rows=[{entity_type:'contract'}];
        expect(await canReadPrivateAttachment(db,url,access(['contracts'],fileId))).toBe(true);
        expect(await canReadPrivateAttachment(db,url,access(['ai-assistant']))).toBe(false);
    });
    it('rejects foreign shops and fails closed on metadata errors', async () => {
        expect(await canReadPrivateAttachment(db,url,{...access(['ai-assistant']),shopId:fileId})).toBe(false);
        expect(db.from).not.toHaveBeenCalled();
        state.error=new Error('read failed');
        await expect(canReadPrivateAttachment(db,url,access(['ai-assistant']))).rejects.toThrow('read failed');
    });
});
