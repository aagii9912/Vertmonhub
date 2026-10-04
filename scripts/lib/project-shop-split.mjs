/**
 * Shop = төсөл салгах логик (scripts/migrate-project-shops.mjs болон тестийн хамтын код).
 * `client` нь pg Client-тэй ижил `query(sql, params) → { rows, rowCount }` интерфейстэй.
 */
export const MANAGEMENT_ROLES = ['super_admin', 'admin', 'marketing'];
// Тусдаа shop болох төслүүд ба тэдний ERP эх сурвалж / FAQ-ийг таних нэр.
export const SPLIT = [
    { project: 'Elysium Residence', match: /elysium|элизиум/i },
    { project: 'Mandala 360&365 Tower', match: /\b(360|365)\b|tower|тауэр/i },
];
// project_id-тай, shop-оо дагах ёстой хүснэгтүүд.
const PROJECT_TABLES = ['leads', 'property_units', 'property_contracts', 'properties', 'marketing_campaigns',
    'marketing_spend_entries', 'marketing_targets', 'marketing_project_budgets', 'newsletters',
    'newsletter_project_settings', 'project_budgets', 'finance_transactions', 'vendor_bills'];
// lead_id-аар лидээ дагах хүснэгтүүд.
const LEAD_TABLES = ['lead_activities', 'lead_attribution_events', 'property_viewings'];

async function one(client, sql, params = []) { return (await client.query(sql, params)).rows[0]; }
async function count(client, sql, params = []) { return Number((await one(client, sql, params)).n); }

/** Төсөлд холбох нь бизнесийн засвар биш: байрны updated_at (тайлангийн үлдэгдлийн огноо) хэвээр үлдэнэ. */
async function withoutTrigger(client, table, trigger, run) {
    const exists = await count(client, 'SELECT count(*) AS n FROM pg_trigger WHERE tgrelid = to_regclass($1) AND tgname = $2', [`public.${table}`, trigger]);
    if (exists) await client.query(`ALTER TABLE public.${table} DISABLE TRIGGER ${trigger}`);
    const result = await run();
    if (exists) await client.query(`ALTER TABLE public.${table} ENABLE TRIGGER ${trigger}`);
    return result;
}

export async function planProjectShopSplit(client, { apply = false, split = SPLIT } = {}) {
    const ready = await one(client, `SELECT
        to_regprocedure('public.create_project_shop(jsonb,uuid[],uuid)') IS NOT NULL AS rpc,
        EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'projects_one_per_shop') AS guard`);
    const migrationReady = ready.rpc && ready.guard;
    if (apply && !migrationReady) throw new Error('Migration 20261004130000_project_shops.sql эхэлж орох ёстой');

    const projects = (await client.query(`SELECT p.id, p.name, p.shop_id, s.name AS shop_name
        FROM projects p JOIN shops s ON s.id = p.shop_id ORDER BY p.created_at, p.id`)).rows;
    const steps = [];
    for (const item of split) {
        const project = projects.find(row => row.name === item.project);
        if (!project) { steps.push({ split: item.project, skip: 'Төсөл олдсонгүй' }); continue; }
        const siblings = projects.filter(row => row.shop_id === project.shop_id);
        if (siblings.length === 1) { steps.push({ split: item.project, skip: 'Аль хэдийн тусдаа shop-той' }); continue; }
        if (await count(client, 'SELECT count(*) AS n FROM shops WHERE lower(btrim(name)) = lower(btrim($1))', [project.name]))
            throw new Error(`«${project.name}» нэртэй shop аль хэдийн байна. Гараар шалгана уу.`);
        const rosterLinks = await count(client, 'SELECT count(*) AS n FROM sales_manager_projects WHERE project_id = $1', [project.id]);
        if (rosterLinks) throw new Error(`«${project.name}» төсөлд ${rosterLinks} менежерийн харьяалал байна. Эхлээд гараар шийднэ үү.`);

        const tables = {};
        for (const table of PROJECT_TABLES) tables[table] = await count(client,
            `SELECT count(*) AS n FROM ${table} WHERE project_id = $1 AND shop_id = $2`, [project.id, project.shop_id]);
        const leadIds = (await client.query('SELECT id FROM leads WHERE project_id = $1 AND shop_id = $2', [project.id, project.shop_id])).rows.map(row => row.id);
        for (const table of LEAD_TABLES) tables[table] = await count(client,
            `SELECT count(*) AS n FROM ${table} WHERE lead_id = ANY($1::uuid[]) AND shop_id = $2`, [leadIds, project.shop_id]);
        const sharedCustomers = await count(client, `SELECT count(DISTINCT customer_id) AS n FROM leads
            WHERE customer_id IN (SELECT customer_id FROM leads WHERE id = ANY($1::uuid[]) AND customer_id IS NOT NULL)
              AND NOT (id = ANY($1::uuid[]))`, [leadIds]);
        const customers = await count(client, 'SELECT count(DISTINCT customer_id) AS n FROM leads WHERE id = ANY($1::uuid[]) AND customer_id IS NOT NULL', [leadIds]);
        if (customers) throw new Error(`«${project.name}» лидэд ${customers} харилцагч холбогдсон (${sharedCustomers} нь бусад лидтэй хуваалцдаг). Харилцагч шилжүүлэх дүрмийг эхэлж тохирно уу.`);
        const erp = (await client.query('SELECT id, source FROM erp_imports WHERE shop_id = $1', [project.shop_id])).rows.filter(row => item.match.test(row.source));
        const faqs = (await client.query('SELECT id, question FROM shop_faqs WHERE shop_id = $1', [project.shop_id])).rows.filter(row => item.match.test(row.question));
        const members = (await client.query(`SELECT m.user_id, r.role, coalesce(p.full_name, p.email) AS name FROM shop_members m
            JOIN user_roles r ON r.user_id = m.user_id LEFT JOIN user_profiles p ON p.id = m.user_id
            WHERE m.shop_id = $1 AND r.role = ANY($2) ORDER BY r.role, name`, [project.shop_id, MANAGEMENT_ROLES])).rows;
        steps.push({ split: project.name, project, tables, leadIds, erp, faqs, members });
    }

    // Үлдэх төслийн shop: ганц төсөл үлдэх бол төсөлгүй байр, гэрээг тэр төсөлд холбоно.
    const moving = new Set(steps.filter(step => step.project).map(step => step.project.id));
    const keep = [];
    for (const shopId of new Set(steps.filter(step => step.project).map(step => step.project.shop_id))) {
        const remaining = projects.filter(row => row.shop_id === shopId && !moving.has(row.id));
        if (remaining.length !== 1) { keep.push({ shopId, skip: `Үлдэх төсөл ${remaining.length}` }); continue; }
        const [project] = remaining;
        keep.push({
            shopId, project,
            units: await count(client, 'SELECT count(*) AS n FROM property_units WHERE shop_id = $1 AND project_id IS NULL', [shopId]),
            contracts: await count(client, 'SELECT count(*) AS n FROM property_contracts WHERE shop_id = $1 AND project_id IS NULL', [shopId]),
            leadsWithoutProject: await count(client, 'SELECT count(*) AS n FROM leads WHERE shop_id = $1 AND project_id IS NULL', [shopId]),
            shopName: project.shop_name,
        });
    }
    return { steps, keep, migrationReady };
}

export function printProjectShopSplit({ steps, keep, migrationReady }, apply = false) {
    console.log(`\n=== Shop = төсөл: ${apply ? 'APPLY' : 'DRY-RUN (юу ч бичихгүй)'} ===`);
    console.log(`Migration 20261004130000: ${migrationReady ? 'орсон' : 'ОРООГҮЙ — apply-аас өмнө ажиллуулна'}`);
    for (const step of steps) {
        if (step.skip) { console.log(`\n• ${step.split}: алгасав — ${step.skip}`); continue; }
        console.log(`\n• «${step.project.name}» → шинэ shop «${step.project.name}» (одоо «${step.project.shop_name}» дотор)`);
        for (const [table, n] of Object.entries(step.tables)) if (n) console.log(`    ${table}: ${n} мөр зөөгдөнө`);
        console.log(`    erp_imports: ${step.erp.length} (${step.erp.map(row => row.source).join(', ') || '—'})`);
        console.log(`    shop_faqs: ${step.faqs.length}`);
        console.log(`    гишүүнчлэл хуулах: ${step.members.map(row => `${row.name} (${row.role})`).join(', ') || '—'}`);
    }
    for (const row of keep) {
        if (row.skip) { console.log(`\n• Үлдэх shop ${row.shopId}: ${row.skip} — төсөл оноохгүй`); continue; }
        console.log(`\n• «${row.shopName}» shop-д «${row.project.name}» ганц төсөл үлдэнэ:`);
        console.log(`    property_units: ${row.units} мөрийг төсөлд холбоно`);
        console.log(`    property_contracts: ${row.contracts} мөрийг төсөлд холбоно`);
        console.log(`    leads (төсөлгүй): ${row.leadsWithoutProject} — хөндөхгүй, админ шалгана`);
    }
}

export async function applyProjectShopSplit(client, { steps, keep }) {
    const receipt = [];
    await client.query('BEGIN');
    try {
        for (const step of steps) {
            if (step.skip) continue;
            const { project } = step;
            const shop = await one(client, `INSERT INTO shops (name, is_active, setup_completed) VALUES ($1, true, true) RETURNING id`, [project.name]);
            // Төслийн мөр эхэлж шилжинэ: лидийн trigger төсөл тухайн shop-ынх эсэхийг шалгана.
            await client.query('UPDATE projects SET shop_id = $1 WHERE id = $2 AND shop_id = $3', [shop.id, project.id, project.shop_id]);
            const moved = {};
            for (const table of PROJECT_TABLES) {
                moved[table] = (await client.query(`UPDATE ${table} SET shop_id = $1 WHERE project_id = $2 AND shop_id = $3`, [shop.id, project.id, project.shop_id])).rowCount;
            }
            for (const table of LEAD_TABLES) {
                moved[table] = (await client.query(`UPDATE ${table} SET shop_id = $1 WHERE lead_id = ANY($2::uuid[]) AND shop_id = $3`, [shop.id, step.leadIds, project.shop_id])).rowCount;
            }
            moved.erp_imports = (await client.query('UPDATE erp_imports SET shop_id = $1 WHERE id = ANY($2::uuid[]) AND shop_id = $3', [shop.id, step.erp.map(row => row.id), project.shop_id])).rowCount;
            moved.shop_faqs = (await client.query('UPDATE shop_faqs SET shop_id = $1 WHERE id = ANY($2::uuid[]) AND shop_id = $3', [shop.id, step.faqs.map(row => row.id), project.shop_id])).rowCount;
            moved.shop_members = (await client.query(`INSERT INTO shop_members (shop_id, user_id, role)
                SELECT $1, user_id, 'member' FROM unnest($2::uuid[]) AS users(user_id) ON CONFLICT (shop_id, user_id) DO NOTHING`,
                [shop.id, step.members.map(row => row.user_id)])).rowCount;
            for (const [table, expected] of Object.entries(step.tables)) {
                if (moved[table] !== expected) throw new Error(`${project.name}: ${table} ${expected} байх ёстой, ${moved[table]} зөөгдлөө`);
            }
            if (await count(client, 'SELECT count(*) AS n FROM leads WHERE project_id = $1 AND shop_id <> $2', [project.id, shop.id]))
                throw new Error(`${project.name}: өөр shop-д үлдсэн лид байна`);
            await client.query(`INSERT INTO admin_audit_log (actor_id, action, target_id, meta) VALUES (NULL, 'project.split_shop', $1, $2)`,
                [project.id, JSON.stringify({ from_shop: project.shop_id, to_shop: shop.id, moved })]);
            receipt.push({ project: project.name, project_id: project.id, shop_id: shop.id, moved });
        }
        for (const row of keep) {
            if (row.skip) continue;
            const units = await withoutTrigger(client, 'property_units', 'property_units_updated_at', async () =>
                (await client.query('UPDATE property_units SET project_id = $1 WHERE shop_id = $2 AND project_id IS NULL', [row.project.id, row.shopId])).rowCount);
            const contracts = (await client.query('UPDATE property_contracts SET project_id = $1 WHERE shop_id = $2 AND project_id IS NULL', [row.project.id, row.shopId])).rowCount;
            if (units !== row.units || contracts !== row.contracts) throw new Error(`${row.project.name}: холбох тоо зөрлөө`);
            receipt.push({ project: row.project.name, shop_id: row.shopId, linked: { property_units: units, property_contracts: contracts } });
        }
        const crowded = await count(client, 'SELECT count(*) AS n FROM (SELECT shop_id FROM projects GROUP BY shop_id HAVING count(*) > 1) AS crowded');
        if (crowded) throw new Error(`${crowded} shop-д олон төсөл хэвээр байна`);
        await client.query('COMMIT');
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    }
    return receipt;
}

/**
 * Split-ийн гүйлгээ нээлттэй байхад орж ирсэн лид хуучин shop-той commit болж болно (гүйлгээ дотроос харагдахгүй).
 * COMMIT-ийн дараа шилжсэн төслүүдийн shop-оос зөрсөн мөрийг олж, тусдаа гүйлгээнд shop-д нь оруулна.
 */
export async function sweepProjectShopStragglers(client, projectIds) {
    const moved = {};
    if (!projectIds.length) return moved;
    await client.query('BEGIN');
    try {
        for (const table of PROJECT_TABLES) {
            moved[table] = (await client.query(`UPDATE ${table} AS t SET shop_id = p.shop_id FROM projects p
                WHERE t.project_id = p.id AND p.id = ANY($1::uuid[]) AND t.shop_id <> p.shop_id`, [projectIds])).rowCount;
        }
        for (const table of LEAD_TABLES) {
            moved[table] = (await client.query(`UPDATE ${table} AS t SET shop_id = l.shop_id FROM leads l
                WHERE t.lead_id = l.id AND l.project_id = ANY($1::uuid[]) AND t.shop_id <> l.shop_id`, [projectIds])).rowCount;
        }
        const left = await count(client, `SELECT count(*) AS n FROM leads l JOIN projects p ON p.id = l.project_id
            WHERE p.id = ANY($1::uuid[]) AND l.shop_id <> p.shop_id`, [projectIds]);
        if (left) throw new Error(`${left} лид төслийн shop-оос зөрсөн хэвээр`);
        if (Object.values(moved).some(Boolean)) {
            await client.query(`INSERT INTO admin_audit_log (actor_id, action, target_id, meta) VALUES (NULL, 'project.split_shop_sweep', NULL, $1)`, [JSON.stringify({ projects: projectIds, moved })]);
        }
        await client.query('COMMIT');
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    }
    return Object.fromEntries(Object.entries(moved).filter(([, n]) => n));
}

