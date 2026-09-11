import { readSheetRows, XlsxSheetNotFoundError } from '@/lib/utils/xlsx';

/**
 * Файл задлагч — зөвхөн HubSpot контактын экспорт (CSV/XLSX).
 *
 * Хуучин e-commerce `parseProductFile` / `parseExcel` / `parseDocx` (mammoth) — 2026-09 Wave 2-т
 * `/api/shop/import`-той хамт устгагдсан (CLAUDE.md «Recently Removed»).
 */

export interface ParsedHubspotContact {
    name: string;
    email: string | null;
    phone: string | null;
    notes: string | null;
    tags: string[];
}

function pick(row: Record<string, any>, keys: string[]): string {
    for (const k of keys) {
        if (row[k] !== undefined && row[k] !== null && String(row[k]).trim() !== '') {
            return String(row[k]).trim();
        }
    }
    return '';
}

/**
 * Parse a HubSpot contacts CSV/XLSX export.
 * Tolerant to common column-name variations (English + Mongolian).
 */
export async function parseHubspotContacts(buffer: Buffer): Promise<ParsedHubspotContact[]> {
    let rows: Record<string, any>[];
    try {
        rows = await readSheetRows(buffer, 0, { defval: '' });
    } catch (error) {
        if (error instanceof XlsxSheetNotFoundError) return [];
        throw error;
    }

    const contacts: ParsedHubspotContact[] = [];

    for (const row of rows) {
        const firstName = pick(row, ['First Name', 'first name', 'firstname', 'FirstName']);
        const lastName = pick(row, ['Last Name', 'last name', 'lastname', 'LastName']);
        const fullName = pick(row, ['Name', 'Full Name', 'Contact Name']);
        const name = (fullName || `${firstName} ${lastName}`).trim();

        const email = pick(row, ['Email', 'email', 'E-mail', 'Email Address']) || null;
        const phone = pick(row, ['Phone Number', 'Phone', 'phone', 'Mobile', 'Mobile Phone']) || null;

        const lifecycle = pick(row, ['Lifecycle Stage', 'lifecycle_stage']);
        const leadStatus = pick(row, ['Lead Status', 'lead_status']);
        const company = pick(row, ['Company Name', 'Company', 'company']);
        const ownerName = pick(row, ['Contact Owner', 'Owner']);
        const createDate = pick(row, ['Create Date', 'Created Date', 'created_at']);
        const noteRaw = pick(row, ['Notes', 'notes', 'Description']);

        const noteParts: string[] = [];
        if (noteRaw) noteParts.push(noteRaw);
        if (createDate) noteParts.push(`[HubSpot import: ${createDate}]`);
        if (company) noteParts.push(`Company: ${company}`);
        if (ownerName) noteParts.push(`Owner: ${ownerName}`);

        const tags: string[] = ['source:hubspot'];
        if (lifecycle) tags.push(`lifecycle:${lifecycle.toLowerCase().replace(/\s+/g, '_')}`);
        if (leadStatus) tags.push(`status:${leadStatus.toLowerCase().replace(/\s+/g, '_')}`);

        if (!name && !email && !phone) {
            continue; // Skip rows with no identifying info
        }

        contacts.push({
            name: name || (email ? email.split('@')[0] : 'Unnamed Contact'),
            email,
            phone,
            notes: noteParts.length > 0 ? noteParts.join('\n') : null,
            tags,
        });
    }

    return contacts;
}
