import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserShop } from '@/lib/auth/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { generateInvoiceHTML, generateInvoiceNumber } from '@/lib/invoice/invoice-generator';
import { logger } from '@/lib/utils/logger';

/**
 * GET /api/invoice/[orderId]
 * Generate and return invoice for an order
 * 
 * Query params:
 * - format: 'html' (default) | 'pdf' (future)
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ orderId: string }> }
) {
    try {
        const authShop = await getAuthUserShop();
        if (!authShop) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { orderId } = await params;
        const supabase = supabaseAdmin();

        // Get order with all details
        const { data: order, error: orderError } = await supabase
            .from('orders')
            .select(`
                *,
                customers(name, phone, address, email),
                order_items(*, products(name)),
                shops(name, owner_name, phone)
            `)
            .eq('id', orderId)
            .eq('shop_id', authShop.id)
            .single();

        if (orderError || !order) {
            return NextResponse.json({ error: 'Order not found' }, { status: 404 });
        }

        // Generate invoice number
        const invoiceNumber = generateInvoiceNumber(
            order.id,
            new Date(order.created_at)
        );

        // Prepare invoice data
        const invoiceData = {
            invoiceNumber,
            orderDate: order.created_at,
            shop: {
                name: order.shops.name,
                ownerName: order.shops.owner_name,
                phone: order.shops.phone,
            },
            customer: {
                name: order.customers?.name || 'Үйлчлүүлэгч',
                phone: order.customers?.phone,
                address: order.delivery_address || order.customers?.address,
                email: order.customers?.email,
            },
            items: order.order_items.map((item: any) => ({
                name: item.products?.name || 'Бүтээгдэхүүн',
                quantity: item.quantity,
                unit_price: Number(item.unit_price),
                total: Number(item.unit_price) * item.quantity,
            })),
            subtotal: Number(order.total_amount),
            total: Number(order.total_amount),
            paymentMethod: order.payment_method,
            paymentStatus: order.payment_status,
            paidAt: order.paid_at,
            notes: order.notes,
        };

        // Generate HTML
        const html = generateInvoiceHTML(invoiceData);

        logger.success('Invoice generated:', { orderId, invoiceNumber });

        // Return HTML
        return new NextResponse(html, {
            headers: {
                'Content-Type': 'text/html; charset=utf-8',
                'Content-Disposition': `inline; filename="invoice-${invoiceNumber}.html"`,
            },
        });

    } catch (error: unknown) {
        logger.error('Invoice generation error:', { error: error instanceof Error ? error.message : String(error) });
        return NextResponse.json({
            error: 'Failed to generate invoice'
        }, { status: 500 });
    }
}
