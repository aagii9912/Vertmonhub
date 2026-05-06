import * as XLSX from 'xlsx';
import mammoth from 'mammoth';
import { logger } from '@/lib/utils/logger';

export interface ParsedProduct {
    name: string;
    price: number;
    description?: string;
    stock?: number;
    type?: 'physical' | 'service';
    colors?: string[];
    sizes?: string[];
}

/**
 * Parse Excel file (xlsx, xls, csv)
 */
export async function parseExcel(buffer: Buffer): Promise<ParsedProduct[]> {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];

    // Convert to JSON

    const data = XLSX.utils.sheet_to_json<Record<string, any>>(sheet);

    // Try to detect column names
    const products: ParsedProduct[] = [];

    for (const row of data) {
        // Try different column name variations
        const name = row['Нэр'] || row['name'] || row['Name'] || row['Бүтээгдэхүүн'] || row['Product'] || '';
        const price = parseFloat(row['Үнэ'] || row['price'] || row['Price'] || row['Үнэ (₮)'] || 0);
        const description = row['Тайлбар'] || row['description'] || row['Description'] || row['Дэлгэрэнгүй'] || '';
        const stock = parseInt(row['Тоо'] || row['stock'] || row['Stock'] || row['Үлдэгдэл'] || row['Qty'] || 0);
        const type = row['Төрөл'] || row['type'] || row['Type'] || 'physical';

        // Parse colors and sizes if they exist
        const colorsRaw = row['Өнгө'] || row['colors'] || row['Colors'] || '';
        const sizesRaw = row['Хэмжээ'] || row['sizes'] || row['Sizes'] || '';

        const colors = colorsRaw ? String(colorsRaw).split(',').map((c: string) => c.trim()).filter(Boolean) : [];
        const sizes = sizesRaw ? String(sizesRaw).split(',').map((s: string) => s.trim()).filter(Boolean) : [];

        if (name && price > 0) {
            products.push({
                name: String(name).trim(),
                price,
                description: String(description).trim() || undefined,
                stock: isNaN(stock) ? 0 : stock,
                type: type === 'service' ? 'service' : 'physical',
                colors: colors.length > 0 ? colors : undefined,
                sizes: sizes.length > 0 ? sizes : undefined,
            });
        }
    }

    return products;
}

/**
 * Parse DOCX file
 * Expected format: 
 * - Each product on a new line
 * - Format: "Нэр - Үнэ₮ - Тайлбар"
 * - Or table format
 */
export async function parseDocx(buffer: Buffer): Promise<ParsedProduct[]> {
    const result = await mammoth.extractRawText({ buffer });
    const text = result.value;

    const products: ParsedProduct[] = [];
    const lines = text.split('\n').filter(line => line.trim());

    for (const line of lines) {
        // Try to parse "Name - Price - Description" format
        const parts = line.split(/[-–—]/).map(p => p.trim());

        if (parts.length >= 2) {
            const name = parts[0];
            // Extract price from second part (remove ₮, etc)
            const priceMatch = parts[1].match(/[\d,]+/);
            const price = priceMatch ? parseFloat(priceMatch[0].replace(/,/g, '')) : 0;
            const description = parts.slice(2).join(' - ').trim() || undefined;

            if (name && price > 0) {
                products.push({
                    name,
                    price,
                    description,
                    stock: 0,
                    type: 'physical',
                });
            }
        }
    }

    return products;
}

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
export function parseHubspotContacts(buffer: Buffer): ParsedHubspotContact[] {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) return [];

    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: '' });

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

/**
 * Detect file type and parse accordingly
 */
/**
 * Get file content as text for AI processing
 */
async function getFileContent(buffer: Buffer, extension: string): Promise<string> {
    if (['xlsx', 'xls', 'csv'].includes(extension)) {
        const workbook = XLSX.read(buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        // Use CSV format for better token efficiency with LLMs
        return XLSX.utils.sheet_to_csv(workbook.Sheets[sheetName]);
    } else if (extension === 'docx') {
        const result = await mammoth.extractRawText({ buffer });
        return result.value;
    }
    throw new Error(`Unsupported file format: ${extension}`);
}

/**
 * Parse file using AI (GPT) to extract products and services
 */
export async function parseProductFile(buffer: Buffer, fileName: string): Promise<ParsedProduct[]> {
    const extension = fileName.toLowerCase().split('.').pop() || '';

    try {
        // 1. Get text content
        const content = await getFileContent(buffer, extension);

        // 2. Process with Gemini AI
        const { GoogleGenerativeAI } = await import('@google/generative-ai');
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
        const model = genAI.getGenerativeModel({
            model: 'gemini-2.5-flash',
            generationConfig: { temperature: 0.2, responseMimeType: 'application/json' },
        });

        const prompt = `Parse the following file content and extract products/services as JSON array.
Each item should have: name (string), price (number), stock (number), description (string), type ("physical" or "service"), unit (string), colors (string[]), sizes (string[]).
File: ${fileName}
Content:
${content}`;

        const result = await model.generateContent(prompt);
        const products: Array<{ name: string; price: number; stock: number; description: string; type: 'physical' | 'service'; colors: string[]; sizes: string[] }> = JSON.parse(result.response.text());

        // 3. Map to ParsedProduct interface
        return products.map((p: { name: string; price: number; description?: string; stock?: number; type?: 'physical' | 'service'; colors?: string[]; sizes?: string[] }) => ({
            name: p.name,
            price: p.price,
            description: p.description,
            stock: p.stock,
            type: p.type,
            colors: p.colors,
            sizes: p.sizes
        }));
    } catch (error) {
        logger.error('AI Parsing failed, falling back to rule-based:', { error });
        // Fallback to old methods if AI fails
        if (['xlsx', 'xls', 'csv'].includes(extension)) {
            return parseExcel(buffer);
        } else if (extension === 'docx') {
            return parseDocx(buffer);
        }
        throw error;
    }
}
