#!/usr/bin/env node
/**
 * Shop = төсөл: нэг shop дотор дэд төсөл болж байгаа төслүүдийг тусдаа shop болгон салгана.
 *
 *   node scripts/migrate-project-shops.mjs            # dry-run: зөвхөн уншиж төлөвлөгөө хэвлэнэ
 *   node scripts/migrate-project-shops.mjs --apply    # нэг гүйлгээнд хийж, дараа нь шалгана
 *
 * DATABASE_URL-ийг .env.local-аас уншина (production). Migration 20261004130000_project_shops.sql
 * эхэлж орсон байх ёстой. Ямар нэг шалгалт таарахгүй бол гүйлгээ бүхэлдээ буцна.
 *
 * Хийх зүйл (төсөл тус бүрд):
 *   1. Төслийн нэртэй шинэ shop үүсгэж, төслийн мөрийг түүн рүү зөөнө.
 *   2. project_id-аар холбогдсон бизнес мөрүүд (лид, байр, гэрээ, маркетинг, newsletter, ERP төсөв…)
 *      болон лидийн дагалдах мөрүүд (үйлдэл, уулзалт, attribution) shop-оо дагана.
 *   3. Тухайн төслийн ERP snapshot, AI FAQ-ийг (нэрээр нь) шинэ shop руу зөөнө.
 *   4. Удирдлага, маркетингийн (super_admin/admin/marketing) гишүүнчлэлийг хуулна.
 *      Борлуулалтын менежерийг админ «Хэрэглэгчид → Төслүүд»-ээс нэмнэ.
 * Мөн үлдэх төслийн shop-ийн төсөлгүй байр, гэрээг тэр ганц төсөлд холбоно (shop = төсөл).
 * Лидийн төсөл/менежерийг таахгүй: төсөлгүй хуучин лид хэвээр үлдэж тайланд тусад нь харагдана.
 */
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(root, 'package.json'));
const { Client } = require('pg');
const { planProjectShopSplit, printProjectShopSplit, applyProjectShopSplit } = await import('./lib/project-shop-split.mjs');

const APPLY = process.argv.includes('--apply');

function databaseUrl() {
    const env = readFileSync(path.join(root, '.env.local'), 'utf8');
    const match = env.match(/^DATABASE_URL=(.*)$/m);
    if (!match) throw new Error('.env.local дотор DATABASE_URL алга');
    return match[1].trim().replace(/^["']|["']$/g, '');
}

const client = new Client({ connectionString: databaseUrl(), ssl: { rejectUnauthorized: false } });
await client.connect();
try {
    if (!APPLY) await client.query('SET default_transaction_read_only = on');
    const result = await planProjectShopSplit(client, { apply: APPLY });
    printProjectShopSplit(result, APPLY);
    if (!APPLY) {
        console.log('\nDry-run дууслаа. Бичихийн тулд: node scripts/migrate-project-shops.mjs --apply');
    } else {
        const receipt = await applyProjectShopSplit(client, result);
        console.log('\nАмжилттай. Баримт:');
        console.log(JSON.stringify(receipt, null, 2));
    }
} finally {
    await client.end();
}
