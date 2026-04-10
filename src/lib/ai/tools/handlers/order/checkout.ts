import { supabaseAdmin } from '@/lib/supabase';
import { logger } from '@/lib/utils/logger';
import { sendOrderNotification } from '@/lib/notifications';
import { getCartFromDB } from '../../../helpers/stockHelpers';
import { createQPayInvoice } from '@/lib/payment/qpay';
import type { CheckoutArgs } from '../../definitions';
import type { ToolExecutionResult, ToolExecutionContext } from '../../../services/ToolExecutor';

export async function executeCheckout(
    args: CheckoutArgs,
    context: ToolExecutionContext
): Promise<ToolExecutionResult> {
    const { notes } = args;
    const supabase = supabaseAdmin();

    if (!context.customerId) {
        return { success: false, error: 'No customer context' };
    }

    const cart = await getCartFromDB(context.shopId, context.customerId);

    if (!cart || cart.items.length === 0) {
        return { success: false, error: 'Сагс хоосон байна. Эхлээд бараа нэмнэ үү.' };
    }

    const { data: orderId, error: checkoutError } = await supabase.rpc('checkout_cart', {
        p_cart_id: cart.id,
        p_notes: notes || 'AI Chat Checkout'
    });

    if (checkoutError) {
        logger.error('Checkout error:', { error: checkoutError });
        return { success: false, error: checkoutError.message };
    }

    let qpayInvoice = null;
    let bankInfo = null;
    let qpayFailed = false;

    try {
        const { data: shop } = await supabase
            .from('shops')
            .select('bank_name, account_number, account_name')
            .eq('id', context.shopId)
            .single();

        bankInfo = shop;
    } catch (err) {
        logger.warn('Failed to fetch shop bank info:', { error: String(err) });
    }

    try {
        qpayInvoice = await createQPayInvoice({
            orderId: orderId,
            amount: cart.total_amount,
            description: `Order #${orderId.substring(0, 8)}`,
            callbackUrl: `${process.env.NEXT_PUBLIC_APP_URL || 'https://www.syncly.mn'}/api/payment/webhook`,
            items: cart.items.map(item => ({
                name: item.name,
                quantity: item.quantity,
                unitPrice: item.unit_price,
            })),
        });
        if (!qpayInvoice) {
            qpayFailed = true;
        }
    } catch (err) {
        logger.warn('QPay invoice creation failed:', { error: String(err) });
        qpayFailed = true;
    }

    // Create payment record in DB so webhook can find it
    try {
        const paymentData: Record<string, unknown> = {
            order_id: orderId,
            shop_id: context.shopId,
            payment_method: qpayInvoice ? 'qpay' : (bankInfo?.account_number ? 'bank_transfer' : 'cash'),
            amount: cart.total_amount,
            status: 'pending',
        };

        if (qpayInvoice) {
            paymentData.qpay_invoice_id = qpayInvoice.invoice_id;
            paymentData.qpay_qr_text = qpayInvoice.qr_text;
            paymentData.qpay_qr_image = qpayInvoice.qr_image;
            paymentData.metadata = {
                qpay_shorturl: qpayInvoice.qpay_shorturl,
                urls: qpayInvoice.urls,
                source: 'ai_checkout',
            };
            paymentData.expires_at = new Date(Date.now() + 15 * 60 * 1000).toISOString();
        }

        const { error: paymentInsertError } = await supabase
            .from('payments')
            .insert(paymentData);

        if (paymentInsertError) {
            logger.warn('Failed to create payment record:', { error: paymentInsertError.message });
        } else {
            logger.info('Payment record created for AI checkout:', { orderId });
        }
    } catch (payErr) {
        logger.warn('Payment record creation failed (non-critical):', { error: String(payErr) });
    }

    if (context.notifySettings?.order !== false) {
        try {
            await sendOrderNotification(context.shopId, 'new', {
                orderId: orderId,
                customerName: context.customerName,
                totalAmount: cart.total_amount,
            });
        } catch (notifyError) {
            logger.warn('Notification failed but order created:', { error: String(notifyError) });
        }
    }

    let paymentMsg = `Захиалга #${orderId.substring(0, 8)} амжилттай үүслээ! Нийт: ${cart.total_amount.toLocaleString()}₮\n\nТөлбөр төлөх сонголтууд:`;

    if (qpayInvoice) {
        paymentMsg += `\n\n1. QPay (Хялбар): Доорх линкээр орж эсвэл QR кодыг уншуулж төлнө үү.\n${qpayInvoice.qpay_shorturl}`;
    } else if (qpayFailed) {
        paymentMsg += `\n\n⚠️ QPay одоогоор түр ажиллахгүй байна. Дансаар шилжүүлнэ үү.`;
    }

    if (bankInfo && bankInfo.account_number) {
        const bankNum = qpayInvoice ? '2' : '1';
        paymentMsg += `\n\n${bankNum}. Дансны шилжүүлэг:\nБанк: ${bankInfo.bank_name || 'Банк'}\nДанс: ${bankInfo.account_number}\nНэр: ${bankInfo.account_name || 'Дэлгүүр'}\nГүйлгээний утга: ${orderId.substring(0, 8)}`;
        paymentMsg += `\n\n*Дансаар шилжүүлсэн бол баримтаа илгээнэ үү.`;
    }

    return {
        success: true,
        message: paymentMsg,
        data: { order_id: orderId, qpay: qpayInvoice, bank: bankInfo, qpay_failed: qpayFailed },
        actions: [
            {
                type: 'payment_method',
                buttons: [
                    ...(qpayInvoice ? [{
                        id: 'pay_qpay',
                        label: 'QPay төлөх',
                        icon: 'qpay',
                        variant: 'primary' as const,
                        payload: `OPEN_QPAY:${qpayInvoice.qpay_shorturl}`,
                    }] : []),
                    ...(bankInfo?.account_number ? [{
                        id: 'pay_bank',
                        label: 'Дансаар шилжүүлэх',
                        icon: 'bank',
                        variant: 'secondary' as const,
                        payload: 'PAY_BANK',
                    }] : []),
                ],
                context: { order_id: orderId },
            },
            {
                type: 'order_actions',
                buttons: [
                    {
                        id: 'check_payment',
                        label: '💰 Төлбөр шалгах',
                        variant: 'secondary' as const,
                        payload: 'CHECK_PAYMENT',
                    },
                    {
                        id: 'cancel_order',
                        label: 'Цуцлах',
                        icon: 'cancel',
                        variant: 'danger' as const,
                        payload: 'CANCEL_ORDER',
                    },
                ],
                context: { order_id: orderId },
            },
        ],
    };
}
