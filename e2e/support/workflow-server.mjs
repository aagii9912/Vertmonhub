import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { parse } from 'dotenv';

// Only this disposable server accepts the fixture credentials. Application auth
// still goes through the real login handler, SSR cookies and proxy.getUser().
const user = { id: '00000000-0000-4000-8000-000000000001', aud: 'authenticated', role: 'authenticated',
    email: 'workflow@example.invalid', email_confirmed_at: new Date().toISOString(),
    app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: { full_name: 'Тест Менежер' },
    identities: [], created_at: '2026-01-01T00:00:00Z' };
const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
const token = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: user.id, aud: 'authenticated', role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600, session_id: randomUUID() })}.${Buffer.from(randomUUID()).toString('base64url')}`;
const server = createServer(async (request, response) => {
    response.setHeader('Content-Type', 'application/json');
    response.setHeader('Access-Control-Allow-Origin', 'http://127.0.0.1:3101');
    response.setHeader('Access-Control-Allow-Headers', '*');
    response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    const send = (status, data) => { response.writeHead(status); response.end(JSON.stringify(data)); };
    if (request.method === 'OPTIONS') return send(200, {});
    const path = new URL(request.url, 'http://127.0.0.1:4319').pathname;
    if (path === '/auth/v1/token') {
        let body = ''; for await (const chunk of request) body += chunk;
        const credentials = JSON.parse(body || '{}');
        if (credentials.email !== user.email || credentials.password !== 'workflow-test-only') {
            return send(400, { code: 'invalid_credentials', message: 'Invalid login credentials' });
        }
        return send(200, { access_token: token, token_type: 'bearer', expires_in: 3600, refresh_token: 'fixture-refresh', user });
    }
    if (path === '/auth/v1/user') return request.headers.authorization === `Bearer ${token}`
        ? send(200, user) : send(401, { message: 'Invalid fixture session' });
    if (path === '/rest/v1/user_roles') return send(200, { role: 'sales_manager' });
    if (path === '/rest/v1/rpc/check_rate_limit') return send(200, { allowed: true, remaining: 100, reset_at_ms: Date.now() + 60_000 });
    return send(501, { message: `Unimplemented isolated fixture: ${path}` });
});

// Avoid loading real provider/database credentials even when .env.local exists.
const env = Object.fromEntries(['PATH', 'HOME', 'TMPDIR', 'TEMP', 'CI', 'NODE_OPTIONS'].filter(key => process.env[key]).map(key => [key, process.env[key]]));
for (const file of readdirSync('.').filter(name => /^\.env(?:\.|$)/.test(name))) {
    for (const key of Object.keys(parse(readFileSync(file)))) env[key] = '';
}
Object.assign(env, { NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:4319', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'workflow-anon',
    SUPABASE_SERVICE_ROLE_KEY: 'workflow-service', NEXT_PUBLIC_APP_URL: 'http://127.0.0.1:3101',
    NEXT_BUILD_DIR: '.next-e2e', NEXT_TELEMETRY_DISABLED: '1' });
await new Promise(resolve => server.listen(4319, '127.0.0.1', resolve));
const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '--hostname', '127.0.0.1', '--port', '3101'], { env, stdio: 'inherit' });
const stop = () => { child.kill('SIGTERM'); server.close(); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
child.on('exit', code => { server.close(); process.exit(code ?? 1); });
