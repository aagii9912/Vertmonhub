import { NextResponse } from 'next/server';
import { getAuthUserShop } from '@/lib/auth/auth';
import { supabaseAdmin } from '@/lib/supabase';
import * as XLSX from 'xlsx';
import { logger } from '@/lib/utils/logger';

export async function GET() {
    try {
        const shop = await getAuthUserShop();
        if (!shop) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const supabase = supabaseAdmin();

        // Fetch all products for this shop
        const { data: products, error } = await supabase
            .from('products')
            .select('id, shop_id, name, description, price, stock, reserved_stock, image_url, is_active, discount_percent, colors, sizes, type, created_at, has_variants')
            .eq('shop_id', shop.id)
            .eq('is_active', true)
            .order('name');

        if (error) throw error;

        // Transform data for Excel
        const excelData = (products || []).map((p, index) => ({
            '№': index + 1,
            'Нэр': p.name,
            'Төрөл': p.type === 'service' ? 'Үйлчилгээ' : p.type === 'appointment' ? 'Цаг захиалга' : 'Бараа',
            'Үнэ (₮)': p.price,
            'Хямдрал (%)': p.discount_percent || 0,
            'Хямдралын үнэ (₮)': p.discount_percent
                ? Math.round(p.price * (1 - p.discount_percent / 100))
                : p.price,
            'Үлдэгдэл': p.stock || 0,
            'Захиалсан': p.reserved_stock || 0,
            'Боломжтой': (p.stock || 0) - (p.reserved_stock || 0),
            'Тайлбар': p.description || '',
            'Өнгө': (p.colors || []).join(', '),
            'Хэмжээ': (p.sizes || []).join(', '),
        }));

        // Create workbook
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(excelData);

        // Set column widths
        ws['!cols'] = [
            { wch: 4 },   // №
            { wch: 25 },  // Нэр
            { wch: 12 },  // Төрөл
            { wch: 12 },  // Үнэ
            { wch: 10 },  // Хямдрал
            { wch: 14 },  // Хямдралын үнэ
            { wch: 10 },  // Үлдэгдэл
            { wch: 10 },  // Захиалсан
            { wch: 10 },  // Боломжтой
            { wch: 30 },  // Тайлбар
            { wch: 15 },  // Өнгө
            { wch: 12 },  // Хэмжээ
        ];

        XLSX.utils.book_append_sheet(wb, ws, 'Бүтээгдэхүүн');

        // Generate Excel buffer
        const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

        // Return as downloadable file
        const today = new Date().toISOString().split('T')[0];
        return new NextResponse(buf, {
            headers: {
                'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'Content-Disposition': `attachment; filename="products_${today}.xlsx"`,
            },
        });
    } catch (error: unknown) {
        logger.error('Product export error:', { error: error });
        return NextResponse.json({ error: 'Export failed' }, { status: 500 });
    }
}
