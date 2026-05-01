import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const error = searchParams.get('error');
  const origin = request.nextUrl.origin;

  // Handle error from Facebook
  if (error) {
    const errorReason = searchParams.get('error_reason') || 'Unknown error';
    return NextResponse.redirect(`${origin}/marketing/social?fb_error=${encodeURIComponent(errorReason)}`);
  }

  if (!code) {
    return NextResponse.redirect(`${origin}/marketing/social?fb_error=no_code`);
  }

  const appId = process.env.FACEBOOK_APP_ID?.trim();
  const appSecret = process.env.FACEBOOK_APP_SECRET?.trim();

  if (!appId || !appSecret || appSecret === 'your_facebook_app_secret') {
    return NextResponse.redirect(`${origin}/marketing/social?fb_error=config_missing`);
  }

  const redirectUri = `${origin}/api/auth/facebook/callback`;

  try {
    // Exchange code for access token
    const tokenUrl = new URL('https://graph.facebook.com/v21.0/oauth/access_token');
    tokenUrl.searchParams.set('client_id', appId);
    tokenUrl.searchParams.set('client_secret', appSecret);
    tokenUrl.searchParams.set('redirect_uri', redirectUri);
    tokenUrl.searchParams.set('code', code);

    const tokenResponse = await fetch(tokenUrl.toString());
    const tokenData = await tokenResponse.json();

    if (tokenData.error) {
      console.error('Facebook token error:', tokenData.error);
      return NextResponse.redirect(`${origin}/marketing/social?fb_error=token_error`);
    }

    const userAccessToken = tokenData.access_token;

    // Get user's Facebook Pages
    const pagesUrl = `https://graph.facebook.com/v21.0/me/accounts?access_token=${userAccessToken}&fields=id,name,access_token,category`;
    const pagesResponse = await fetch(pagesUrl);
    const pagesData = await pagesResponse.json();

    if (pagesData.error) {
      console.error('Facebook pages error:', pagesData.error);
      return NextResponse.redirect(`${origin}/marketing/social?fb_error=pages_error`);
    }

    // Store pages data in a cookie
    const pages = (pagesData.data || []).slice(0, 10);
    const pagesJson = JSON.stringify(pages);
    const encodedPages = Buffer.from(pagesJson).toString('base64');

    // Set cookie with pages data
    const cookieStore = await cookies();
    cookieStore.set('fb_pages', encodedPages, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 86400, // 24 hours (was 1 hour)
      path: '/',
    });

    // Redirect back to setup with success
    return NextResponse.redirect(`${origin}/marketing/social?fb_success=true&page_count=${pages.length}`);

  } catch (err) {
    console.error('Facebook OAuth error:', err);
    return NextResponse.redirect(`${origin}/marketing/social?fb_error=exception`);
  }
}
