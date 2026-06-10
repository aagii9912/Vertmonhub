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

  // CSRF state шалгалт — start route-ийн тавьсан cookie-тэй тулгана (нэг удаагийн).
  const cookieStore = await cookies();
  const returnedState = searchParams.get('state');
  const expectedState = cookieStore.get('fb_oauth_state')?.value;
  cookieStore.delete('fb_oauth_state');
  if (!returnedState || !expectedState || returnedState !== expectedState) {
    return NextResponse.redirect(`${origin}/marketing/social?fb_error=state_mismatch`);
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

    let userAccessToken = tokenData.access_token;
    let tokenExpiresIn: number | undefined;

    // Long-lived token exchange — me/accounts-аас ӨМНӨ ажиллана. Long-lived user
    // token-оос үүсэх Page token-ууд effectively non-expiring статус өвлөнө.
    // Алдаа гарвал short-lived токеноор үргэлжилнэ (fatal биш).
    try {
      const llUrl = new URL('https://graph.facebook.com/v21.0/oauth/access_token');
      llUrl.searchParams.set('grant_type', 'fb_exchange_token');
      llUrl.searchParams.set('client_id', appId);
      llUrl.searchParams.set('client_secret', appSecret);
      llUrl.searchParams.set('fb_exchange_token', userAccessToken);
      const llRes = await fetch(llUrl.toString());
      const llData = await llRes.json();
      if (llData.access_token) {
        userAccessToken = llData.access_token;
        if (typeof llData.expires_in === 'number') tokenExpiresIn = llData.expires_in;
      } else if (llData.error) {
        console.warn('Long-lived token exchange failed:', llData.error?.message);
      }
    } catch (e) {
      console.warn('Long-lived token exchange exception:', e);
    }

    // Get user's Facebook Pages
    const pagesUrl = `https://graph.facebook.com/v21.0/me/accounts?access_token=${userAccessToken}&fields=id,name,access_token,category`;
    const pagesResponse = await fetch(pagesUrl);
    const pagesData = await pagesResponse.json();

    if (pagesData.error) {
      console.error('Facebook pages error:', pagesData.error);
      return NextResponse.redirect(`${origin}/marketing/social?fb_error=pages_error`);
    }

    // Store pages data in a cookie (токений дуусах хугацааг хамт дамжуулна)
    const pages = (pagesData.data || []).slice(0, 10).map((p: Record<string, unknown>) => ({
      ...p,
      token_expires_in: tokenExpiresIn ?? null,
    }));
    const pagesJson = JSON.stringify(pages);
    const encodedPages = Buffer.from(pagesJson).toString('base64');

    // Set cookie with pages data
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
