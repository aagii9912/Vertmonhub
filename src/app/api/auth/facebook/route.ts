import { NextRequest, NextResponse } from 'next/server';

// Facebook OAuth - Start
export async function GET(request: NextRequest) {
  const appId = process.env.FACEBOOK_APP_ID?.trim();

  if (!appId) {
    return NextResponse.json({ error: 'Facebook App ID not configured' }, { status: 500 });
  }

  // Get the current origin for redirect URI
  const origin = request.nextUrl.origin;
  const redirectUri = `${origin}/api/auth/facebook/callback`;

  // Required permissions for Messenger chatbot
  const permissions = [
    'pages_show_list',
    'pages_messaging',
    // 'pages_read_engagement', // Removed due to invalid scope error
    'pages_manage_metadata',
    'public_profile',
    'email'
  ].join(',');

  // Build Facebook OAuth URL
  const fbAuthUrl = new URL('https://www.facebook.com/v21.0/dialog/oauth');
  fbAuthUrl.searchParams.set('client_id', appId);
  fbAuthUrl.searchParams.set('redirect_uri', redirectUri);
  fbAuthUrl.searchParams.set('scope', permissions);
  fbAuthUrl.searchParams.set('config_id', '946025855026007'); // Facebook Login for Business configuration
  fbAuthUrl.searchParams.set('response_type', 'code');

  return NextResponse.redirect(fbAuthUrl.toString());
}

