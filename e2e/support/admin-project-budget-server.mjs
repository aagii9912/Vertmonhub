import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { parse } from 'dotenv';

const appPort = 3121;
const authPort = 4341;
// Next dev normalizes Request.url to localhost. Use one cookie origin throughout.
const appOrigin = `http://localhost:${appPort}`;
const authOrigin = `http://127.0.0.1:${authPort}`;
const password = 'onboarding-test-only';
const accounts = [
    { id: '00000000-0000-4000-8000-000000000101', email: 'onboarding-admin@example.invalid', name: 'Тест Админ', role: 'super_admin' },
    { id: '00000000-0000-4000-8000-000000000102', email: 'onboarding-manager-1@example.invalid', name: 'Тест Менежер Нэг', role: 'sales_manager' },
    { id: '00000000-0000-4000-8000-000000000103', email: 'onboarding-manager-2@example.invalid', name: 'Тест Менежер Хоёр', role: 'sales_manager' },
];
const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
const identities = accounts.map(account => {
    const user = { id: account.id, email: account.email, aud: 'authenticated', role: 'authenticated',
        email_confirmed_at: new Date().toISOString(), app_metadata: { provider: 'email', providers: ['email'] },
        user_metadata: { full_name: account.name }, identities: [], created_at: '2026-01-01T00:00:00Z' };
    const token = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: user.id, aud: 'authenticated', role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600, session_id: randomUUID() })}.${encode(randomUUID())}`;
    return { ...account, user, token };
});

// Pre-seeded identities exercise real login handlers, SSR cookies and proxy checks.
// Admin creation and CRM data in the browser spec are explicit API fixtures. This
// server does not implement Supabase Auth provisioning, SQL triggers or RLS.
const server = createServer(async (request, response) => {
    response.setHeader('Content-Type', 'application/json');
    response.setHeader('X-Supabase-Api-Version', '2024-01-01');
    response.setHeader('Access-Control-Allow-Origin', appOrigin);
    response.setHeader('Access-Control-Allow-Headers', '*');
    response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    const send = (status, data) => { response.writeHead(status); response.end(JSON.stringify(data)); };
    if (request.method === 'OPTIONS') return send(200, {});
    const url = new URL(request.url, authOrigin);
    const identity = identities.find(account => request.headers.authorization === `Bearer ${account.token}`);
    if (url.pathname === '/auth/v1/token') {
        let raw = ''; for await (const chunk of request) raw += chunk;
        const credentials = JSON.parse(raw || '{}');
        const account = identities.find(account => account.email === credentials.email);
        if (!account || credentials.password !== password) return send(400, { code: 'invalid_credentials', message: 'Invalid login credentials' });
        return send(200, { access_token: account.token, token_type: 'bearer', expires_in: 3600, refresh_token: `fixture-${account.id}`, user: account.user });
    }
    if (url.pathname === '/auth/v1/user') return identity ? send(200, identity.user) : send(401, { message: 'Invalid fixture session' });
    if (url.pathname === '/rest/v1/user_roles') {
        const id = url.searchParams.get('user_id')?.replace(/^eq\./, '');
        return send(200, { role: identities.find(account => account.id === id)?.role || 'viewer' });
    }
    if (url.pathname === '/rest/v1/rpc/check_rate_limit') return send(200, { allowed: true, remaining: 100, reset_at_ms: Date.now() + 60_000 });
    return send(501, { message: `Unimplemented admin/project/budget fixture: ${url.pathname}` });
});

// Empty every .env key so tests never contact live databases or email providers.
const env = Object.fromEntries(['PATH', 'HOME', 'TMPDIR', 'TEMP', 'CI', 'NODE_OPTIONS'].filter(key => process.env[key]).map(key => [key, process.env[key]]));
for (const file of readdirSync('.').filter(name => /^\.env(?:\.|$)/.test(name))) {
    for (const key of Object.keys(parse(readFileSync(file)))) env[key] = '';
}
Object.assign(env, { NEXT_PUBLIC_SUPABASE_URL: authOrigin, NEXT_PUBLIC_SUPABASE_ANON_KEY: 'onboarding-anon',
    SUPABASE_SERVICE_ROLE_KEY: 'onboarding-service', NEXT_PUBLIC_APP_URL: appOrigin,
    NEXT_BUILD_DIR: 'output/admin-project-budget/dev', NEXT_TELEMETRY_DISABLED: '1' });
await new Promise(resolve => server.listen(authPort, '127.0.0.1', resolve));
const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '--hostname', '127.0.0.1', '--port', String(appPort)], { env, stdio: 'inherit' });
const stop = () => { child.kill('SIGTERM'); server.close(); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
child.on('exit', code => { server.close(); process.exit(code ?? 1); });
