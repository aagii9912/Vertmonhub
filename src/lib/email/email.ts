/**
 * Email Service using Resend
 * Sends transactional emails for order updates
 */

import { Resend } from 'resend';
import { logger } from '@/lib/utils/logger';

// Initialize Resend client
const resend = process.env.RESEND_API_KEY
    ? new Resend(process.env.RESEND_API_KEY)
    : null;

const FROM_EMAIL = process.env.EMAIL_FROM || 'orders@vertmon.mn';

interface EmailParams {
    to: string;
    subject: string;
    html: string;
}

/**
 * Send email via Resend
 */
async function sendEmail({ to, subject, html }: EmailParams): Promise<boolean> {
    // Skip if no API key (development mode)
    if (!resend) {
        logger.warn('Resend not configured, email not sent:', { to, subject });
        return false;
    }

    try {
        const { data, error } = await resend.emails.send({
            from: FROM_EMAIL,
            to: [to],
            subject,
            html,
        });

        if (error) {
            logger.error('Email sending failed:', error);
            return false;
        }

        logger.success('Email sent successfully:', { to, subject, id: data?.id });
        return true;
    } catch (error) {
        logger.error('Email error:', { error: error instanceof Error ? error.message : 'Unknown error' });
        return false;
    }
}

/**
 * Захирлын өдрийн тайлан (digest) — шинэ лийд, гэрээ, топ менежерүүд.
 */
export interface DirectorDigestData {
    shopName: string;
    date: string;
    newLeads: number;
    newContracts: number;
    activeContracts: number;
    totalSales: number;
    collected: number;
    overdueCount: number;
    topManagers: Array<{ name: string; contracts: number; sales: number }>;
}
export async function sendDirectorDigestEmail(to: string, d: DirectorDigestData): Promise<boolean> {
    const money = (n: number) => new Intl.NumberFormat('mn-MN').format(Math.round(n)) + '₮';
    const tile = (label: string, value: string) =>
        `<td style="padding:12px;background:#f9fafb;border-radius:8px;text-align:center;width:25%">
            <div style="font-size:22px;font-weight:700;color:#111">${value}</div>
            <div style="font-size:12px;color:#6b7280">${label}</div>
        </td>`;
    const managerRows = d.topManagers.length
        ? d.topManagers.map((m, i) =>
            `<tr><td style="padding:8px;border-bottom:1px solid #eee">${i + 1}. ${m.name}</td>
             <td style="padding:8px;border-bottom:1px solid #eee;text-align:right">${m.contracts} гэрээ</td>
             <td style="padding:8px;border-bottom:1px solid #eee;text-align:right">${money(m.sales)}</td></tr>`).join('')
        : `<tr><td colspan="3" style="padding:8px;color:#6b7280">Мэдээлэл алга</td></tr>`;

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="font-family:Arial,sans-serif;color:#333;background:#f3f4f6;padding:20px">
  <div style="max-width:640px;margin:0 auto;background:#fff;border-radius:10px;overflow:hidden">
    <div style="background:#C2613A;color:#fff;padding:22px 24px">
      <div style="font-size:18px;font-weight:700">${d.shopName} — Өдрийн тайлан</div>
      <div style="font-size:13px;opacity:.9">${d.date}</div>
    </div>
    <div style="padding:24px">
      <table style="width:100%;border-collapse:separate;border-spacing:8px"><tr>
        ${tile('Шинэ лийд', String(d.newLeads))}
        ${tile('Шинэ гэрээ', String(d.newContracts))}
        ${tile('Идэвхтэй гэрээ', String(d.activeContracts))}
        ${tile('Хоцролттой', String(d.overdueCount))}
      </tr></table>
      <table style="width:100%;border-collapse:separate;border-spacing:8px;margin-top:4px"><tr>
        ${tile('Нийт борлуулалт', money(d.totalSales))}
        ${tile('Цуглуулсан', money(d.collected))}
      </tr></table>
      <h3 style="margin:24px 0 8px;font-size:15px;color:#111">🏆 Топ менежерүүд</h3>
      <table style="width:100%;border-collapse:collapse;font-size:13px">${managerRows}</table>
      <p style="margin-top:24px;font-size:12px;color:#9ca3af">Энэ тайланг Vertmon Hub автоматаар илгээв.</p>
    </div>
  </div>
</body></html>`;

    return sendEmail({ to, subject: `${d.shopName} — Өдрийн тайлан (${d.date})`, html });
}

/**
 * Order Confirmation Email
 */
export async function sendOrderConfirmationEmail(params: {
    customerEmail: string;
    customerName: string;
    orderId: string;
    orderTotal: number;
    items: Array<{ name: string; quantity: number; price: number }>;
    shopName: string;
}): Promise<boolean> {
    const { customerEmail, customerName, orderId, orderTotal, items, shopName } = params;

    const html = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #4F46E5; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
        .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
        .order-details { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; }
        .item { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #e5e7eb; }
        .total { font-size: 18px; font-weight: bold; color: #4F46E5; text-align: right; margin-top: 15px; }
        .footer { text-align: center; color: #6b7280; font-size: 12px; margin-top: 30px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>✓ Захиалга баталгаажлаа!</h1>
        </div>
        <div class="content">
            <p>Сайн байна уу <strong>${customerName}</strong>,</p>
            <p>Таны захиалгыг амжилттай хүлээн авлаа. Баярлалаа!</p>
            
            <div class="order-details">
                <h3>Захиалгын дэлгэрэнгүй</strong></h3>
                <p><strong>Захиалгын дугаар:</strong> ${orderId.slice(0, 8)}</p>
                
                <div style="margin-top: 20px;">
                    ${items.map(item => `
                        <div class="item">
                            <span>${item.name} x${item.quantity}</span>
                            <span>${new Intl.NumberFormat('mn-MN').format(item.price * item.quantity)}₮</span>
                        </div>
                    `).join('')}
                </div>
                
                <div class="total">
                    Нийт: ${new Intl.NumberFormat('mn-MN').format(orderTotal)}₮
                </div>
            </div>
            
            <p>Бид таны захиалгыг боловсруулж, удахгүй холбогдох болно.</p>
            
            <div class="footer">
                <p>${shopName}</p>
                <p>Энэ имэйл нь Vertmon Hub системээс автоматаар илгээгдсэн</p>
            </div>
        </div>
    </div>
</body>
</html>
    `;

    return sendEmail({
        to: customerEmail,
        subject: `Захиалга баталгаажлаа - ${shopName}`,
        html,
    });
}

/**
 * Payment Confirmation Email
 */
export async function sendPaymentConfirmationEmail(params: {
    customerEmail: string;
    customerName: string;
    orderId: string;
    amount: number;
    paymentMethod: string;
    shopName: string;
    invoiceUrl?: string;
}): Promise<boolean> {
    const { customerEmail, customerName, orderId, amount, paymentMethod, shopName, invoiceUrl } = params;

    const paymentLabels: Record<string, string> = {
        'qpay': 'QPay',
        'cash': 'Бэлэн мөнгө',
        'bank_transfer': 'Шилжүүлэг',
    };

    const html = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #10B981; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
        .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
        .payment-box { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; text-align: center; }
        .amount { font-size: 28px; font-weight: bold; color: #10B981; margin: 15px 0; }
        .button { display: inline-block; background: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 15px; }
        .footer { text-align: center; color: #6b7280; font-size: 12px; margin-top: 30px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>✓ Төлбөр баталгаажлаа!</h1>
        </div>
        <div class="content">
            <p>Сайн байна уу <strong>${customerName}</strong>,</p>
            <p>Таны төлбөрийг амжилттай хүлээн авлаа.</p>
            
            <div class="payment-box">
                <p><strong>Захиалгын дугаар:</strong> ${orderId.slice(0, 8)}</p>
                <div class="amount">${new Intl.NumberFormat('mn-MN').format(amount)}₮</div>
                <p>Төлбөрийн хэлбэр: ${paymentLabels[paymentMethod] || paymentMethod}</p>
                
                ${invoiceUrl ? `
                    <a href="${invoiceUrl}" class="button">Нэхэмжлэх харах</a>
                ` : ''}
            </div>
            
            <p>Таны захиалгыг бэлтгэж, хүргэлтэнд гаргах болно.</p>
            
            <div class="footer">
                <p>${shopName}</p>
                <p>Баярлалаа!</p>
            </div>
        </div>
    </div>
</body>
</html>
    `;

    return sendEmail({
        to: customerEmail,
        subject: `Төлбөр баталгаажлаа - ${shopName}`,
        html,
    });
}

/**
 * Shipping Update Email
 */
export async function sendShippingUpdateEmail(params: {
    customerEmail: string;
    customerName: string;
    orderId: string;
    shopName: string;
    trackingNumber?: string;
}): Promise<boolean> {
    const { customerEmail, customerName, orderId, shopName, trackingNumber } = params;

    const html = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #F59E0B; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
        .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
        .info-box { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; }
        .footer { text-align: center; color: #6b7280; font-size: 12px; margin-top: 30px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>📦 Захиалга илгээгдлээ!</h1>
        </div>
        <div class="content">
            <p>Сайн байна уу <strong>${customerName}</strong>,</p>
            <p>Таны захиалга хүргэлтэнд гарлаа!</p>
            
            <div class="info-box">
                <p><strong>Захиалгын дугаар:</strong> ${orderId.slice(0, 8)}</p>
                ${trackingNumber ? `<p><strong>Tracking №:</strong> ${trackingNumber}</p>` : ''}
                <p>Бид тантай удахгүй холбогдох болно.</p>
            </div>
            
            <div class="footer">
                <p>${shopName}</p>
            </div>
        </div>
    </div>
</body>
</html>
    `;

    return sendEmail({
        to: customerEmail,
        subject: `Захиалга илгээгдлээ - ${shopName}`,
        html,
    });
}

/**
 * Delivery Confirmation Email
 */
export async function sendDeliveryConfirmationEmail(params: {
    customerEmail: string;
    customerName: string;
    orderId: string;
    shopName: string;
}): Promise<boolean> {
    const { customerEmail, customerName, orderId, shopName } = params;

    const html = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #10B981; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
        .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
        .success-box { background: white; padding: 30px; border-radius: 8px; margin: 20px 0; text-align: center; }
        .icon { font-size: 48px; margin-bottom: 15px; }
        .footer { text-align: center; color: #6b7280; font-size: 12px; margin-top: 30px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>✓ Захиалга хүргэгдлээ!</h1>
        </div>
        <div class="content">
            <p>Сайн байна уу <strong>${customerName}</strong>,</p>
            
            <div class="success-box">
                <div class="icon">🎉</div>
                <h2>Баярлалаа!</h2>
                <p>Таны захиалга амжилттай хүргэгдлээ.</p>
                <p><strong>Захиалгын дугаар:</strong> ${orderId.slice(0, 8)}</p>
            </div>
            
            <p>Бидэнтэй худалдан авалт хийсэнд баярлалаа. Дахин уулзацгаая!</p>
            
            <div class="footer">
                <p>${shopName}</p>
            </div>
        </div>
    </div>
</body>
</html>
    `;

    return sendEmail({
        to: customerEmail,
        subject: `Захиалга хүргэгдлээ - ${shopName}`,
        html,
    });
}
