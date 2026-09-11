#!/usr/bin/env node
/**
 * RLS аудит (READ-ONLY) — docs/REVIEW-2026-09-11.md Wave 3.
 *
 *   node scripts/rls-audit.mjs
 *
 * `.env.local`-ийн DATABASE_URL-ээр холбогдож (зөвхөн SELECT, transaction read-only):
 *   1. RLS асаагүй public хүснэгт           → ❌ (multi-tenant leak)
 *   2. RLS асаалттай ч policy-гүй хүснэгт     → ⚠️ service-role-only (браузераас хандвал хоосон)
 *   3. Зөвхөн эзэмшигч (shops.user_id) policy → ⚠️ гишүүд (shop_members) уншиж чадахгүй
 *   4. security_invoker биш view              → ❌ (cross-tenant)
 *   5. USING (true) policy authenticated/public-д → ⚠️
 * Exit code 1 = ❌ олдсон (CI-д ашиглаж болно).
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { Client } = require('pg');

const env = Object.fromEntries(
    readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
        .split('\n')
        .filter((l) => l.includes('=') && !l.startsWith('#'))
        .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')]; }),
);
if (!env.DATABASE_URL) { console.error('DATABASE_URL байхгүй (.env.local)'); process.exit(2); }

const c = new Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false }, statement_timeout: 30000 });
await c.connect();
await c.query('SET default_transaction_read_only = on');

let bad = 0;
const section = (title) => console.log(`\n## ${title}`);

section('1. RLS асаагүй хүснэгт');
const noRls = await c.query(`select tablename from pg_tables where schemaname='public' and not rowsecurity order by 1`);
for (const r of noRls.rows) { console.log('❌', r.tablename); bad++; }
if (!noRls.rows.length) console.log('✅ бүгд RLS-тэй');

section('2. RLS-тэй ч policy-гүй (service-role only)');
const noPol = await c.query(`select t.tablename from pg_tables t where t.schemaname='public' and t.rowsecurity and not exists (select 1 from pg_policies p where p.schemaname='public' and p.tablename=t.tablename) order by 1`);
for (const r of noPol.rows) console.log('⚠️ ', r.tablename);
if (!noPol.rows.length) console.log('✅');

section('3. Зөвхөн эзэмшигчийн policy (гишүүд хандахгүй)');
const owner = await c.query(`select tablename, policyname, cmd from pg_policies where schemaname='public' and (qual ilike '%shops.user_id = auth.uid()%' or qual ilike '%user_id = auth.uid()%' and tablename in ('shops')) order by 1,2`);
for (const r of owner.rows) console.log('⚠️ ', r.tablename, '|', r.policyname, '|', r.cmd);
if (!owner.rows.length) console.log('✅');

section('4. security_invoker биш view');
const views = await c.query(`select c.relname, c.reloptions from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='v'`);
for (const v of views.rows) {
    const inv = (v.reloptions || []).some((o) => /security_invoker=(on|true)/.test(o));
    if (!inv) { console.log('❌', v.relname); bad++; } else console.log('✅', v.relname);
}

section('5. USING (true) policy (authenticated/public)');
const open = await c.query(`select tablename, policyname, cmd, roles from pg_policies where schemaname='public' and (qual = 'true' or with_check = 'true') and not ('service_role' = any(roles)) order by 1,2`);
for (const r of open.rows) console.log('⚠️ ', r.tablename, '|', r.policyname, '|', r.cmd, '|', r.roles);
if (!open.rows.length) console.log('✅');

await c.end();
console.log(bad ? `\n❌ ${bad} асуудал` : '\n✅ RLS аудит цэвэр');
process.exit(bad ? 1 : 0);
