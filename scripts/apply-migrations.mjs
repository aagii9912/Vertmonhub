#!/usr/bin/env node
/**
 * Батлагдсан migration-уудыг production-д оруулна (CLAUDE.md: node + pg, файл бүр нэг гүйлгээнд,
 * хувилбарыг supabase_migrations.schema_migrations-д бүртгэнэ).
 *
 *   node scripts/apply-migrations.mjs 20261004160000 20261004165000           # шалгах (зөвхөн уншина)
 *   node scripts/apply-migrations.mjs 20261004160000 20261004165000 --apply   # оруулах
 *
 * Хүрээ (эхлэл, төгсгөл орно) заавал: түүнээс гадуурх файлд хүрэхгүй — хуучин зарим файл бүртгэлгүй
 * байж болох тул «бүртгэлгүй бүгдийг» хэзээ ч оруулахгүй. Бүртгэгдсэн хувилбарыг алгасна; нэг файл
 * алдаа өгвөл тэр файл бүхэлдээ буцаж, дараагийнх нь эхлэхгүй.
 *
 * DATABASE_URL-ийг орчноос, байхгүй бол .env.local-аас уншина. `--dir=<зам>` нь зөвхөн туршилтад.
 */
import { createRequire } from 'node:module';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(root, 'package.json'));
const { Client } = require('pg');

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const dirArg = args.find((arg) => arg.startsWith('--dir='));
const dir = dirArg ? path.resolve(dirArg.slice('--dir='.length)) : path.join(root, 'supabase', 'migrations');
const [from, to] = args.filter((arg) => /^\d{14}$/.test(arg));

// Энэ хувилбаруудын оруулсны дараах шалгалт (объект бий эсэх). Бусад хувилбарт шалгалтгүй.
const VERIFY = {
    '20261004160000': `SELECT to_regclass('public.contract_transfers') IS NOT NULL
        AND to_regprocedure('public.transfer_contract(uuid,uuid,jsonb,uuid,uuid,text,text)') IS NOT NULL AS ok`,
    '20261004161000': `SELECT to_regclass('public.lead_categories') IS NOT NULL
        AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'leads' AND column_name = 'category_id') AS ok`,
    '20261004162000': `SELECT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.lead_activities'::regclass AND contype = 'c'
        AND pg_get_constraintdef(oid) LIKE '%quote%') AS ok`,
    '20261004163000': `SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'service_logs' AND column_name = 'manager_name')
        AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'sales_kpi_months' AND column_name = 'daily') AS ok`,
    '20261004164000': `SELECT to_regclass('public.external_lead_sync') IS NOT NULL AND to_regclass('public.external_lead_imports') IS NOT NULL AS ok`,
    '20261004165000': `SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'user_profiles' AND column_name = 'phone') AS ok`,
};

function databaseUrl() {
    if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
    const file = path.join(root, '.env.local');
    if (!existsSync(file)) throw new Error('DATABASE_URL алга (.env.local эсвэл орчны хувьсагч)');
    const match = readFileSync(file, 'utf8').match(/^DATABASE_URL=(.*)$/m);
    if (!match) throw new Error('.env.local дотор DATABASE_URL алга');
    return match[1].trim().replace(/^["']|["']$/g, '');
}

function sslFor(url) {
    const host = new URL(url).hostname;
    return host === 'localhost' || host === '127.0.0.1' || /sslmode=disable/.test(url) ? false : { rejectUnauthorized: false };
}

if (!from || !to || from > to) {
    console.error('Хэрэглээ: node scripts/apply-migrations.mjs <эхлэх хувилбар> <төгсгөл хувилбар> [--apply]');
    process.exit(2);
}

const files = readdirSync(dir)
    .filter((name) => /^\d{14}_.+\.sql$/.test(name))
    .map((name) => ({ version: name.slice(0, 14), name: name.slice(15, -4), file: path.join(dir, name) }))
    .filter((m) => m.version >= from && m.version <= to)
    .sort((a, b) => a.version.localeCompare(b.version));
if (!files.length) {
    console.error(`${from}–${to} хүрээнд migration файл алга (${dir})`);
    process.exit(2);
}

const url = databaseUrl();
const client = new Client({ connectionString: url, ssl: sslFor(url) });
await client.connect();
let failed = false;
try {
    const { rows: [server] } = await client.query("SELECT current_database() AS db, inet_server_addr()::text AS addr, current_setting('server_version') AS version");
    console.log(`Өгөгдлийн сан: ${server.db} @ ${server.addr ?? 'local'} (PostgreSQL ${server.version})`);

    const { rows: columns } = await client.query(`SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'supabase_migrations' AND table_name = 'schema_migrations'`);
    const columnSet = new Set(columns.map((c) => c.column_name));
    if (!columnSet.has('version')) throw new Error('supabase_migrations.schema_migrations хүснэгт алга — зогсов');
    const { rows: recorded } = await client.query('SELECT version FROM supabase_migrations.schema_migrations WHERE version >= $1 AND version <= $2', [from, to]);
    const done = new Set(recorded.map((r) => r.version));
    const { rows: [latest] } = await client.query('SELECT max(version) AS version FROM supabase_migrations.schema_migrations WHERE version < $1', [from]);
    console.log(`Өмнөх сүүлийн бүртгэл: ${latest?.version ?? '—'}\n`);

    for (const m of files) console.log(`${done.has(m.version) ? '✓ бүртгэлтэй ' : '• хүлээгдэж буй'}  ${m.version}_${m.name}`);
    const pending = files.filter((m) => !done.has(m.version));
    if (!pending.length) {
        console.log('\nХүрээн дэх бүх migration бүртгэлтэй. Хийх зүйл алга.');
    } else if (!APPLY) {
        console.log(`\nШалгалт дууслаа (юу ч бичээгүй). Оруулахын тулд: node scripts/apply-migrations.mjs ${from} ${to} --apply`);
    } else {
        for (const m of pending) {
            const sql = readFileSync(m.file, 'utf8');
            process.stdout.write(`\n→ ${m.version}_${m.name} … `);
            try {
                await client.query('BEGIN');
                // Ачаалалтай хүснэгтийг удаан түгжихгүй: түгжээ 10 секундэд олдохгүй бол буцна.
                await client.query("SET LOCAL lock_timeout = '10s'");
                await client.query("SET LOCAL statement_timeout = '120s'");
                await client.query(sql);
                const insertColumns = ['version', ...(columnSet.has('name') ? ['name'] : []), ...(columnSet.has('statements') ? ['statements'] : [])];
                const values = [m.version, ...(columnSet.has('name') ? [m.name] : []), ...(columnSet.has('statements') ? [[]] : [])];
                await client.query(`INSERT INTO supabase_migrations.schema_migrations (${insertColumns.join(', ')})
                    SELECT ${insertColumns.map((_, i) => `$${i + 1}`).join(', ')}
                    WHERE NOT EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = $1)`, values);
                if (VERIFY[m.version]) {
                    const { rows: [check] } = await client.query(VERIFY[m.version]);
                    if (!check?.ok) throw new Error('оруулсны дараах шалгалт таарсангүй');
                }
                await client.query('COMMIT');
                console.log('OK');
            } catch (error) {
                await client.query('ROLLBACK').catch(() => {});
                console.log('АЛДАА — энэ файл бүхэлдээ буцлаа');
                console.error(error instanceof Error ? error.message : error);
                failed = true;
                break;
            }
        }
        console.log(failed ? '\nЗогслоо: алдаатай файлаас хойших migration оруулаагүй.' : '\nБүх migration амжилттай орж бүртгэгдлээ.');
    }
} finally {
    await client.end();
}
process.exit(failed ? 1 : 0);
