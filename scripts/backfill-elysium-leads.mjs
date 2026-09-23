/**
 * One-time Elysium website lead import. Dry-run by default.
 *
 * node scripts/backfill-elysium-leads.mjs <elysium-env> <vertmonhub-env> [--apply]
 * Each source event_leads.id becomes the CRM client_request_id, so reruns are safe.
 */
import { readFileSync } from 'node:fs';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import pg from 'pg';

const PROJECT_ID = '7e96e44e-32e3-4fec-b1f7-2205d2064e7c';
const SHOP_ID = '00000000-0000-0000-0000-000000000001';
const CUTOVER = '2026-09-23T15:42:45Z'; // Elysium-ийн шинэ холбоостой deploy үүссэн мөч
const EXPECTED_COUNT = 76;

const [sourcePath, targetPath, mode] = process.argv.slice(2);
if (!sourcePath || !targetPath || (mode && mode !== '--apply')) {
    throw new Error('Usage: node scripts/backfill-elysium-leads.mjs <elysium-env> <vertmonhub-env> [--apply]');
}

const sourceEnv = dotenv.parse(readFileSync(sourcePath));
const targetEnv = dotenv.parse(readFileSync(targetPath));
if (!sourceEnv.SUPABASE_URL || !sourceEnv.SUPABASE_SERVICE_ROLE_KEY || !targetEnv.DATABASE_URL) {
    throw new Error('Source Supabase or target database credentials are missing');
}

const source = createClient(sourceEnv.SUPABASE_URL, sourceEnv.SUPABASE_SERVICE_ROLE_KEY);
const { data: sourceRows, count, error: sourceError } = await source
    .from('event_leads')
    .select('id, name, phone, email, message, source, event_name, event_slug, created_at', { count: 'exact' })
    .lt('created_at', CUTOVER)
    .order('created_at', { ascending: true })
    .limit(1000);
if (sourceError) throw sourceError;
if (count !== EXPECTED_COUNT || sourceRows.length !== EXPECTED_COUNT) {
    throw new Error(`Historical source count changed: expected ${EXPECTED_COUNT}, got ${count}`);
}

const ids = sourceRows.map((row) => row.id);
if (new Set(ids).size !== EXPECTED_COUNT) throw new Error('Duplicate source IDs');
for (const row of sourceRows) {
    if (!row.name?.trim() || row.name.length > 255 || row.phone?.length > 50 || row.email?.length > 255) {
        throw new Error(`Invalid source lead fields for ${row.id}`);
    }
    if (!Number.isFinite(Date.parse(row.created_at))) throw new Error(`Invalid source date for ${row.id}`);
}

const db = new pg.Client({ connectionString: targetEnv.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await db.connect();
try {
    await db.query('BEGIN');
    const project = await db.query('SELECT id, shop_id, name FROM projects WHERE id = $1', [PROJECT_ID]);
    if (project.rows.length !== 1 || project.rows[0].shop_id !== SHOP_ID || project.rows[0].name !== 'Elysium Residence') {
        throw new Error('The configured Elysium project does not match the target database');
    }

    const before = await db.query(
        'SELECT client_request_id, project_id FROM leads WHERE shop_id = $1 AND client_request_id = ANY($2::uuid[])',
        [SHOP_ID, ids],
    );
    if (before.rows.some((lead) => lead.project_id !== PROJECT_ID)) {
        throw new Error('A historical source ID is already attached to another project');
    }

    if (mode !== '--apply') {
        console.log(JSON.stringify({ mode: 'dry-run', source: count, alreadyImported: before.rowCount, toImport: count - before.rowCount }));
        await db.query('ROLLBACK');
    } else {
        let inserted = 0;
        for (const row of sourceRows) {
            const notes = [
                row.message?.trim() || null,
                row.event_name ? `Арга хэмжээ: ${row.event_name}` : null,
                row.event_slug ? `Арга хэмжээний код: ${row.event_slug}` : null,
                row.source ? `Сайтын эх сурвалж: ${row.source}` : null,
            ].filter(Boolean).join('\n\n') || null;
            const result = await db.query(`
                INSERT INTO leads (
                    shop_id, project_id, client_request_id, customer_name, customer_phone,
                    customer_email, source, status, notes, internal_notes,
                    created_at, updated_at, stage_changed_at
                ) VALUES ($1, $2, $3, $4, $5, $6, 'website', 'new', $7, $8, $9, $9, $9)
                ON CONFLICT (shop_id, client_request_id) WHERE client_request_id IS NOT NULL DO NOTHING
                RETURNING id
            `, [
                SHOP_ID, PROJECT_ID, row.id, row.name.trim(), row.phone?.trim() || null,
                row.email?.trim() || null, notes,
                `Elysium сайтын түүхэн импорт. Эх бүртгэлийн ID: ${row.id}. Холбогдсон эсэх нь баталгаажаагүй.`,
                row.created_at,
            ]);
            inserted += result.rowCount;
        }

        const after = await db.query(`
            SELECT client_request_id, project_id, created_at, updated_at, stage_changed_at
            FROM leads WHERE shop_id = $1 AND client_request_id = ANY($2::uuid[])
        `, [SHOP_ID, ids]);
        const dates = new Map(sourceRows.map((row) => [row.id, new Date(row.created_at).getTime()]));
        if (after.rowCount !== EXPECTED_COUNT || after.rows.some((lead) =>
            lead.project_id !== PROJECT_ID ||
            [lead.created_at, lead.updated_at, lead.stage_changed_at].some((date) => date?.getTime() !== dates.get(lead.client_request_id))
        )) {
            throw new Error('Post-import project or date verification failed');
        }
        await db.query('COMMIT');
        console.log(JSON.stringify({ mode: 'applied', source: count, inserted, alreadyImported: before.rowCount, verified: after.rowCount }));
    }
} catch (error) {
    await db.query('ROLLBACK');
    throw error;
} finally {
    await db.end();
}
