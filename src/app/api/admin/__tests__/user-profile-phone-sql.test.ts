// @vitest-environment node
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { expect, it } from 'vitest';

const migration = readFileSync('supabase/migrations/20261004165000_user_profile_phone.sql', 'utf8');
const userA = '10000000-0000-4000-8000-000000000001';
const userB = '10000000-0000-4000-8000-000000000002';

it('adds the staff phone column with an 8-digit check idempotently when it is missing', async () => {
    const db = new PGlite();
    try {
        await db.exec(`CREATE TABLE user_profiles (id uuid PRIMARY KEY, email text UNIQUE NOT NULL, full_name text,
            created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now());`);
        await db.query('INSERT INTO user_profiles (id, email, full_name) VALUES ($1, $2, $3)', [userA, 'a@example.invalid', 'Бат']);
        await db.exec(migration);
        await db.exec(migration);

        expect((await db.query(`SELECT count(*)::int AS n FROM pg_constraint WHERE conname = 'user_profiles_phone_format'`)).rows)
            .toEqual([{ n: 1 }]);
        expect((await db.query('SELECT full_name, phone FROM user_profiles')).rows).toEqual([{ full_name: 'Бат', phone: null }]);
        await db.query('UPDATE user_profiles SET phone = $1 WHERE id = $2', ['88883375', userA]);
        for (const invalid of ['8888337', '888833750', '+97688883375', '8888 3375', '']) {
            await expect(db.query('UPDATE user_profiles SET phone = $1 WHERE id = $2', [invalid, userA]))
                .rejects.toMatchObject({ code: '23514' });
        }
        await db.query('UPDATE user_profiles SET phone = NULL WHERE id = $1', [userA]);
        expect((await db.query('SELECT phone FROM user_profiles')).rows).toEqual([{ phone: null }]);
    } finally {
        await db.close();
    }
});

it('keeps legacy phone values readable (NOT VALID) while checking new writes', async () => {
    const db = new PGlite();
    try {
        // 002_auth_and_oauth.sql-ийн хэлбэр: багана аль хэдийн байгаа, хуучин чөлөөт текст.
        await db.exec(`CREATE TABLE user_profiles (id uuid PRIMARY KEY, email text UNIQUE NOT NULL, full_name text, phone text);`);
        await db.query('INSERT INTO user_profiles (id, email, phone) VALUES ($1, $2, $3)', [userA, 'a@example.invalid', '+976 9911-2233']);
        await db.exec(migration);
        await db.exec(migration);

        expect((await db.query('SELECT phone FROM user_profiles WHERE id = $1', [userA])).rows).toEqual([{ phone: '+976 9911-2233' }]);
        expect((await db.query(`SELECT convalidated FROM pg_constraint WHERE conname = 'user_profiles_phone_format'`)).rows)
            .toEqual([{ convalidated: false }]);
        await expect(db.query('INSERT INTO user_profiles (id, email, phone) VALUES ($1, $2, $3)', [userB, 'b@example.invalid', '9911-2233']))
            .rejects.toMatchObject({ code: '23514' });
        await db.query('INSERT INTO user_profiles (id, email, phone) VALUES ($1, $2, $3)', [userB, 'b@example.invalid', '99112233']);
        expect((await db.query(`SELECT col_description('user_profiles'::regclass, 4) AS comment`)).rows[0])
            .toMatchObject({ comment: expect.stringContaining('8 оронтой') });
    } finally {
        await db.close();
    }
});
