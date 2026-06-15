import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

interface FacebookPage {
  id: string;
  name: string;
  access_token: string;
  category?: string;
  token_expires_in?: number | null;
  user_access_token?: string | null;
  user_token_expires_in?: number | null;
}

// GET - Fetch pages from cookie
export async function GET() {
  try {
    const cookieStore = await cookies();
    const pagesCookie = cookieStore.get('fb_pages');

    if (!pagesCookie) {
      return NextResponse.json({
        pages: [],
        message: 'Facebook session олдсонгүй. Дахин холбоно уу.',
        code: 'SESSION_EXPIRED'
      });
    }

    const pagesJson = Buffer.from(pagesCookie.value, 'base64').toString('utf-8');
    const pages: FacebookPage[] = JSON.parse(pagesJson);

    // Return pages without access tokens for security
    const safePagesData = pages.map(page => ({
      id: page.id,
      name: page.name,
      category: page.category,
    }));

    return NextResponse.json({ pages: safePagesData });
  } catch (err: any) {
    console.error('Error fetching FB pages:', err);
    return NextResponse.json({ pages: [], error: 'Failed to parse pages data' });
  }
}

// POST - Select a page and save to shop
export async function POST(request: NextRequest) {
  try {
    const { pageId } = await request.json();

    if (!pageId) {
      return NextResponse.json({ error: 'Page ID is required' }, { status: 400 });
    }

    const cookieStore = await cookies();
    const pagesCookie = cookieStore.get('fb_pages');

    if (!pagesCookie) {
      return NextResponse.json({
        error: 'Facebook session дууссан. Дахин холбоно уу.',
        code: 'SESSION_EXPIRED'
      }, { status: 400 });
    }

    const pagesJson = Buffer.from(pagesCookie.value, 'base64').toString('utf-8');
    const pages: FacebookPage[] = JSON.parse(pagesJson);

    // Find the selected page
    const selectedPage = pages.find(p => p.id === pageId);

    if (!selectedPage) {
      return NextResponse.json({ error: 'Page not found' }, { status: 404 });
    }

    // Clear the cookie after use
    cookieStore.delete('fb_pages');

    // Return the full page data with access token
    return NextResponse.json({
      success: true,
      page: {
        id: selectedPage.id,
        name: selectedPage.name,
        access_token: selectedPage.access_token,
        token_expires_in: selectedPage.token_expires_in ?? null,
        user_access_token: selectedPage.user_access_token ?? null,
        user_token_expires_in: selectedPage.user_token_expires_in ?? null,
      }
    });
  } catch (err: any) {
    console.error('Error selecting FB page:', err);
    return NextResponse.json({ error: 'Failed to select page' }, { status: 500 });
  }
}
