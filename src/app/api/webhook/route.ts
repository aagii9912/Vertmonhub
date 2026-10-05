import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse, after } from 'next/server';
import { verifyWebhook } from '@/lib/facebook/messenger';
import { isDuplicateWebhookEvent } from '@/lib/webhook/retryService';
import { logger } from '@/lib/utils/logger';
import { verifyWebhookSignature } from '@/lib/utils/verify-webhook-signature';
import { supabaseAdmin } from '@/lib/supabase';
import { hasLeadgenChanges, ingestLeadgenWebhook } from '@/lib/facebook/leadgen';
import {
    getShopByPageId,
    getShopByInstagramId,
    getOrCreateCustomer,
    getOrCreateInstagramCustomer,
    updateCustomerInfo,
    incomingMessageText,
    saveChatHistory,
    incrementMessageCount,
} from '@/lib/webhook/WebhookService';

/**
 * Meta webhook — app-ийн Page-ийн ганц callback URL.
 *  - Messenger / Instagram DM-ийг харилцагч ба chat_history-д хадгалж Inbox-д харуулна (AI хариугүй).
 *    Meta 20с дотор 200 хүлээдэг тул хадгалалтыг ACK-ийн дараа after()-д хийнэ.
 *  - Facebook Lead Ads (`entry.changes[field=leadgen]`)-ийг ACK-аас ӨМНӨ `lib/facebook/leadgen`-ээр
 *    хадгална: түр зуурын алдаа гарвал 503 буцааж Meta-аар дахин илгээлгэнэ (давхардал таслагдана),
 *    тохиргооны алдааг (Page холбоогүй, токен, эрх) `meta_leadgen_events`-д тэмдэглээд 200 буцаана.
 */
export const maxDuration = 60;

/** Leadgen-ийг Meta-гийн хариу хүлээх хугацаанд багтааж боловсруулна; үлдсэнийг Meta дахин илгээнэ. */
const LEADGEN_BUDGET_MS = 15_000;

const VERIFY_TOKEN = process.env.FACEBOOK_VERIFY_TOKEN;
if (!VERIFY_TOKEN) {
    console.error('CRITICAL: FACEBOOK_VERIFY_TOKEN environment variable is required');
}

const APP_SECRET = process.env.FACEBOOK_APP_SECRET;

type Platform = 'messenger' | 'instagram';

interface WebhookEntry {
    id: string;
    changes?: Array<{ field?: string; value?: unknown }>;
    messaging?: Array<{
        sender: { id: string };
        message?: {
            mid?: string;
            text?: string;
            is_echo?: boolean;
            attachments?: Array<{ type: string }>;
        };
        postback?: { payload?: string };
    }>;
}

// Verify webhook (GET request from Facebook)
export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const mode = searchParams.get('hub.mode');
    const token = searchParams.get('hub.verify_token');
    const challenge = searchParams.get('hub.challenge');

    if (!VERIFY_TOKEN) {
        logger.error('FACEBOOK_VERIFY_TOKEN not configured');
        return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 });
    }

    const result = verifyWebhook(mode, token, challenge, VERIFY_TOKEN);

    if (result) {
        logger.info('Webhook verified successfully');
        return new NextResponse(result, { status: 200 });
    }

    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}

// Handle incoming messages (POST request from Facebook/Instagram)
export async function POST(request: NextRequest) {
    // Correlation ID — webhook → хадгалалтын гинжийг лог-д мөшгихөд тусална
    const requestId = randomUUID();
    try {
        // Verify webhook signature (X-Hub-Signature-256)
        const rawBody = await request.text();
        const signature = request.headers.get('x-hub-signature-256');

        if (!APP_SECRET) {
            logger.error('FACEBOOK_APP_SECRET not configured — refusing webhook');
            return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 });
        }
        if (!verifyWebhookSignature(rawBody, signature, APP_SECRET)) {
            logger.warn('Webhook signature verification failed');
            return NextResponse.json({ error: 'Invalid signature' }, { status: 403 });
        }

        const body = JSON.parse(rawBody);

        // Validate object type (page or instagram)
        if (body.object !== 'page' && body.object !== 'instagram') {
            return NextResponse.json({ error: 'Invalid object type' }, { status: 400 });
        }
        const platform: Platform = body.object === 'instagram' ? 'instagram' : 'messenger';
        logger.info(`Webhook received for platform: ${platform}`);

        // Meta-д ШУУД 200 өгч, хадгалалтыг after()-д (ижил invocation, maxDuration хүртэл)
        // үргэлжлүүлнэ — удаан бол Meta timeout → дахин илгээлт → dedup-д алгасагддаг (review H7).
        after(async () => {
            try {
                for (const entry of (body.entry || []) as WebhookEntry[]) {
                    await saveEntryMessages(platform, entry, requestId);
                }
            } catch (error) {
                logger.error('[Webhook] background processing error', { requestId, error: error instanceof Error ? error.message : String(error) });
            }
        });

        if (platform === 'messenger' && hasLeadgenChanges(body)) {
            const leadgen = await ingestLeadgenWebhook(supabaseAdmin(), body, Date.now() + LEADGEN_BUDGET_MS)
                .catch((error: unknown) => {
                    logger.error('[Webhook] leadgen processing error', { requestId, error: error instanceof Error ? error.message : String(error) });
                    return null;
                });
            if (!leadgen || leadgen.failed > 0) {
                // DM-ийн давтан илгээлтийг mid-ээр, лидийг client_request_id-аар таслана.
                return NextResponse.json({ status: 'retry', leadgen }, { status: 503 });
            }
            return NextResponse.json({ status: 'ok', leadgen });
        }

        return NextResponse.json({ status: 'ok' });
    } catch (error) {
        logger.error('Webhook error:', { error });
        return NextResponse.json({
            error: 'Internal server error',
        }, { status: 500 });
    }
}

async function saveEntryMessages(platform: Platform, entry: WebhookEntry, requestId: string) {
    const accountId = entry.id; // Page ID for Messenger, or Instagram Business Account ID
    const shop = platform === 'instagram' ? await getShopByInstagramId(accountId) : await getShopByPageId(accountId);
    if (!shop) {
        logger.warn(`No active shop found for ${platform} account ${accountId}`);
        return;
    }

    const accessToken = platform === 'instagram'
        ? (shop.instagram_access_token || shop.facebook_page_access_token || process.env.FACEBOOK_PAGE_ACCESS_TOKEN)
        : (shop.facebook_page_access_token || process.env.FACEBOOK_PAGE_ACCESS_TOKEN);
    if (!accessToken) {
        logger.warn(`No access token for shop ${shop.name} on ${platform}`);
        return;
    }

    for (const event of entry.messaging || []) {
        const senderId = event.sender.id;

        // Өөрийн (page-ийн) илгээсэн мессежийн echo — харилцагчийн мессеж биш
        if (event.message?.is_echo || senderId === accountId) continue;

        if (event.postback?.payload) {
            logger.info(`[${shop.name}] Postback received`, { payload: event.postback.payload });
        }

        const text = incomingMessageText(event.message);
        if (!text) continue;

        // Idempotency: Meta нэг мессежийг давхар илгээж болзошгүй тул message ID (mid)-аар таслана
        if (event.message?.mid && await isDuplicateWebhookEvent(event.message.mid)) {
            logger.info(`[${shop.name}] Duplicate message skipped`, { mid: event.message.mid });
            continue;
        }

        let customer = platform === 'instagram'
            ? await getOrCreateInstagramCustomer(shop.id, senderId, accessToken)
            : await getOrCreateCustomer(shop.id, senderId, accessToken);
        if (!customer.id) {
            logger.error(`[${shop.name}] Could not resolve customer; message not saved`, { requestId, platform });
            continue;
        }

        customer = await updateCustomerInfo(customer, senderId, accessToken, event.message?.text || '');
        await saveChatHistory(shop.id, customer.id, text);
        await incrementMessageCount(customer.id);
        logger.info(`[${shop.name}] Saved ${platform} message`, { requestId, customerId: customer.id });
    }
}
