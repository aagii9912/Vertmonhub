// @vitest-environment node
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const actor = '20000000-0000-4000-8000-000000000001';
let db: PGlite;

type Saved = { id: string; name: string; can_write: boolean; role_permissions: Array<{ module: string }> };
const save = async (roleId: string | null, fields: object, modules: string[] | null) =>
    (await db.query<{ role: Saved }>('SELECT save_role($1::uuid, $2::jsonb, $3::text[], $4::uuid) AS role',
        [roleId, JSON.stringify(fields), modules, actor])).rows[0].role;
const count = async (sql: string) => Number((await db.query<{ n: number }>(sql)).rows[0].n);

beforeAll(async () => {
    db = new PGlite();
    await db.exec(`
        CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
        CREATE TABLE roles(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL UNIQUE,
            display_name text NOT NULL, display_name_mn text NOT NULL, description text,
            can_write boolean DEFAULT false, can_delete boolean DEFAULT false, can_access_admin boolean DEFAULT false,
            is_system boolean DEFAULT false, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now());
        CREATE TABLE role_permissions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            role_id uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE, module text NOT NULL, UNIQUE(role_id, module));
        CREATE TABLE admin_audit_log(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), actor_id uuid,
            action varchar(64) NOT NULL, target_id text, meta jsonb DEFAULT '{}'::jsonb);
        GRANT ALL ON roles, role_permissions, admin_audit_log TO service_role;
    `);
    await db.exec(readFileSync('supabase/migrations/20261004120000_save_role_rpc.sql', 'utf8'));
});
afterAll(async () => { await db.close(); });

describe('save_role', () => {
    it('creates the role, its grants and the audit entry together', async () => {
        const role = await save(null, { name: 'analyst', display_name: 'Analyst', display_name_mn: 'Шинжээч', can_write: true }, ['reports', 'dashboard']);
        expect(role).toMatchObject({ name: 'analyst', can_write: true });
        expect(role.role_permissions.map((p) => p.module)).toEqual(['dashboard', 'reports']);
        const audit = await db.query('SELECT action, actor_id, target_id, meta FROM admin_audit_log');
        expect(audit.rows).toEqual([{ action: 'role.create', actor_id: actor, target_id: role.id, meta: { name: 'analyst' } }]);
    });

    it('rejects a duplicate name without leaving grants or audit rows', async () => {
        const before = await count('SELECT count(*) AS n FROM admin_audit_log');
        await expect(save(null, { name: 'analyst', display_name: 'A', display_name_mn: 'A' }, ['leads']))
            .rejects.toMatchObject({ code: '23505' });
        expect(await count("SELECT count(*) AS n FROM role_permissions WHERE module = 'leads'")).toBe(0);
        expect(await count('SELECT count(*) AS n FROM admin_audit_log')).toBe(before);
    });

    it('rolls back the role row when a grant fails mid-way', async () => {
        await expect(save(null, { name: 'broken', display_name: 'B', display_name_mn: 'B' }, ['dashboard', null as unknown as string]))
            .rejects.toMatchObject({ code: '23502' });
        expect(await count("SELECT count(*) AS n FROM roles WHERE name = 'broken'")).toBe(0);
        expect(await count("SELECT count(*) AS n FROM admin_audit_log WHERE meta->>'name' = 'broken'")).toBe(0);
    });

    it('updates only the given fields and keeps grants when modules is null', async () => {
        const { id } = (await db.query<{ id: string }>("SELECT id FROM roles WHERE name = 'analyst'")).rows[0];
        const role = await save(id, { can_write: false }, null);
        expect(role).toMatchObject({ name: 'analyst', can_write: false });
        expect(role.role_permissions.map((p) => p.module)).toEqual(['dashboard', 'reports']);
    });

    it('replaces the grant set and audits the update', async () => {
        const { id } = (await db.query<{ id: string }>("SELECT id FROM roles WHERE name = 'analyst'")).rows[0];
        const role = await save(id, {}, ['dashboard', 'leads']);
        expect(role.role_permissions.map((p) => p.module)).toEqual(['dashboard', 'leads']);
        expect(await count(`SELECT count(*) AS n FROM admin_audit_log WHERE action = 'role.update' AND target_id = '${id}'`)).toBe(2);
    });

    it('reports a missing role without writing an audit row', async () => {
        const before = await count('SELECT count(*) AS n FROM admin_audit_log');
        await expect(save('30000000-0000-4000-8000-000000000009', { can_write: true }, null)).rejects.toMatchObject({ code: 'P0002' });
        expect(await count('SELECT count(*) AS n FROM admin_audit_log')).toBe(before);
    });

    it('is executable by the service role only', async () => {
        const sig = 'public.save_role(uuid, jsonb, text[], uuid)';
        const can = async (role: string) => (await db.query<{ ok: boolean }>('SELECT has_function_privilege($1, $2, $3) AS ok', [role, sig, 'EXECUTE'])).rows[0].ok;
        expect(await can('service_role')).toBe(true);
        expect(await can('authenticated')).toBe(false);
        expect(await can('anon')).toBe(false);
    });
});
