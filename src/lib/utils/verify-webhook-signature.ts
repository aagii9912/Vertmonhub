/**
 * Webhook Signature Verification
 * Verifies Facebook/Instagram webhook signatures using X-Hub-Signature-256
 * 
 * @see https://developers.facebook.com/docs/graph-api/webhooks/getting-started/#verification-requests
 */

import crypto from 'crypto';

/**
 * Verify Facebook webhook payload signature
 * Facebook sends X-Hub-Signature-256 header with HMAC-SHA256 signature
 */
export function verifyWebhookSignature(
    payload: string,
    signature: string | null,
    appSecret: string
): boolean {
    if (!signature) {
        console.error('[Webhook] Missing X-Hub-Signature-256 header');
        return false;
    }

    if (!appSecret) {
        console.error('[Webhook] FACEBOOK_APP_SECRET not configured');
        return false;
    }

    // Signature format: "sha256=<hash>"
    const expectedSignature = 'sha256=' + crypto
        .createHmac('sha256', appSecret)
        .update(payload)
        .digest('hex');

    // Constant-time comparison to prevent timing attacks
    try {
        return crypto.timingSafeEqual(
            Buffer.from(signature),
            Buffer.from(expectedSignature)
        );
    } catch {
        // Buffers of different lengths
        return false;
    }
}
