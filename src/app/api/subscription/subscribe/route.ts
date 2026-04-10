/**
 * Subscribe API
 * Handle subscription creation with QPay payment
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserShop } from '@/lib/auth/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { createQPayInvoice } from '@/lib/payment/qpay';
import { logger } from '@/lib/utils/logger';

export async function POST(request: NextRequest) {
    try {
        const shop = await getAuthUserShop();

        if (!shop) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { plan_id, billing_cycle = 'monthly' } = body;

        if (!plan_id) {
            return NextResponse.json({ error: 'Plan ID is required' }, { status: 400 });
        }

        const supabase = supabaseAdmin();

        // Get the plan
        const { data: plan, error: planError } = await supabase
            .from('plans')
            .select('id, name, price_monthly, price_yearly, features, is_active')
            .eq('id', plan_id)
            .eq('is_active', true)
            .single();

        if (planError || !plan) {
            return NextResponse.json({ error: 'Plan not found' }, { status: 404 });
        }

        // Calculate amount
        const amount = billing_cycle === 'yearly' && plan.price_yearly
            ? plan.price_yearly
            : plan.price_monthly;

        // Check if free plan
        if (amount === 0) {
            // Direct subscription without payment
            const periodEnd = new Date();
            periodEnd.setMonth(periodEnd.getMonth() + (billing_cycle === 'yearly' ? 12 : 1));

            // Create or update subscription
            const { data: subscription, error: subError } = await supabase
                .from('subscriptions')
                .upsert({
                    shop_id: shop.id,
                    plan_id: plan.id,
                    status: 'active',
                    billing_cycle,
                    current_period_start: new Date().toISOString(),
                    current_period_end: periodEnd.toISOString()
                }, {
                    onConflict: 'shop_id'
                })
                .select()
                .single();

            if (subError) throw subError;

            // Update shop's plan
            await supabase
                .from('shops')
                .update({ plan_id: plan.id })
                .eq('id', shop.id);

            return NextResponse.json({
                subscription,
                message: 'Subscribed to free plan successfully',
                payment_required: false
            });
        }

        // Create invoice for paid plan
        const { data: invoice, error: invoiceError } = await supabase
            .from('invoices')
            .insert({
                shop_id: shop.id,
                amount,
                description: `${plan.name} - ${billing_cycle === 'yearly' ? 'Жилийн' : 'Сарын'} захиалга`
            })
            .select()
            .single();

        if (invoiceError) throw invoiceError;

        // Create QPay invoice
        try {
            const qpayResult = await createQPayInvoice({
                orderId: invoice.id,
                amount,
                description: `Syncly ${plan.name} Plan`,
                callbackUrl: `${process.env.NEXT_PUBLIC_APP_URL || 'https://www.syncly.mn'}/api/subscription/webhook`
            });

            if (!qpayResult) {
                return NextResponse.json({
                    invoice_id: invoice.id,
                    invoice_number: invoice.invoice_number,
                    amount,
                    message: 'QPay одоогоор түр ажиллахгүй байна. Дараа дахин оролдоно уу.',
                    payment_required: true,
                    qpay_error: true
                });
            }

            // Update invoice with QPay info
            await supabase
                .from('invoices')
                .update({
                    qpay_invoice_id: qpayResult.invoice_id,
                    qpay_qr_code: qpayResult.qr_image,
                    qpay_urls: qpayResult.urls
                })
                .eq('id', invoice.id);

            // Store pending subscription info
            await supabase
                .from('subscriptions')
                .upsert({
                    shop_id: shop.id,
                    plan_id: plan.id,
                    status: 'pending',
                    billing_cycle
                }, {
                    onConflict: 'shop_id'
                });

            return NextResponse.json({
                invoice_id: invoice.id,
                invoice_number: invoice.invoice_number,
                amount,
                qr_code: qpayResult.qr_image,
                urls: qpayResult.urls,
                message: 'QR кодоор төлбөрөө төлнө үү',
                payment_required: true
            });
        } catch (qpayError: unknown) {
            logger.error('QPay error:', { error: qpayError });

            // Return invoice without QPay for manual payment
            return NextResponse.json({
                invoice_id: invoice.id,
                invoice_number: invoice.invoice_number,
                amount,
                message: 'Төлбөрийн систем түр ажиллахгүй байна. Дараа дахин оролдоно уу.',
                payment_required: true,
                qpay_error: true
            });
        }
    } catch (error: unknown) {
        logger.error('Subscribe error:', { error: error instanceof Error ? error.message : String(error) });
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to subscribe' },
            { status: 500 }
        );
    }
}
