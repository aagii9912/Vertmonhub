import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { checkPaymentStatus, isPaymentCompleted, getTransactionId } from '@/lib/payment/qpay';
import { logger } from '@/lib/utils/logger';
import crypto from 'crypto';

/**
 * Verify QPay webhook signature
 */
function verifyWebhookSignature(body: string, signature: string | null): boolean {
    const secret = process.env.QPAY_WEBHOOK_SECRET;
    if (!secret || secret === 'your_qpay_webhook_secret_here') {
        logger.warn('QPAY_WEBHOOK_SECRET not configured — rejecting webhook');
        return false;
    }
    if (!signature) return false;

    try {
        const expected = crypto
            .createHmac('sha256', secret)
            .update(body)
            .digest('hex');

        // Check buffer lengths match before timingSafeEqual (throws if different)
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

/**
 * POST /api/payment/webhook
 * Handle QPay payment webhook callbacks
 * 
 * QPay sends notifications when payment is completed
 */
export async function POST(request: NextRequest) {
    try {
        // SEC-2: Verify webhook signature
        const rawBody = await request.text();
        const signature = request.headers.get('x-qpay-signature');

        if (!verifyWebhookSignature(rawBody, signature)) {
            logger.warn('Invalid webhook signature received');
            return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
        }

        const body = JSON.parse(rawBody);

        logger.info('QPay webhook received:', { data: body });

        // Extract invoice ID from webhook payload
        const invoiceId = body.invoice_id || body.object_id;

        if (!invoiceId) {
            logger.warn('Webhook missing invoice_id');
            return NextResponse.json({ error: 'Invalid webhook data' }, { status: 400 });
        }

        const supabase = supabaseAdmin();

        // Find payment by invoice ID
        const { data: payment, error: paymentError } = await supabase
            .from('payments')
            .select('id, shop_id, status, amount, plan_id, metadata, order_id, payment_method')
            .eq('qpay_invoice_id', invoiceId)
            .single();

        if (paymentError || !payment) {
            logger.warn('Payment not found for invoice:', { error: invoiceId });
            return NextResponse.json({ error: 'Payment not found' }, { status: 404 });
        }

        // Check if already processed
        if (payment.status === 'paid') {
            logger.info('Payment already processed:', { data: payment.id });
            return NextResponse.json({ message: 'Already processed' });
        }

        // Verify payment with QPay API
        const paymentCheck = await checkPaymentStatus(invoiceId);

        if (isPaymentCompleted(paymentCheck)) {
            const transactionId = getTransactionId(paymentCheck);

            // Update payment status
            const { error: updateError } = await supabase
                .from('payments')
                .update({
                    status: 'paid',
                    paid_at: new Date().toISOString(),
                    qpay_transaction_id: transactionId,
                    metadata: {
                        ...payment.metadata,
                        payment_details: paymentCheck.rows[0],
                    },
                })
                .eq('id', payment.id);

            if (updateError) {
                logger.error('Failed to update payment', { error: updateError.message });
                throw new Error('Failed to update payment');
            }

            // Deduct actual stock from products after payment confirmed
            const { deductStockForOrder } = await import('@/lib/services/StockService');
            await deductStockForOrder(payment.order_id);

            // Trigger will auto-update order status
            logger.success('Payment confirmed:', {
                payment_id: payment.id,
                transaction_id: transactionId
            });

            // Send payment confirmation email
            try {
                const { data: orderData } = await supabase
                    .from('orders')
                    .select('*, customers(name, email), shops(name)')
                    .eq('id', payment.order_id)
                    .single();

                if (orderData?.customers?.email) {
                    const { sendPaymentConfirmationEmail } = await import('@/lib/email/email');

                    await sendPaymentConfirmationEmail({
                        customerEmail: orderData.customers.email,
                        customerName: orderData.customers.name,
                        orderId: orderData.id,
                        amount: Number(payment.amount),
                        paymentMethod: payment.payment_method,
                        shopName: orderData.shops.name,
                        invoiceUrl: `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3001'}/api/invoice/${orderData.id}`,
                    });

                    logger.success('Payment confirmation email sent');
                }
            } catch (emailError: unknown) {
                logger.error('Failed to send email (non-critical)', { error: (emailError instanceof Error ? emailError.message : String(emailError)) });
            }

            return NextResponse.json({
                success: true,
                message: 'Payment confirmed'
            });
        } else {
            logger.warn('Payment not completed yet:', { error: invoiceId });
            return NextResponse.json({
                message: 'Payment not completed'
            }, { status: 200 });
        }

    } catch (error: unknown) {
        logger.error('Webhook processing error:', { error: error instanceof Error ? error.message : String(error) });
        return NextResponse.json({
            error: 'Webhook processing failed'
        }, { status: 500 });
    }
}

/**
 * GET /api/payment/webhook
 * Verify webhook endpoint (for QPay setup)
 */
export async function GET(request: NextRequest) {
    return NextResponse.json({
        message: 'QPay webhook endpoint',
        status: 'active'
    });
}
