import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

export const PRIVATE_ATTACHMENT_BUCKET = 'ai-attachments';
export const ATTACHMENT_MODULES: Record<string, string> = {
    property: 'properties', lead: 'leads', customer: 'customers', contract: 'contracts',
};
const EXTENSIONS = new Set(['jpg', 'png', 'webp', 'gif', 'pdf']);
const ENDPOINT = '/api/dashboard/upload';

export function privateAttachmentUrl(path: string): string {
    return `${ENDPOINT}?path=${encodeURIComponent(path)}`;
}

export function parsePrivateAttachmentUrl(value: unknown): { path: string; shopId: string; userId: string } | null {
    if (typeof value !== 'string' || !value.startsWith(`${ENDPOINT}?`)) return null;
    const url = new URL(value, 'https://attachment.invalid');
    if (url.pathname !== ENDPOINT || url.hash || url.searchParams.getAll('path').length !== 1) return null;
    const path = url.searchParams.get('path') || '';
    const parts = path.split('/');
    if (parts.length !== 3 || !z.uuid().safeParse(parts[0]).success || !z.uuid().safeParse(parts[1]).success) return null;
    const [id, ext, extra] = parts[2].split('.');
    if (extra !== undefined || !z.uuid().safeParse(id).success || !EXTENSIONS.has(ext)) return null;
    // Metadata uses this exact URL as its key; aliases must not appear unlinked.
    if (value !== privateAttachmentUrl(path)) return null;
    return { path, shopId: parts[0], userId: parts[1] };
}

export function isLegacyPublicAttachmentUrl(value: string): boolean {
    const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
    if (!base) return false;
    try {
        const url = new URL(value);
        const source = new URL(base);
        return url.protocol === 'https:' && url.origin === source.origin
            && ['/storage/v1/object/public/products/', '/storage/v1/object/public/property-images/'].some(prefix => url.pathname.startsWith(prefix));
    } catch { return false; }
}

export interface AttachmentAccess {
    shopId: string;
    userId: string;
    perms: { role: string; modules?: string[] };
}

/** Membership is checked by the caller; a saved entity link determines module access. */
export async function canReadPrivateAttachment(db: SupabaseClient, value: string, access: AttachmentAccess): Promise<boolean> {
    const parsed = parsePrivateAttachmentUrl(value);
    if (!parsed || parsed.shopId !== access.shopId) return false;
    const { data, error } = await db.from('ai_attachments').select('entity_type')
        .eq('shop_id', access.shopId).eq('url', privateAttachmentUrl(parsed.path));
    if (error) throw error;
    const canReadModule = (module: string) => access.perms.role === 'super_admin' || !!access.perms.modules?.includes(module);
    if (data?.length) return data.some(row => Object.hasOwn(ATTACHMENT_MODULES, row.entity_type) && canReadModule(ATTACHMENT_MODULES[row.entity_type]));
    return parsed.userId === access.userId && canReadModule('ai-assistant');
}
