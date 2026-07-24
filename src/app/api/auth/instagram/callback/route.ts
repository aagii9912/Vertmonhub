import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

interface InstagramAccount {
    id: string;
    username: string;
    name?: string;
    profile_picture_url?: string;
}

interface PageWithInstagram {
    id: string;
    name: string;
    access_token: string;
    instagram_business_account?: {
        id: string;
        username?: string;
        name?: string;
        profile_picture_url?: string;
    };
}

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const code = searchParams.get('code');
    const error = searchParams.get('error');
    const origin = request.nextUrl.origin;

    // Handle error from Facebook
    if (error) {
        const errorReason = searchParams.get('error_reason') || 'Unknown error';
        return NextResponse.redirect(`${origin}/marketing/social?ig_error=${encodeURIComponent(errorReason)}`);
    }

    // CSRF state шалгалт — start route-ийн тавьсан cookie-тэй тулгана (нэг удаагийн).
    const cookieStore = await cookies();
    const returnedState = searchParams.get('state');
    const expectedState = cookieStore.get('ig_oauth_state')?.value;
    cookieStore.delete('ig_oauth_state');
    if (!returnedState || !expectedState || returnedState !== expectedState) {
        return NextResponse.redirect(`${origin}/marketing/social?ig_error=state_mismatch`);
    }

    if (!code) {
        return NextResponse.redirect(`${origin}/marketing/social?ig_error=no_code`);
    }

    const appId = process.env.FACEBOOK_APP_ID?.trim();
    const appSecret = process.env.FACEBOOK_APP_SECRET?.trim();

    if (!appId || !appSecret || appSecret === 'your_facebook_app_secret') {
        return NextResponse.redirect(`${origin}/marketing/social?ig_error=config_missing`);
    }

    const redirectUri = `${origin}/api/auth/instagram/callback`;

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
            console.error('Instagram token error:', tokenData.error);
            return NextResponse.redirect(`${origin}/marketing/social?ig_error=token_error`);
        }

        let userAccessToken = tokenData.access_token;
        let tokenExpiresIn: number | undefined;

        // Long-lived token exchange — me/accounts-аас ӨМНӨ (алдаа гарвал short-lived-аар үргэлжилнэ)
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
                console.warn('IG long-lived token exchange failed:', llData.error?.message);
            }
        } catch (e) {
            console.warn('IG long-lived token exchange exception:', e);
        }

        // Get user's Facebook Pages with Instagram Business Account info
        const pagesUrl = `https://graph.facebook.com/v21.0/me/accounts?access_token=${userAccessToken}&fields=id,name,access_token,instagram_business_account{id,username,name,profile_picture_url}`;
        const pagesResponse = await fetch(pagesUrl);
        const pagesData = await pagesResponse.json();

        if (pagesData.error) {
            console.error('Instagram pages error:', pagesData.error);
            return NextResponse.redirect(`${origin}/marketing/social?ig_error=pages_error`);
        }

        // Debug: хуудсуудын мэдээлэл. ЗӨВХӨН нууц биш талбарыг хэвлэнэ —
        // Graph API-ийн /me/accounts хариу нь хуудас бүрийн `access_token`-ыг
        // агуулдаг тул бүтнээр нь логдвол Page token production лог руу задарна.
        console.log('Facebook Pages data:', JSON.stringify(
            (pagesData.data || []).map((p: PageWithInstagram) => ({
                id: p.id,
                name: p.name,
                hasInstagram: !!p.instagram_business_account,
            })),
            null, 2,
        ));

        // Filter pages that have Instagram Business Account connected
        const pagesWithInstagram: PageWithInstagram[] = (pagesData.data || [])
            .filter((page: PageWithInstagram) => page.instagram_business_account?.id)
            .slice(0, 10);

        console.log('Pages with Instagram:', pagesWithInstagram.length);

        if (pagesWithInstagram.length === 0) {
            // Debug: Check if there are any pages at all
            const allPages = pagesData.data || [];
            console.log('Total Facebook Pages:', allPages.length);
            console.log('Pages without IG:', allPages.map((p: any) => ({ id: p.id, name: p.name, hasIG: !!p.instagram_business_account })));

            return NextResponse.redirect(`${origin}/marketing/social?ig_error=no_instagram_account&pages=${allPages.length}`);
        }

        // Prepare Instagram accounts data
        const instagramAccounts = pagesWithInstagram.map((page) => ({
            pageId: page.id,
            pageName: page.name,
            pageAccessToken: page.access_token,
            instagramId: page.instagram_business_account!.id,
            instagramUsername: page.instagram_business_account!.username || '',
            instagramName: page.instagram_business_account!.name || page.name,
            profilePicture: page.instagram_business_account!.profile_picture_url || '',
            tokenExpiresIn: tokenExpiresIn ?? null,
        }));

        // Store Instagram accounts data in a cookie
        const accountsJson = JSON.stringify(instagramAccounts);
        const encodedAccounts = Buffer.from(accountsJson).toString('base64');

        // Set cookie with Instagram accounts data
        cookieStore.set('ig_accounts', encodedAccounts, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 86400, // 24 hours
            path: '/',
        });

        // Redirect back to setup with success
        return NextResponse.redirect(`${origin}/marketing/social?ig_success=true&ig_count=${instagramAccounts.length}`);

    } catch (err) {
        console.error('Instagram OAuth error:', err);
        return NextResponse.redirect(`${origin}/marketing/social?ig_error=exception`);
    }
}
