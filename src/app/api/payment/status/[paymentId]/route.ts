import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserShop } from '@/lib/auth/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { checkPaymentStatus, isPaymentCompleted } from '@/lib/payment/qpay';
import { logger } from '@/lib/utils/logger';

/**
 * GET /api/payment/status/[paymentId]
 * Check payment status manually
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ paymentId: string }> }
) {
    try {
        const authShop = await getAuthUserShop();
        if (!authShop) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { paymentId } = await params;
        const supabase = supabaseAdmin();

        // Get payment
        const { data: payment, error } = await supabase
            .from('payments')
            .select('*, orders(id, shop_id)')
            .eq('id', paymentId)
            .single();

        if (error || !payment) {
            return NextResponse.json({ error: 'Payment not found' }, { status: 404 });
        }

        // Verify shop owns this payment
        if (payment.orders?.shop_id !== authShop.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        // If already paid, return current status
        if (payment.status === 'paid') {
            return NextResponse.json({
                status: 'paid',
                payment: {
                    id: payment.id,
                    status: payment.status,
                    paid_at: payment.paid_at,
                    transaction_id: payment.qpay_transaction_id,
                },
            });
        }

        // For QPay payments, check with QPay API
        if (payment.payment_method === 'qpay' && payment.qpay_invoice_id) {
            const paymentCheck = await checkPaymentStatus(payment.qpay_invoice_id);

            if (isPaymentCompleted(paymentCheck)) {
                // Update payment to paid
                await supabase
                    .from('payments')
                    .update({
                        status: 'paid',
                        paid_at: new Date().toISOString(),
                        qpay_transaction_id: paymentCheck.rows[0]?.payment_id,
                    })
                    .eq('id', payment.id);

                return NextResponse.json({
                    status: 'paid',
                    payment: {
                        id: payment.id,
                        status: 'paid',
                        paid_at: new Date().toISOString(),
                    },
                });
            }
        }

        // Still pending
        return NextResponse.json({
            status: payment.status,
            payment: {
                id: payment.id,
                status: payment.status,
                method: payment.payment_method,
                qr_image: payment.qpay_qr_image,
                qr_text: payment.qpay_qr_text,
                expires_at: payment.expires_at,
            },
        });

    } catch (error: unknown) {
        logger.error('Payment status check error:', { error: error instanceof Error ? error.message : String(error) });
        return NextResponse.json({
            error: 'Failed to check payment status'
        }, { status: 500 });
    }
}
