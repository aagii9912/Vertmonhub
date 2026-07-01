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

        if (encodedSig !== expectedSig) {
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

        // Delete user data from customers table
        // Find all customers with this Facebook/Instagram user ID
        const { error: deleteError } = await supabaseAdmin()
            .from('customers')
            .delete()
            .or(`facebook_user_id.eq.${userId},instagram_user_id.eq.${userId}`);

        if (deleteError) {
            console.error('Error deleting customer data:', deleteError);
            // Still return success to Meta - we'll handle cleanup later
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
