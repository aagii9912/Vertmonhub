/**
 * Meta Data Deletion Callback
 * 
 * Required by Meta for GDPR compliance.
 * When a user requests data deletion from Facebook/Instagram,
 * Meta sends a signed request to this endpoint.
 * 
 * @see https://developers.facebook.com/docs/development/create-an-app/app-dashboard/data-deletion-callback
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { safeEqual } from '@/lib/crypto/safe-equal';
import crypto from 'crypto';

const APP_SECRET = process.env.FACEBOOK_APP_SECRET || '';

interface SignedRequestData {
    user_id: string;
    algorithm?: string;
    issued_at?: number;
}

/**
 * Parse and verify a signed request from Meta
 */
function parseSignedRequest(signedRequest: string): SignedRequestData | null {
    try {
        const [encodedSig, payload] = signedRequest.split('.');

        if (!encodedSig || !payload || !APP_SECRET) {
            return null;
        }

        // Decode payload
        const data = JSON.parse(
            Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString()
        );

        // Verify signature
        const expectedSig = crypto
            .createHmac('sha256', APP_SECRET)
            .update(payload)
            .digest('base64')
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '');

        if (!safeEqual(encodedSig, expectedSig)) {
            console.warn('Invalid signature for data deletion request');
            return null;
        }

        return data as SignedRequestData;
    } catch (error) {
        console.error('Error parsing signed request:', error);
        return null;
    }
}

/**
 * Generate a unique confirmation code
 */
function generateConfirmationCode(): string {
    return crypto.randomBytes(16).toString('hex');
}

/**
 * POST /api/meta/data-deletion
 * Handle data deletion request from Meta
 */
export async function POST(request: NextRequest) {
    try {
        const formData = await request.formData();
        const signedRequest = formData.get('signed_request') as string;

        if (!signedRequest) {
            return NextResponse.json(
                { error: 'Missing signed_request parameter' },
                { status: 400 }
            );
        }

        // Parse and verify the signed request
        const data = parseSignedRequest(signedRequest);

        if (!data || !data.user_id) {
            return NextResponse.json(
                { error: 'Invalid signed request' },
                { status: 400 }
            );
        }

        const userId = data.user_id;
        const confirmationCode = generateConfirmationCode();

        // Delete user data from customers table (customers.facebook_id / instagram_id —
        // өмнө нь байхгүй `facebook_user_id` баганаар шүүж юу ч устгадаггүй байв).
        const db = supabaseAdmin();
        const safeId = String(userId).replace(/[^A-Za-z0-9_.-]/g, '');
        const { data: victims, error: findError } = await db
            .from('customers')
            .select('id')
            .or(`facebook_id.eq.${safeId},instagram_id.eq.${safeId}`);
        let deleteError: { message: string } | null = findError ? { message: findError.message } : null;
        const ids = (victims || []).map((v) => v.id);
        if (!deleteError && ids.length > 0) {
            // Харилцагчийн чат түүхийг ч устгана (Meta-ийн шаардлага: хэрэглэгчийн өгөгдөл)
            const { error: chatErr } = await db.from('chat_history').delete().in('customer_id', ids);
            const { error: custErr } = await db.from('customers').delete().in('id', ids);
            deleteError = chatErr || custErr ? { message: (chatErr || custErr)!.message } : null;
        }

        if (deleteError) {
            console.error('Error deleting customer data:', deleteError.message);
            // Still return a confirmation to Meta; status below is 'pending' for follow-up
        }

        // Store deletion request for audit trail (optional - table might not exist)
        try {
            await supabaseAdmin()
                .from('data_deletion_requests')
                .insert({
                    confirmation_code: confirmationCode,
                    user_id: userId,
                    requested_at: new Date().toISOString(),
                    status: deleteError ? 'pending' : 'completed',
                });
        } catch {
            // Table might not exist, that's ok - silently ignore
        }

        // Return the confirmation URL as required by Meta
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://vertmonhub-umber.vercel.app';

        return NextResponse.json({
            url: `${baseUrl}/deletion-status?id=${confirmationCode}`,
            confirmation_code: confirmationCode,
        });

    } catch (error) {
        console.error('Data deletion error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}

/**
 * GET - For testing/health check
 */
export async function GET() {
    return NextResponse.json({
        status: 'ok',
        endpoint: 'Meta Data Deletion Callback',
        description: 'This endpoint handles user data deletion requests from Meta.',
    });
}
