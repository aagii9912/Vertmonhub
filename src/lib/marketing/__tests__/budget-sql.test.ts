// @vitest-environment node
import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

it('project budget SQL preserves organization plans, rejects foreign projects and commits all 12 months atomically', async () => {
    const db = new PGlite();
    const shop = '00000000-0000-4000-8000-000000000001';
    const otherShop = '00000000-0000-4000-8000-000000000002';
    const project = '00000000-0000-4000-8000-000000000003';
    const foreignProject = '00000000-0000-4000-8000-000000000004';
    try {
        await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
            CREATE TABLE shops(id uuid PRIMARY KEY);
            CREATE TABLE projects(id uuid PRIMARY KEY,shop_id uuid REFERENCES shops);
            CREATE TABLE marketing_budgets(shop_id uuid REFERENCES shops,year int,month int,amount numeric(14,0),note text,UNIQUE(shop_id,year,month));
            INSERT INTO shops VALUES ('${shop}'),('${otherShop}');
            INSERT INTO projects VALUES ('${project}','${shop}'),('${foreignProject}','${otherShop}');
            INSERT INTO marketing_budgets VALUES ('${shop}',2026,1,500,'Хуучин төлөвлөгөө');
            GRANT ALL ON shops,projects,marketing_budgets TO service_role;`);
        const performance = readFileSync('supabase/migrations/20260921120000_marketing_performance.sql', 'utf8');
        const targets = readFileSync('supabase/migrations/20260701140000_team_targets_active_managers.sql', 'utf8');
        await db.exec(performance.match(/CREATE OR REPLACE FUNCTION validate_marketing_scope\(\)[\s\S]*?END \$\$;/)![0]);
        await db.exec(targets.match(/CREATE OR REPLACE FUNCTION update_sales_targets_updated_at\(\)[\s\S]*?\$\$;/)![0]);
        const migration = readFileSync('supabase/migrations/20261001120000_marketing_project_budgets.sql', 'utf8');
        await db.exec(migration);
        await db.exec(migration); // Дахин ажиллуулахад өмнөх төлөвлөгөө хадгалагдана.
        for (const role of ['anon', 'authenticated']) {
            await db.exec(`SET ROLE ${role}`);
            await expect(db.exec('SELECT * FROM marketing_project_budgets')).rejects.toThrow(/permission denied/);
            await expect(db.exec(`INSERT INTO marketing_project_budgets(shop_id,project_id,year,month,amount) VALUES ('${shop}','${project}',2026,1,100)`)).rejects.toThrow(/permission denied/);
            await db.exec('RESET ROLE');
        }
        await db.exec('SET ROLE service_role');
        const values = Array.from({ length: 12 }, (_, i) => `('${shop}','${project}',2026,${i + 1},${i ? 100 : 101})`).join(',');
        await db.exec(`INSERT INTO marketing_project_budgets(shop_id,project_id,year,month,amount) VALUES ${values}`);
        expect((await db.query<{ total: string }>('SELECT sum(amount) AS total FROM marketing_project_budgets')).rows[0].total).toBe('1201');
        await expect(db.exec(`INSERT INTO marketing_project_budgets(shop_id,project_id,year,month,amount) VALUES ('${shop}','${foreignProject}',2027,1,100)`)).rejects.toThrow(/another shop/);
        await expect(db.exec(`UPDATE marketing_project_budgets SET project_id='${foreignProject}' WHERE month=1`)).rejects.toThrow(/another shop/);
        await expect(db.exec(`INSERT INTO marketing_project_budgets(shop_id,project_id,year,month,amount) VALUES ('${shop}','${project}',2027,1,100),('${shop}','${project}',2027,13,100)`)).rejects.toThrow(/check constraint/);
        expect((await db.query('SELECT * FROM marketing_project_budgets WHERE year=2027')).rows).toHaveLength(0);
        await db.exec(`UPDATE marketing_project_budgets SET note='Сарын тайлбар' WHERE month=1;
            INSERT INTO marketing_project_budgets(shop_id,project_id,year,month,amount) VALUES ('${shop}','${project}',2026,1,200)
            ON CONFLICT(shop_id,project_id,year,month) DO UPDATE SET amount=excluded.amount;
            INSERT INTO marketing_budgets(shop_id,year,month,amount) VALUES ('${shop}',2026,1,600)
            ON CONFLICT(shop_id,year,month) DO UPDATE SET amount=excluded.amount;`);
        expect((await db.query<{ note: string }>('SELECT note FROM marketing_project_budgets WHERE month=1')).rows[0].note).toBe('Сарын тайлбар');
        expect((await db.query('SELECT amount,note FROM marketing_budgets')).rows[0]).toMatchObject({ amount: '600', note: 'Хуучин төлөвлөгөө' });
    } finally { await db.close(); }
}, 20_000);
