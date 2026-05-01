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

  // Phase 1: read-only scopes — list user's pages and read posts/engagement.
  // No messaging, no metadata writes (those come in Phase 2 with the chatbot).
  // read_insights is gated by App Review and not in standard access, so we
  // skip it for now — the marketing/insights endpoint will degrade gracefully
  // when the permission isn't granted.
  const permissions = [
    'pages_show_list',
    'pages_read_engagement',
    'public_profile',
    'email'
  ].join(',');

  const configId = process.env.FACEBOOK_LOGIN_CONFIG_ID?.trim();

  // Build Facebook OAuth URL
  const fbAuthUrl = new URL('https://www.facebook.com/v21.0/dialog/oauth');
  fbAuthUrl.searchParams.set('client_id', appId);
  fbAuthUrl.searchParams.set('redirect_uri', redirectUri);
  fbAuthUrl.searchParams.set('scope', permissions);
  if (configId) {
    fbAuthUrl.searchParams.set('config_id', configId);
  }
  fbAuthUrl.searchParams.set('response_type', 'code');

  return NextResponse.redirect(fbAuthUrl.toString());
}

