import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserShop } from '@/lib/auth/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { createQPayInvoice } from '@/lib/payment/qpay';
import { logger } from '@/lib/utils/logger';

/**
 * POST /api/payment/create
 * Create payment for an order
 * 
 * Body: {
 *   orderId: string,
 *   paymentMethod: 'qpay' | 'cash' | 'bank_transfer'
 * }
 */
export async function POST(request: NextRequest) {
    try {
        const authShop = await getAuthUserShop();
        if (!authShop) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { orderId, paymentMethod } = body;

        if (!orderId || !paymentMethod) {
            return NextResponse.json({
                error: 'Missing required fields: orderId, paymentMethod'
            }, { status: 400 });
        }

        const supabase = supabaseAdmin();

        // Get order details
        const { data: order, error: orderError } = await supabase
            .from('orders')
            .select('id, shop_id, total_amount, customer_id, customers(name, email, phone)')
            .eq('id', orderId)
            .eq('shop_id', authShop.id)
            .single();

        if (orderError || !order) {
            return NextResponse.json({ error: 'Order not found' }, { status: 404 });
        }

        // Check if payment already exists
        const { data: existingPayment } = await supabase
            .from('payments')
            .select('id, shop_id, amount, status, created_at')
            .eq('order_id', orderId)
            .eq('status', 'paid')
            .single();

        if (existingPayment) {
            return NextResponse.json({
                error: 'Order already paid',
                payment: existingPayment
            }, { status: 400 });
        }

        // Handle different payment methods
        if (paymentMethod === 'qpay') {
            // Create QPay invoice
            const callbackUrl = `${request.nextUrl.origin}/api/payment/webhook`;

            const qpayInvoice = await createQPayInvoice({
                orderId: order.id,
                amount: Number(order.total_amount),
                description: `Order ${order.id.slice(0, 8)} - ${authShop.name}`,
                callbackUrl,
            });

            if (!qpayInvoice) {
                return NextResponse.json({
                    error: 'QPay одоогоор түр ажиллахгүй байна. Дансаар шилжүүлэх эсвэл түр хүлээгээд дахин оролдоно уу.',
                    code: 'QPAY_UNAVAILABLE'
                }, { status: 503 });
            }

            // Create payment record
            const { data: payment, error: paymentError } = await supabase
                .from('payments')
                .insert({
                    order_id: order.id,
                    shop_id: authShop.id,
                    payment_method: 'qpay',
                    amount: order.total_amount,
                    status: 'pending',
                    qpay_invoice_id: qpayInvoice.invoice_id,
                    qpay_qr_text: qpayInvoice.qr_text,
                    qpay_qr_image: qpayInvoice.qr_image,
                    metadata: {
                        qpay_shorturl: qpayInvoice.qpay_shorturl,
                        urls: qpayInvoice.urls,
                    },
                    expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(), // 15 min expiry
                })
                .select()
                .single();

            if (paymentError) {
                logger.error('Failed to create payment record', { error: paymentError.message });
                throw new Error('Failed to create payment');
            }

            logger.success('QPay payment created:', {
                payment_id: payment.id,
                invoice_id: qpayInvoice.invoice_id
            });

            return NextResponse.json({
                success: true,
                payment: {
                    id: payment.id,
                    qr_text: qpayInvoice.qr_text,
                    qr_image: qpayInvoice.qr_image,
                    shorturl: qpayInvoice.qpay_shorturl,
                    expires_at: payment.expires_at,
                },
            });

        } else if (paymentMethod === 'cash' || paymentMethod === 'bank_transfer') {
            // Create pending payment for manual methods
            const { data: payment, error: paymentError } = await supabase
                .from('payments')
                .insert({
                    order_id: order.id,
                    shop_id: authShop.id,
                    payment_method: paymentMethod,
                    amount: order.total_amount,
                    status: 'pending',
                })
                .select()
                .single();

            if (paymentError) {
                throw new Error('Failed to create payment');
            }

            // Update order payment method
            await supabase
                .from('orders')
                .update({ payment_method: paymentMethod })
                .eq('id', orderId);

            logger.success(`${paymentMethod} payment created:`, { payment_id: payment.id });

            return NextResponse.json({
                success: true,
                payment: {
                    id: payment.id,
                    method: paymentMethod,
                    amount: payment.amount,
                    status: payment.status,
                },
            });

        } else {
            return NextResponse.json({
                error: 'Invalid payment method'
            }, { status: 400 });
        }

    } catch (error: unknown) {
        logger.error('Payment creation error:', { error: error instanceof Error ? error.message : String(error) });
        return NextResponse.json({
            error: error instanceof Error ? error.message : 'Payment creation failed'
        }, { status: 500 });
    }
}
