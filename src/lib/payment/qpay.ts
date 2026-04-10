/**
 * QPay Mongolia API Client
 * Official API: https://developer.qpay.mn
 * 
 * Features:
 * - OAuth authentication
 * - Invoice creation with QR codes
 * - Payment status checking
 * - Webhook validation
 */

import { logger } from '@/lib/utils/logger';
import { qpayBreaker } from '@/lib/ai/resilience/circuitBreaker';
import crypto from 'crypto';

// QPay API Configuration
const QPAY_CONFIG = {
    uat: {
        authUrl: 'https://merchant-sandbox.qpay.mn/v2/auth/token',
        apiUrl: 'https://merchant-sandbox.qpay.mn/v2',
    },
    production: {
        authUrl: 'https://merchant.qpay.mn/v2/auth/token',
        apiUrl: 'https://merchant.qpay.mn/v2',
    }
};

const ENV = (process.env.QPAY_ENV || 'uat') as 'uat' | 'production';
const BASE_URL = QPAY_CONFIG[ENV].apiUrl;
const AUTH_URL = QPAY_CONFIG[ENV].authUrl;

// Credentials from environment
const CLIENT_ID = process.env.QPAY_CLIENT_ID;
const CLIENT_SECRET = process.env.QPAY_CLIENT_SECRET;
const MERCHANT_ID = process.env.QPAY_MERCHANT_ID;

interface QPayTokenResponse {
    access_token: string;
    token_type: string;
    expires_in: number;
    refresh_token: string;
}

interface QPayInvoice {
    invoice_id: string;
    qr_text: string;
    qr_image: string;
    qpay_shorturl: string;
    urls: {
        name: string;
        description: string;
        logo: string;
        link: string;
    }[];
}

interface QPayInvoiceLine {
    line_description: string;
    line_quantity: string;
    line_unit_price: string;
    note?: string;
}

interface QPayInvoiceRequest {
    invoice_code: string;
    sender_invoice_no: string;
    invoice_receiver_code?: string;
    invoice_description: string;
    amount?: number;
    callback_url?: string;
    allow_partial: boolean;
    allow_exceed: boolean;
    lines: QPayInvoiceLine[];
}

interface QPayPaymentCheck {
    count: number;
    paid_amount: number;
    rows: Array<{
        payment_id: string;
        payment_status: string;
        payment_amount: number;
        payment_currency: string;
        payment_wallet: string;
        payment_date: string;
    }>;
}

// In-memory token cache (consider Redis for production multi-instance setup)
let cachedToken: { token: string; expiresAt: number } | null = null;

/**
 * Get QPay access token (cached)
 */
async function getAccessToken(): Promise<string> {
    // Check if credentials are available
    if (!CLIENT_ID || !CLIENT_SECRET) {
        logger.warn('QPay credentials not configured, using mock mode');
        return 'mock_token_for_testing';
    }

    // Return cached token if still valid
    if (cachedToken && cachedToken.expiresAt > Date.now()) {
        logger.debug('Using cached QPay token');
        return cachedToken.token;
    }

    try {
        logger.info('Fetching new QPay access token');

        const credentials = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');

        const response = await fetch(AUTH_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Basic ${credentials}`,
                'Content-Type': 'application/json',
            },
        });

        if (!response.ok) {
            throw new Error(`QPay auth failed: ${response.status} ${response.statusText}`);
        }

        const data: QPayTokenResponse = await response.json();

        // Cache token (expires_in is in seconds, subtract 60s buffer)
        cachedToken = {
            token: data.access_token,
            expiresAt: Date.now() + (data.expires_in - 60) * 1000,
        };

        logger.success('QPay access token obtained');
        return data.access_token;
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.error('Failed to get QPay access token', { error: errorMessage });
        throw error;
    }
}

/**
 * Create QPay invoice for an order
 */
export async function createQPayInvoice(params: {
    orderId: string;
    amount: number;
    description: string;
    callbackUrl?: string;
    items?: Array<{ name: string; quantity: number; unitPrice: number }>;
}): Promise<QPayInvoice | null> {
    const { orderId, amount, description, callbackUrl, items } = params;

    // Circuit breaker check - skip if QPay is known to be down
    if (!qpayBreaker.isAllowed()) {
        logger.warn('QPay circuit breaker OPEN — skipping invoice creation');
        return null;
    }

    // Mock mode if credentials not available
    if (!CLIENT_ID || !CLIENT_SECRET || !MERCHANT_ID) {
        logger.warn('QPay in mock mode - returning fake QR code');
        return {
            invoice_id: `MOCK_INV_${orderId}`,
            qr_text: `MOCK_QPAY_${orderId}`,
            qr_image: `https://api.qrserver.com/v1/create-qr-code/?data=MOCK_${orderId}&size=300x300`,
            qpay_shorturl: `https://sandbox.qpay.mn/mock/${orderId}`,
            urls: [],
        };
    }

    try {
        const token = await getAccessToken();

        // Build lines from items, or fallback to single line with total amount
        const lines: QPayInvoiceLine[] = items && items.length > 0
            ? items.map(item => ({
                line_description: item.name,
                line_quantity: item.quantity.toFixed(2),
                line_unit_price: item.unitPrice.toFixed(2),
            }))
            : [{
                line_description: description,
                line_quantity: '1.00',
                line_unit_price: amount.toFixed(2),
            }];

        const invoiceRequest: QPayInvoiceRequest = {
            invoice_code: MERCHANT_ID,
            sender_invoice_no: orderId,
            invoice_description: description,
            callback_url: callbackUrl,
            allow_partial: false,
            allow_exceed: false,
            lines,
        };

        logger.info('Creating QPay invoice:', { orderId, amount });

        const response = await fetch(`${BASE_URL}/invoice`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(invoiceRequest),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`QPay invoice creation failed: ${response.status} - ${errorText}`);
        }

        const invoice: QPayInvoice = await response.json();

        qpayBreaker.recordSuccess();
        logger.success('QPay invoice created:', { invoice_id: invoice.invoice_id });
        return invoice;
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        qpayBreaker.recordFailure(error instanceof Error ? error : errorMessage);
        logger.error('Failed to create QPay invoice', { error: errorMessage });
        return null;
    }
}

/**
 * Check payment status for an invoice
 */
export async function checkPaymentStatus(invoiceId: string): Promise<QPayPaymentCheck> {
    // Circuit breaker check
    if (!qpayBreaker.isAllowed()) {
        logger.warn('QPay circuit breaker OPEN — skipping payment check');
        throw new Error('QPay түр ажиллахгүй байна. Түр хүлээгээд дахин оролдоно уу.');
    }

    // Mock mode
    if (!CLIENT_ID || !CLIENT_SECRET) {
        logger.warn('QPay in mock mode - returning unpaid status');
        return {
            count: 0,
            paid_amount: 0,
            rows: [],
        };
    }

    try {
        const token = await getAccessToken();

        logger.info('Checking QPay payment status:', { invoiceId });

        const response = await fetch(`${BASE_URL}/payment/check`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                object_type: 'INVOICE',
                object_id: invoiceId,
                offset: {
                    page_number: 1,
                    page_limit: 100,
                },
            }),
        });

        if (!response.ok) {
            throw new Error(`QPay check failed: ${response.status}`);
        }

        const result: QPayPaymentCheck = await response.json();

        qpayBreaker.recordSuccess();
        logger.info('QPay payment check result:', {
            invoiceId,
            paid: result.count > 0,
            amount: result.paid_amount
        });

        return result;
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        qpayBreaker.recordFailure(error instanceof Error ? error : errorMessage);
        logger.error('Failed to check QPay payment', { error: errorMessage });
        throw error;
    }
}

/**
 * Validate QPay webhook signature (if needed)
 * QPay may send HMAC signatures for webhook security
 */
export function validateWebhookSignature(
    payload: string,
    signature: string,
    secret: string
): boolean {
    try {
        const expectedSignature = crypto
            .createHmac('sha256', secret)
            .update(payload)
            .digest('hex');

        return signature === expectedSignature;
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.error('Webhook signature validation error', { error: errorMessage });
        return false;
    }
}

/**
 * Helper: Check if payment is completed
 */
export function isPaymentCompleted(checkResult: QPayPaymentCheck): boolean {
    return checkResult.count > 0 && checkResult.paid_amount > 0;
}

/**
 * Helper: Get transaction ID from payment check result
 */
export function getTransactionId(checkResult: QPayPaymentCheck): string | null {
    if (checkResult.rows && checkResult.rows.length > 0) {
        return checkResult.rows[0].payment_id;
    }
    return null;
}
