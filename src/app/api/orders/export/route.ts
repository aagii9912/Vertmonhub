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

        // Fetch orders with customer and items info
        const { data: orders, error } = await supabase
            .from('orders')
            .select(`
                id, status, total_amount, notes, delivery_address, created_at, payment_status,
                customers (name, phone, address),
                order_items (quantity, unit_price, color, size, products (name))
            `)
            .eq('shop_id', shop.id)
            .order('created_at', { ascending: false })
            .limit(500);

        if (error) throw error;

        const statusLabels: Record<string, string> = {
            pending: 'Хүлээгдэж буй',
            confirmed: 'Баталгаажсан',
            processing: 'Бэлтгэж буй',
            shipped: 'Хүргэгдэж буй',
            delivered: 'Хүргэгдсэн',
            cancelled: 'Цуцлагдсан',
        };

        // Transform data for Excel - printable format
        const excelData = (orders || []).map((order, index) => {
            const customer = order.customers as any;
            const items = (order.order_items || []) as any[];
            const productsText = items.map(i =>
                `${i.products?.name || 'Unknown'} (x${i.quantity})${i.color ? ` - ${i.color}` : ''}${i.size ? ` - ${i.size}` : ''}`
            ).join('; ');

            return {
                '№': index + 1,
                'Захиалгын дугаар': order.id.substring(0, 8).toUpperCase(),
                'Огноо': new Date(order.created_at).toLocaleDateString('mn-MN', {
                    year: 'numeric', month: '2-digit', day: '2-digit',
                    hour: '2-digit', minute: '2-digit'
                }),
                'Харилцагч': customer?.name || 'Тодорхойгүй',
                'Утас': customer?.phone || '-',
                'Хаяг': order.delivery_address || customer?.address || '-',
                'Бүтээгдэхүүн': productsText,
                'Нийт дүн (₮)': order.total_amount,
                'Төлөв': statusLabels[order.status] || order.status,
                'Төлбөр': order.payment_status === 'paid' ? '✅ Төлсөн' : '⏳ Төлөөгүй',
                'Тэмдэглэл': order.notes || '',
            };
        });

        // Create workbook
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(excelData);

        // Set column widths for A4 printing
        ws['!cols'] = [
            { wch: 4 },   // №
            { wch: 12 },  // Захиалгын дугаар
            { wch: 18 },  // Огноо
            { wch: 18 },  // Харилцагч
            { wch: 12 },  // Утас
            { wch: 25 },  // Хаяг
            { wch: 35 },  // Бүтээгдэхүүн
            { wch: 12 },  // Нийт дүн
            { wch: 12 },  // Төлөв
            { wch: 10 },  // Төлбөр
            { wch: 20 },  // Тэмдэглэл
        ];

        // Print settings for A4
        ws['!printHeader'] = ['$A:$K'];

        XLSX.utils.book_append_sheet(wb, ws, 'Захиалгууд');

        // Generate Excel buffer
        const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

        // Return as downloadable file
        const today = new Date().toISOString().split('T')[0];
        return new NextResponse(buf, {
            headers: {
                'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'Content-Disposition': `attachment; filename="orders_${today}.xlsx"`,
            },
        });
    } catch (error: unknown) {
        logger.error('Order export error:', { error: error });
        return NextResponse.json({ error: 'Export failed' }, { status: 500 });
    }
}
