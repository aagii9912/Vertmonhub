/**
 * Import a real Elysium ERP product export into property_units (block inventory).
 * Dry-run by default; existing units, listings and AI knowledge are preserved.
 * XLSX/CSV/TSV files are supported. Supply the actual file; no unit count is assumed.
 *
 * Required environment (existing process values override .env.local):
 *   SHOP_ID, ELYSIUM_PROJECT_ID, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 * Preview (read-only):
 *   npx tsx scripts/import-elysium-b1-units.ts /path/to/elysium-products.xlsx
 * Apply after reviewing the preview:
 *   npx tsx scripts/import-elysium-b1-units.ts /path/to/elysium-products.xlsx --apply
 * For a multi-sheet workbook, explicitly select the product sheet:
 *   npx tsx scripts/import-elysium-b1-units.ts /path/to/export.xlsx --sheet=Products
 *
 * Missing phase columns use the validated project name. Missing block columns
 * use the explicitly selected Б1 block; blank cells in existing columns fail.
 * New units are inserted together; matching existing units are never updated.
 */

import { readFile } from 'node:fs/promises';
import * as path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { readWorkbookSheets } from '../src/lib/utils/xlsx';
import { mapInventoryRows } from '../src/lib/admin/import/units';
import { importInventoryUnits } from '../src/lib/admin/import/units-import';

const usage = 'npx tsx scripts/import-elysium-b1-units.ts <product-export.xlsx|csv|tsv> [--sheet=<name>] [--apply]';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function main() {
    const args = process.argv.slice(2);
    if (args.length === 1 && ['--help', '-h'].includes(args[0])) {
        console.log(usage);
        console.log('SHOP_ID болон ELYSIUM_PROJECT_ID заавал тохируулна. --apply байхгүй бол зөвхөн урьдчилсан шалгалт хийнэ.');
        return;
    }
    const fileArgs = args.filter(argument => !argument.startsWith('--'));
    const sheetArgs = args.filter(argument => argument.startsWith('--sheet='));
    const unknown = args.filter(argument => argument.startsWith('--') && argument !== '--apply' && !argument.startsWith('--sheet='));
    if (fileArgs.length !== 1 || sheetArgs.length > 1 || unknown.length || args.filter(argument => argument === '--apply').length > 1) {
        throw new Error(`Ашиглах команд: ${usage}`);
    }
    const apply = args.includes('--apply');
    const sheetName = sheetArgs[0]?.slice('--sheet='.length).trim();
    if (sheetArgs.length && !sheetName) throw new Error('--sheet=<name> утга хоосон байна');

    // Do not overwrite the caller's credentials or proxy settings.
    dotenv.config({ path: path.resolve(__dirname, '../.env.local'), quiet: true });
    const shopId = process.env.SHOP_ID;
    const projectId = process.env.ELYSIUM_PROJECT_ID;
    if (!shopId || !projectId || !uuid.test(shopId) || !uuid.test(projectId)) {
        throw new Error('SHOP_ID болон ELYSIUM_PROJECT_ID UUID утгуудыг ил тод тохируулна уу');
    }
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceKey) throw new Error('Supabase URL болон service-role тохиргоо шаардлагатай');

    const filePath = path.resolve(fileArgs[0]);
    if (!['.xlsx', '.csv', '.tsv'].includes(path.extname(filePath).toLowerCase())) {
        throw new Error('Бүтээгдэхүүний .xlsx, .csv эсвэл .tsv экспорт сонгоно уу');
    }
    const buffer = await readFile(filePath);
    if (buffer.byteLength > 4 * 1024 * 1024) throw new Error('Файл 4 MiB-аас ихгүй байна');
    const sheets = await readWorkbookSheets(buffer);
    if (!sheetName && sheets.length !== 1) {
        throw new Error('Олон sheet бүхий файлд --sheet=<name> ашиглан бүтээгдэхүүний sheet-ийг сонгоно уу');
    }
    const sheet = sheetName ? sheets.find(candidate => candidate.name === sheetName) : sheets[0];
    if (!sheet) throw new Error('Сонгосон бүтээгдэхүүний sheet олдсонгүй');
    if (sheet.rows.length > 20000) throw new Error('Нэг импорт 20,000 мөрөөс ихгүй байна');

    const db = createClient(supabaseUrl, serviceKey, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const { data: project, error } = await db.from('projects')
        .select('id, shop_id, name')
        .eq('id', projectId)
        .eq('shop_id', shopId)
        .maybeSingle();
    if (error) throw new Error(`Төслийн холбоос шалгах боломжгүй: ${error.message}`);
    if (!project || project.name !== 'Elysium Residence') {
        throw new Error('ELYSIUM_PROJECT_ID нь SHOP_ID байгууллагын Elysium Residence төсөлтэй таарахгүй байна');
    }

    const mapped = mapInventoryRows(sheet.rows, {
        shopId: project.shop_id, projectId: project.id, projectName: project.name,
        sourceFile: path.basename(filePath), block: 'Б1',
    });
    if (mapped.errors.length) {
        console.error(JSON.stringify({ success: false, mode: apply ? 'apply' : 'dry-run', errors: mapped.errors, summary: mapped.summary }, null, 2));
        process.exitCode = 1;
        return;
    }
    const result = await importInventoryUnits(db, mapped.rows, !apply);
    console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', project: project.name, sheet: sheet.name, ...result }, null, 2));
    if (!result.success) process.exitCode = 1;
}

main().catch(error => {
    console.error(error instanceof Error ? error.message : 'Импортын тодорхойгүй алдаа');
    process.exitCode = 1;
});
