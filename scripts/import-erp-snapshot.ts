/**
 * ERP-ээр хөтөлдөг төслийн (Elysium Residence) сүүлийн бүтээгдэхүүний snapshot-оос (`erp_imports`)
 * блокийн байр (`property_units`) ба гэрээг (`property_contracts`) үүсгэнэ.
 *
 *   SHOP_ID=<uuid> npx tsx scripts/import-erp-snapshot.ts            # урьдчилсан шалгалт (юу ч бичихгүй)
 *   SHOP_ID=<uuid> npx tsx scripts/import-erp-snapshot.ts --apply    # бичнэ
 *
 * Зөвхөн шинэ мөр нэмнэ: бүртгэлтэй байр, гэрээг өөрчлөхгүй (дахин ажиллуулахад давхардахгүй).
 * Байрны дүрэм `mapInventoryRows`, гэрээний дүрэм `contractsFromErpProducts` (төлсөн дүн, дугаар, огноо NULL).
 * Нэг ч мөр алдаатай бол юу ч бичихгүй.
 */

import * as path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { mapInventoryRows } from '../src/lib/admin/import/units';
import { importInventoryUnits } from '../src/lib/admin/import/units-import';
import { contractsFromErpProducts } from '../src/lib/erp/product-contracts';
import { isProductsDataset } from '../src/lib/erp/records';
import { listErpSnapshots } from '../src/lib/erp/snapshots';
import type { ErpDataset } from '../src/lib/erp/import';
import { soleShopProjectId } from '../src/lib/projects/shop-project';
import { fetchAllRows } from '../src/lib/utils/pagination';

const usage = 'SHOP_ID=<uuid> npx tsx scripts/import-erp-snapshot.ts [--apply]';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function count<T>(rows: T[], key: (row: T) => string) {
    return rows.reduce<Record<string, number>>((acc, row) => ({ ...acc, [key(row)]: (acc[key(row)] ?? 0) + 1 }), {});
}

async function main() {
    const args = process.argv.slice(2);
    if (args.some(arg => arg !== '--apply') || args.length > 1) throw new Error(`Ашиглах команд: ${usage}`);
    const apply = args.includes('--apply');

    // Do not overwrite the caller's credentials or proxy settings.
    dotenv.config({ path: path.resolve(__dirname, '../.env.local'), quiet: true });
    const shopId = process.env.SHOP_ID;
    if (!shopId || !uuid.test(shopId)) throw new Error('SHOP_ID UUID утгыг ил тод тохируулна уу');
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceKey) throw new Error('Supabase URL болон service-role тохиргоо шаардлагатай');
    const db = createClient(supabaseUrl, serviceKey, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });

    const projectId = await soleShopProjectId(db, shopId);
    if (!projectId) throw new Error('Энэ shop-д ганц төсөл алга (shop = төсөл)');
    const { data: project, error: projectError } = await db.from('projects').select('id, name').eq('id', projectId).single();
    if (projectError) throw new Error(`Төсөл уншиж чадсангүй: ${projectError.message}`);

    const meta = (await listErpSnapshots(db, shopId, '9999-12-31')).find(snapshot => snapshot.kind === 'products');
    if (!meta) throw new Error('Энэ төсөлд ERP-ийн бүтээгдэхүүний snapshot алга');
    const { data: snapshot, error: snapshotError } = await db.from('erp_imports')
        .select('file_name, datasets').eq('id', meta.id).eq('shop_id', shopId).single();
    if (snapshotError) throw new Error(`Snapshot уншиж чадсангүй: ${snapshotError.message}`);
    const rows = ((snapshot.datasets ?? []) as ErpDataset[]).filter(isProductsDataset).flatMap(dataset => dataset.rows);
    const context = {
        shopId, projectId, projectName: project.name as string,
        sourceFile: (snapshot.file_name as string | null) || meta.source, reportDate: meta.report_date,
    };
    const header = { mode: apply ? 'apply' : 'dry-run', project: project.name, snapshot: `${context.sourceFile} (${meta.report_date})`, rows: rows.length };

    const units = mapInventoryRows(rows, context);
    const contracts = contractsFromErpProducts(rows, context);
    if (units.errors.length || contracts.errors.length) {
        console.error(JSON.stringify({ ...header, success: false, errors: [...units.errors, ...contracts.errors].slice(0, 50) }, null, 2));
        process.exitCode = 1;
        return;
    }

    const existing = await fetchAllRows<{ product_type: string; unit_label: string | null }>((from, to) => db.from('property_contracts')
        .select('product_type, unit_label').eq('shop_id', shopId).is('deleted_at', null).order('id').range(from, to));
    const taken = new Set(existing.map(row => JSON.stringify([row.product_type, row.unit_label])));
    const freshContracts = contracts.contracts.filter(row => !taken.has(JSON.stringify([row.product_type, row.unit_label])));
    const contractSummary = {
        derived: contracts.contracts.length, fresh: freshContracts.length, existing: contracts.contracts.length - freshContracts.length,
        byType: count(freshContracts, row => row.product_type), byStatus: count(freshContracts, row => row.contract_status),
        byChannel: count(freshContracts, row => row.sales_channel ?? '—'),
    };

    const unitResult = await importInventoryUnits(db, units.rows, !apply);
    if (!unitResult.success || !apply) {
        console.log(JSON.stringify({ ...header, units: { ...unitResult, summary: units.summary }, contracts: contractSummary }, null, 2));
        if (!unitResult.success) process.exitCode = 1;
        return;
    }

    let inserted = 0;
    if (freshContracts.length) {
        // Нэг INSERT: аль нэг мөр унавал бүх гэрээ буцна.
        const { error, count: insertedCount } = await db.from('property_contracts').insert(freshContracts, { count: 'exact' });
        if (error) throw new Error(`Гэрээ хадгалж чадсангүй (байр хадгалагдсан): ${error.message}`);
        inserted = insertedCount ?? freshContracts.length;
    }
    const { error: auditError } = await db.from('admin_audit_log').insert({
        actor_id: null, action: 'erp.snapshot_import', target_id: shopId,
        meta: { snapshot_id: meta.id, report_date: meta.report_date, units_imported: unitResult.imported, contracts_imported: inserted },
    });
    console.log(JSON.stringify({
        ...header, units: unitResult, contracts: { ...contractSummary, inserted },
        ...(auditError ? { warning: `Audit бичигдсэнгүй: ${auditError.message}` } : {}),
    }, null, 2));
}

main().catch(error => {
    console.error(error instanceof Error ? error.message : 'Импортын тодорхойгүй алдаа');
    process.exitCode = 1;
});
