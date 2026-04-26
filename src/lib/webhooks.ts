/**
 * Vertmon Hub — Webhook System
 * 
 * Sends notifications to external services when events occur:
 * - Property status change → Slack/Teams
 * - New lead → Slack notification
 * - Contract signed → Accounting system
 * - Order completed → External CRM
 */

import { supabaseAdmin as getSupabaseAdmin } from '@/lib/supabase';
import { logger } from '@/lib/utils/logger';

export type WebhookEvent =
    | 'property.status_changed'
    | 'lead.created'
    | 'lead.status_changed'
    | 'contract.signed'
    | 'contract.paid'
    | 'viewing.scheduled'
    | 'viewing.completed';

interface WebhookConfig {
    id: string;
    shop_id: string;
    event: WebhookEvent;
    url: string;
    headers?: Record<string, string>;
    is_active: boolean;
    format: 'json' | 'slack' | 'teams';
}

interface WebhookPayload {
    event: WebhookEvent;
    timestamp: string;
    shop_id: string;
    data: any;
}

/** Send webhook to a single endpoint */
async function sendWebhook(config: WebhookConfig, payload: WebhookPayload): Promise<boolean> {
    try {
        let body: string;
        const headers: Record<string, string> = { ...config.headers };

        if (config.format === 'slack') {
            headers['Content-Type'] = 'application/json';
            body = JSON.stringify({
                text: formatSlackMessage(payload),
                blocks: formatSlackBlocks(payload),
            });
        } else if (config.format === 'teams') {
            headers['Content-Type'] = 'application/json';
            body = JSON.stringify({
                '@type': 'MessageCard',
                summary: `Vertmon Hub: ${payload.event}`,
                sections: [{
                    activityTitle: getEventTitle(payload.event),
                    facts: Object.entries(payload.data).map(([k, v]) => ({ name: k, value: String(v) })),
                }],
            });
        } else {
            headers['Content-Type'] = 'application/json';
            body = JSON.stringify(payload);
        }

        const response = await fetch(config.url, {
            method: 'POST',
            headers,
            body,
            signal: AbortSignal.timeout(10000),
        });

        if (!response.ok) {
            logger.error(`Webhook failed: ${config.url}`, { status: response.status });
            return false;
        }

        logger.info(`Webhook sent: ${payload.event} → ${config.url}`);
        return true;
    } catch (error) {
        logger.error('Webhook send error:', { error, url: config.url });
        return false;
    }
}

/** Trigger webhooks for an event */
export async function triggerWebhooks(
    shopId: string,
    event: WebhookEvent,
    data: any
): Promise<{ sent: number; failed: number }> {
    // Fetch active webhook configs for this event
    const { data: configs } = await getSupabaseAdmin()
        .from('webhook_configs')
        .select('*')
        .eq('shop_id', shopId)
        .eq('event', event)
        .eq('is_active', true);

    if (!configs || configs.length === 0) {
        return { sent: 0, failed: 0 };
    }

    const payload: WebhookPayload = {
        event,
        timestamp: new Date().toISOString(),
        shop_id: shopId,
        data,
    };

    let sent = 0, failed = 0;

    await Promise.allSettled(
        configs.map(async (config: WebhookConfig) => {
            const success = await sendWebhook(config, payload);
            if (success) sent++; else failed++;
        })
    );

    try {
        await getSupabaseAdmin().from('webhook_logs').insert({
            shop_id: shopId,
            event,
            payload: data,
            sent_count: sent,
            failed_count: failed,
        });
    } catch { /* Don't fail on log error */ }

    return { sent, failed };
}

// ============================================
// FORMATTERS
// ============================================

function getEventTitle(event: WebhookEvent): string {
    const titles: Record<WebhookEvent, string> = {
        'property.status_changed': '🏠 Байрны статус солигдлоо',
        'lead.created': '🆕 Шинэ лийд',
        'lead.status_changed': '📋 Лийдийн статус солигдлоо',
        'contract.signed': '✍️ Гэрээ байгуулагдлаа',
        'contract.paid': '💰 Төлбөр хийгдлээ',
        'viewing.scheduled': '📅 Үзлэг товлолоо',
        'viewing.completed': '👁️ Үзлэг дуусгалаа',
    };
    return titles[event] || event;
}

function formatSlackMessage(payload: WebhookPayload): string {
    return `${getEventTitle(payload.event)} — ${JSON.stringify(payload.data)}`;
}

function formatSlackBlocks(payload: WebhookPayload): any[] {
    const fields = Object.entries(payload.data).slice(0, 10).map(([key, value]) => ({
        type: 'mrkdwn',
        text: `*${key}:*\n${String(value)}`,
    }));

    return [
        {
            type: 'header',
            text: { type: 'plain_text', text: getEventTitle(payload.event) },
        },
        {
            type: 'section',
            fields,
        },
        {
            type: 'context',
            elements: [{ type: 'mrkdwn', text: `📍 Vertmon Hub • ${new Date(payload.timestamp).toLocaleString('mn-MN')}` }],
        },
    ];
}

// ============================================
// CONVENIENCE METHODS
// ============================================

export async function notifyPropertyStatusChange(shopId: string, data: {
    propertyName: string;
    oldStatus: string;
    newStatus: string;
}) {
    return triggerWebhooks(shopId, 'property.status_changed', data);
}

export async function notifyNewLead(shopId: string, data: {
    customerName: string;
    source: string;
    budget?: string;
    urgency?: string;
}) {
    return triggerWebhooks(shopId, 'lead.created', data);
}

export async function notifyContractSigned(shopId: string, data: {
    propertyName: string;
    buyerName: string;
    price: string;
}) {
    return triggerWebhooks(shopId, 'contract.signed', data);
}
