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

  // Phase 2 scopes — list pages, read engagement, send DMs, subscribe webhooks.
  // `pages_messaging` + `pages_manage_metadata` require Meta App Review approval
  // before they can be granted on a Live app.
  const permissions = [
    'pages_show_list',
    'pages_read_engagement',
    'pages_messaging',
    'pages_manage_metadata',
    'ads_read',
    'public_profile',
    'email'
  ].join(',');

  // Facebook Login for Business config_id is opt-in. We default to standard
  // Facebook Login because the FB Login for Business flow has its own internal
  // domain whitelist that returns "Can't load URL" if the redirect_uri isn't
  // explicitly tied to the configured business asset, and the standard flow
  // works with just App Domains. To re-enable FB Login for Business set BOTH:
  //   FACEBOOK_LOGIN_USE_CONFIG=true
  //   FACEBOOK_LOGIN_CONFIG_ID=<configuration_id>
  const useConfig = process.env.FACEBOOK_LOGIN_USE_CONFIG?.trim().toLowerCase() === 'true';
  const configId = process.env.FACEBOOK_LOGIN_CONFIG_ID?.trim();

  // Build Facebook OAuth URL
  const fbAuthUrl = new URL('https://www.facebook.com/v21.0/dialog/oauth');
  fbAuthUrl.searchParams.set('client_id', appId);
  fbAuthUrl.searchParams.set('redirect_uri', redirectUri);
  fbAuthUrl.searchParams.set('scope', permissions);
  if (useConfig && configId) {
    fbAuthUrl.searchParams.set('config_id', configId);
  }
  fbAuthUrl.searchParams.set('response_type', 'code');

  return NextResponse.redirect(fbAuthUrl.toString());
}

