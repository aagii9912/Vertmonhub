import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserShop, supabaseAdmin } from '@/lib/auth/auth';
import { logger } from '@/lib/utils/logger';

// POST - Add products to shop
export async function POST(request: NextRequest) {
  try {
    const shop = await getAuthUserShop();

    if (!shop) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { products } = body;

    if (!products || !Array.isArray(products)) {
      return NextResponse.json({ error: 'Products array required' }, { status: 400 });
    }

    const supabase = supabaseAdmin();

    // Filter valid products
    const validProducts = products
      .filter((p: any) => p.name && p.price)
      .map((p: any) => ({
        shop_id: shop.id,
        name: p.name,
        price: parseFloat(p.price) || 0,
        description: p.description || null,
        type: p.type || 'physical',
        stock: p.type === 'service' ? null : (p.stock !== undefined && p.stock !== null && p.stock !== '' ? parseInt(p.stock) : 0),
        colors: p.colors || [],
        sizes: p.sizes || [],
        images: p.images || [],
        is_active: true
      }));

    if (validProducts.length === 0) {
      return NextResponse.json({ message: 'No valid products to add' });
    }

    // Insert products
    const { data: insertedProducts, error } = await supabase
      .from('products')
      .insert(validProducts)
      .select();

    if (error) throw error;

    // Mark setup as complete
    await supabase
      .from('shops')
      .update({ setup_completed: true })
      .eq('id', shop.id);

    return NextResponse.json({
      products: insertedProducts,
      message: `${insertedProducts.length} бүтээгдэхүүн нэмэгдлээ`
    });
  } catch (error: unknown) {
    logger.error('Add products error:', { error: error });
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}

