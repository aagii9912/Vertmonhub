import { NextResponse, NextRequest } from 'next/server';
import { getUserShop } from '@/lib/auth/supabase-auth';
import { supabaseAdmin } from '@/lib/supabase';

// Get single customer with full details
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const authShop = await getUserShop();
        if (!authShop) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id } = await params;
        const supabase = supabaseAdmin();

        // Get customer with orders
        const { data: customer, error } = await supabase
            .from('customers')
            .select(`
        *,
        orders (
          id,
          status,
          total_amount,
          created_at
        )
      `)
            .eq('id', id)
            .eq('shop_id', authShop.id)
            .single();

        if (error || !customer) {
            return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
        }

        // Get recent chat history
        const { data: chatHistory } = await supabase
            .from('chat_history')
            .select('message, response, created_at')
            .eq('customer_id', id)
            .order('created_at', { ascending: false })
            .limit(10);

        // Get service logs (requests / complaints / letters) for this customer
        const { data: serviceLogs } = await supabase
            .from('service_logs')
            .select('id, type, subject, description, status, priority, created_at, resolved_at')
            .eq('customer_id', id)
            .eq('shop_id', authShop.id)
            .order('created_at', { ascending: false })
            .limit(50);

        return NextResponse.json({
            customer: {
                ...customer,
                chat_history: chatHistory || [],
                service_logs: serviceLogs || [],
            }
        });
    } catch (error) {
        console.error('Customer detail error:', error);
        return NextResponse.json({ error: 'Failed to fetch customer' }, { status: 500 });
    }
}
