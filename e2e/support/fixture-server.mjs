import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { parse } from 'dotenv';

// Disposable fixture for every isolated browser spec: a fake GoTrue on loopback plus
// `next dev` with every .env key blanked, so tests never reach live databases,
// AI providers or email. Application auth still goes through the real login
// handler, SSR cookies and proxy.getUser(); CRM data comes from page.route mocks.
const appPort = Number(process.env.E2E_APP_PORT || 3101);
const authPort = Number(process.env.E2E_AUTH_PORT || 4319);
// Next dev normalizes Request.url to localhost. Use one cookie origin throughout.
const appOrigin = `http://localhost:${appPort}`;
const authOrigin = `http://127.0.0.1:${authPort}`;

const accounts = [
    { id: '00000000-0000-4000-8000-000000000001', email: 'workflow@example.invalid', password: 'workflow-test-only', name: 'Тест Менежер', role: 'sales_manager' },
    { id: '00000000-0000-4000-8000-000000000101', email: 'onboarding-admin@example.invalid', password: 'onboarding-test-only', name: 'Тест Админ', role: 'super_admin' },
    { id: '00000000-0000-4000-8000-000000000102', email: 'onboarding-manager-1@example.invalid', password: 'onboarding-test-only', name: 'Тест Менежер Нэг', role: 'sales_manager' },
    { id: '00000000-0000-4000-8000-000000000103', email: 'onboarding-manager-2@example.invalid', password: 'onboarding-test-only', name: 'Тест Менежер Хоёр', role: 'sales_manager' },
];
const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
const accessToken = id => `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: id, aud: 'authenticated', role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600, session_id: randomUUID() })}.${encode(randomUUID())}`;
const identities = accounts.map(account => {
    const user = { id: account.id, email: account.email, aud: 'authenticated', role: 'authenticated',
        email_confirmed_at: new Date().toISOString(), app_metadata: { provider: 'email', providers: ['email'] },
        user_metadata: { full_name: account.name }, identities: [], created_at: '2026-01-01T00:00:00Z' };
    return { ...account, user, token: accessToken(user.id) };
});
// GoTrue rotation: a refresh token works once; reused within the 10 s reuse interval it returns the
// same new session, later it fails. Lets browser specs prove a refreshed session reaches the browser.
const REUSE_INTERVAL_MS = 10_000;
const accessTokens = new Map(identities.map(account => [account.token, account]));
const refreshTokens = new Map();
const session = (account, token = account.token) => {
    const refresh_token = `fixture-${account.id}-${randomUUID()}`;
    refreshTokens.set(refresh_token, { account, child: null, usedAt: 0 });
    return { access_token: token, token_type: 'bearer', expires_in: 3600, refresh_token, user: account.user };
};
const refresh = (token) => {
    const parent = refreshTokens.get(token);
    if (!parent) return [400, { code: 'refresh_token_not_found', message: 'Invalid Refresh Token: Refresh Token Not Found' }];
    if (parent.child) {
        return Date.now() - parent.usedAt <= REUSE_INTERVAL_MS
            ? [200, parent.child]
            : [400, { code: 'refresh_token_already_used', message: 'Invalid Refresh Token: Already Used' }];
    }
    const rotated = accessToken(parent.account.id);
    accessTokens.set(rotated, parent.account);
    parent.child = session(parent.account, rotated);
    parent.usedAt = Date.now();
    return [200, parent.child];
};
const managerInvite = /^manager-([12])-invite-[a-z0-9-]+$/; // onboarding-manager-1 / -2
const usedHashes = new Set();

const server = createServer(async (request, response) => {
    response.setHeader('Content-Type', 'application/json');
    response.setHeader('X-Supabase-Api-Version', '2024-01-01');
    response.setHeader('Access-Control-Allow-Origin', appOrigin);
    response.setHeader('Access-Control-Allow-Headers', '*');
    response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    const send = (status, data) => { response.writeHead(status); response.end(JSON.stringify(data)); };
    const body = async () => { let raw = ''; for await (const chunk of request) raw += chunk; return JSON.parse(raw || '{}'); };
    if (request.method === 'OPTIONS') return send(200, {});
    const url = new URL(request.url, authOrigin);

    if (url.pathname === '/auth/v1/token') {
        const credentials = await body();
        if (url.searchParams.get('grant_type') === 'refresh_token') return send(...refresh(credentials.refresh_token));
        const account = identities.find(candidate => candidate.email === credentials.email);
        if (!account || credentials.password !== account.password) return send(400, { code: 'invalid_credentials', message: 'Invalid login credentials' });
        return send(200, session(account));
    }
    if (url.pathname === '/auth/v1/verify') {
        const { token_hash: hash, type } = await body();
        if (hash === 'expired-invite' || usedHashes.has(hash)) return send(403, { code: 'otp_expired', msg: 'Email link is invalid or has expired' });
        const match = typeof hash === 'string' && hash.match(managerInvite);
        if (!match || type !== 'invite') return send(403, { code: 'otp_invalid', msg: 'Token is invalid' });
        usedHashes.add(hash);
        return send(200, session(identities.find(account => account.email === `onboarding-manager-${match[1]}@example.invalid`)));
    }
    if (url.pathname === '/auth/v1/user') {
        const identity = accessTokens.get(request.headers.authorization?.replace(/^Bearer /, ''));
        return identity ? send(200, identity.user) : send(401, { message: 'Invalid fixture session' });
    }
    if (url.pathname === '/rest/v1/user_roles') {
        const id = url.searchParams.get('user_id')?.replace(/^eq\./, '');
        return send(200, { role: identities.find(account => account.id === id)?.role || 'viewer' });
    }
    if (url.pathname === '/rest/v1/rpc/check_rate_limit') return send(200, { allowed: true, remaining: 100, reset_at_ms: Date.now() + 60_000 });
    return send(501, { message: `Unimplemented isolated fixture: ${url.pathname}` });
});

// Empty every .env key so tests never contact live databases or providers.
const env = Object.fromEntries(['PATH', 'HOME', 'TMPDIR', 'TEMP', 'CI', 'NODE_OPTIONS'].filter(key => process.env[key]).map(key => [key, process.env[key]]));
for (const file of readdirSync('.').filter(name => /^\.env(?:\.|$)/.test(name))) {
    for (const key of Object.keys(parse(readFileSync(file)))) env[key] = '';
}
Object.assign(env, { NEXT_PUBLIC_SUPABASE_URL: authOrigin, NEXT_PUBLIC_SUPABASE_ANON_KEY: 'fixture-anon',
    SUPABASE_SERVICE_ROLE_KEY: 'fixture-service', NEXT_PUBLIC_APP_URL: appOrigin,
    NEXT_BUILD_DIR: process.env.E2E_BUILD_DIR || '.next-e2e', NEXT_TELEMETRY_DISABLED: '1' });
await new Promise(resolve => server.listen(authPort, '127.0.0.1', resolve));
const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '--hostname', '127.0.0.1', '--port', String(appPort)], { env, stdio: 'inherit' });
const stop = () => { child.kill('SIGTERM'); server.close(); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
child.on('exit', code => { server.close(); process.exit(code ?? 1); });
