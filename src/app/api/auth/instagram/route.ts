import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

// Instagram OAuth - Start (uses Facebook OAuth with Instagram permissions)
export async function GET(request: NextRequest) {
    const appId = process.env.FACEBOOK_APP_ID?.trim();

    if (!appId) {
        return NextResponse.json({ error: 'Facebook App ID not configured' }, { status: 500 });
    }

    // Get the current origin for redirect URI
    const origin = request.nextUrl.origin;
    const redirectUri = `${origin}/api/auth/instagram/callback`;

    // Required permissions for Instagram messaging
    const permissions = [
        'pages_show_list',
        'pages_read_engagement',
        'pages_messaging',
        'pages_manage_metadata',
        'instagram_basic',
        'instagram_manage_messages',
        'instagram_manage_comments',
        'instagram_manage_insights',
        'public_profile',
    ].join(',');

    // Build Facebook OAuth URL (Instagram uses same OAuth flow)
    const fbAuthUrl = new URL('https://www.facebook.com/v21.0/dialog/oauth');
    fbAuthUrl.searchParams.set('client_id', appId);
    fbAuthUrl.searchParams.set('redirect_uri', redirectUri);
    fbAuthUrl.searchParams.set('scope', permissions);
    fbAuthUrl.searchParams.set('response_type', 'code');

    // CSRF state — sameSite:'lax' заавал (facebook.com-оос буцах redirect-д cookie илгээгдэнэ)
    const state = crypto.randomBytes(32).toString('hex');
    fbAuthUrl.searchParams.set('state', state);

    const response = NextResponse.redirect(fbAuthUrl.toString());
    response.cookies.set('ig_oauth_state', state, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 600,
        path: '/',
    });
    return response;
}
