import crypto from 'crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { metaPageApp, metaPageAppSecret, metaWebhookSecrets } from '../page-app';
import { appsecretProof } from '../messenger';
import { verifyWebhookSignatureAny } from '@/lib/utils/verify-webhook-signature';

const stub = (values: Record<string, string>) => {
    for (const name of ['META_PAGE_APP', 'META_ADS_APP_ID', 'META_ADS_APP_SECRET', 'META_PAGE_LOGIN_CONFIG_ID', 'FACEBOOK_APP_ID', 'FACEBOOK_APP_SECRET', 'FACEBOOK_LOGIN_USE_CONFIG', 'FACEBOOK_LOGIN_CONFIG_ID']) {
        vi.stubEnv(name, values[name] ?? '');
    }
};
afterEach(() => vi.unstubAllEnvs());

describe('Facebook Page app selection', () => {
    it('uses the working «Vertmon Hub» app by default, with its Page login configuration', () => {
        stub({ META_ADS_APP_ID: '1422', META_ADS_APP_SECRET: ' ads-secret \n', META_PAGE_LOGIN_CONFIG_ID: '777', FACEBOOK_APP_ID: '1646', FACEBOOK_APP_SECRET: 'legacy-secret' });
        expect(metaPageApp()).toEqual({ id: '1422', secret: 'ads-secret', source: 'ads', loginConfigId: '777' });
        expect(appsecretProof('page-token')).toBe(crypto.createHmac('sha256', 'ads-secret').update('page-token').digest('hex'));
        expect(metaWebhookSecrets()).toEqual(['ads-secret', 'legacy-secret']);
    });

    it('falls back to, or can be switched back to, the legacy app', () => {
        stub({ FACEBOOK_APP_ID: '1646', FACEBOOK_APP_SECRET: 'legacy-secret', FACEBOOK_LOGIN_USE_CONFIG: 'true', FACEBOOK_LOGIN_CONFIG_ID: '555' });
        expect(metaPageApp()).toEqual({ id: '1646', secret: 'legacy-secret', source: 'legacy', loginConfigId: '555' });
        stub({ META_PAGE_APP: 'legacy', META_ADS_APP_ID: '1422', META_ADS_APP_SECRET: 'ads-secret', FACEBOOK_APP_ID: '1646', FACEBOOK_APP_SECRET: 'legacy-secret' });
        expect(metaPageApp()?.source).toBe('legacy');
        expect(metaPageAppSecret()).toBe('legacy-secret');
        stub({});
        expect(metaPageApp()).toBeNull();
        expect(metaPageAppSecret()).toBeNull();
        expect(metaWebhookSecrets()).toEqual([]);
    });

    it('accepts webhook signatures from either of our apps only', () => {
        const body = '{"object":"page"}';
        const sign = (secret: string) => `sha256=${crypto.createHmac('sha256', secret).update(body).digest('hex')}`;
        const secrets = ['ads-secret', 'legacy-secret'];
        expect(verifyWebhookSignatureAny(body, sign('ads-secret'), secrets)).toBe(true);
        expect(verifyWebhookSignatureAny(body, sign('legacy-secret'), secrets)).toBe(true);
        expect(verifyWebhookSignatureAny(body, sign('someone-else'), secrets)).toBe(false);
        expect(verifyWebhookSignatureAny(body, null, secrets)).toBe(false);
        expect(verifyWebhookSignatureAny(body, sign('ads-secret'), [])).toBe(false);
    });
});
