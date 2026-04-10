/**
 * Subscription Webhook
 * Handle QPay payment callbacks for subscriptions
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { logger } from '@/lib/utils/logger';
import crypto from 'crypto';

/**
 * Verify QPay webhook signature
 */
function verifyWebhookSignature(body: string, signature: string | null): boolean {
    const secret = process.env.QPAY_WEBHOOK_SECRET;
    if (!secret || secret === 'your_qpay_webhook_secret_here') {
        logger.warn('QPAY_WEBHOOK_SECRET not configured — rejecting subscription webhook');
        return false;
    }
    if (!signature) return false;

    try {
        const expected = crypto
            .createHmac('sha256', secret)
            .update(body)
            .digest('hex');

        // Safe comparison: check length first to avoid timingSafeEqual crash
        if (Buffer.byteLength(signature) !== Buffer.byteLength(expected)) {
            return false;
        }

        return crypto.timingSafeEqual(
            Buffer.from(signature),
            Buffer.from(expected)
        );
    } catch {
        return false;
    }
}

export async function POST(request: NextRequest) {
    try {
        // SEC: Verify webhook signature
        const rawBody = await request.text();
        const signature = request.headers.get('x-qpay-signature');

        if (!verifyWebhookSignature(rawBody, signature)) {
            logger.warn('Invalid subscription webhook signature received');
            return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
        }

        const body = JSON.parse(rawBody);
        const { invoice_id, payment_status } = body;

        logger.info('Subscription webhook received', { invoice_id, payment_status });

        if (!invoice_id) {
            return NextResponse.json({ error: 'Invoice ID required' }, { status: 400 });
        }

        const supabase = supabaseAdmin();

        // Get invoice
        const { data: invoice, error: invoiceError } = await supabase
            .from('invoices')
            .select('*, shops(id, name)')
            .eq('qpay_invoice_id', invoice_id)
            .single();

        if (invoiceError || !invoice) {
            logger.warn('Invoice not found', { invoice_id });
            return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
        }

        // Check if already processed
        if (invoice.status === 'paid') {
            return NextResponse.json({ message: 'Already processed' });
        }

        // Update invoice status
        await supabase
            .from('invoices')
            .update({
                status: 'paid',
                paid_at: new Date().toISOString()
            })
            .eq('id', invoice.id);

        // Activate subscription
        const periodEnd = new Date();
        const { data: subscription } = await supabase
            .from('subscriptions')
            .select('billing_cycle, plan_id')
            .eq('shop_id', invoice.shop_id)
            .single();

        if (subscription) {
            periodEnd.setMonth(periodEnd.getMonth() +
                (subscription.billing_cycle === 'yearly' ? 12 : 1));

            await supabase
                .from('subscriptions')
                .update({
                    status: 'active',
                    current_period_start: new Date().toISOString(),
                    current_period_end: periodEnd.toISOString()
                })
                .eq('shop_id', invoice.shop_id);

            // Update shop's plan
            await supabase
                .from('shops')
                .update({ plan_id: subscription.plan_id })
                .eq('id', invoice.shop_id);
        }

        logger.success('Subscription activated', {
            shop: invoice.shops?.name,
            invoice_id
        });

        return NextResponse.json({
            message: 'Subscription activated successfully',
            shop_id: invoice.shop_id
        });
    } catch (error: unknown) {
        logger.error('Subscription webhook error:', { error: error instanceof Error ? error.message : String(error) });
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Webhook processing failed' },
            { status: 500 }
        );
    }
}
