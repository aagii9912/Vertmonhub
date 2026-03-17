/**
 * Admin Invoices API
 * Manage all invoices from admin panel
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAdminUser } from '@/lib/admin/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { safeErrorResponse } from '@/lib/utils/safe-error';
import { CreateInvoiceSchema, UpdateInvoiceSchema, validateBody } from '@/lib/validations/schemas';

// GET - List all invoices
export async function GET(request: NextRequest) {
    try {
        const admin = await getAdminUser();
        if (!admin) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const supabase = supabaseAdmin();
        const { searchParams } = new URL(request.url);

        const status = searchParams.get('status');
        const shop_id = searchParams.get('shop_id');
        const page = parseInt(searchParams.get('page') || '1');
        const limit = parseInt(searchParams.get('limit') || '20');
        const offset = (page - 1) * limit;

        let query = supabase
            .from('invoices')
            .select(`
                *,
                shops(id, name, email),
                subscriptions(id, status, plans(name))
            `, { count: 'exact' })
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1);

        if (status) {
            query = query.eq('status', status);
        }
        if (shop_id) {
            query = query.eq('shop_id', shop_id);
        }

        const { data, count, error } = await query;

        if (error) throw error;

        // Calculate totals
        const { data: stats } = await supabase
            .from('invoices')
            .select('status, amount');

        const totals = {
            total: stats?.reduce((sum, i) => sum + i.amount, 0) || 0,
            paid: stats?.filter(i => i.status === 'paid').reduce((sum, i) => sum + i.amount, 0) || 0,
            pending: stats?.filter(i => i.status === 'pending').reduce((sum, i) => sum + i.amount, 0) || 0,
            overdue: stats?.filter(i => i.status === 'overdue').reduce((sum, i) => sum + i.amount, 0) || 0
        };

        return NextResponse.json({
            invoices: data,
            totals,
            total: count,
            page,
            limit,
            totalPages: Math.ceil((count || 0) / limit)
        });
    } catch (error) {
        return safeErrorResponse(error, 'Нэхэмжлэл унших үед алдаа гарлаа');
    }
}

// POST - Create new invoice
export async function POST(request: NextRequest) {
    try {
        const admin = await getAdminUser();
        if (!admin) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();

        // Validate input
        const validation = validateBody(CreateInvoiceSchema, body);
        if (!validation.success) return validation.response;
        const { shop_id, subscription_id, amount, due_date, description } = validation.data;

        const supabase = supabaseAdmin();

        const { data, error } = await supabase
            .from('invoices')
            .insert({
                shop_id,
                subscription_id,
                amount,
                due_date: due_date || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
                description,
                status: 'pending',
                created_at: new Date().toISOString()
            })
            .select(`
                *,
                shops(id, name, email)
            `)
            .single();

        if (error) throw error;

        return NextResponse.json({ invoice: data });
    } catch (error) {
        return safeErrorResponse(error, 'Нэхэмжлэл үүсгэх үед алдаа гарлаа');
    }
}

// PUT - Update invoice status
export async function PUT(request: NextRequest) {
    try {
        const admin = await getAdminUser();
        if (!admin) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();

        // Validate input
        const validation = validateBody(UpdateInvoiceSchema, body);
        if (!validation.success) return validation.response;
        const { invoice_id, status, paid_at, notes } = validation.data;

        const supabase = supabaseAdmin();

        const updateData: any = { updated_at: new Date().toISOString() };
        if (status) {
            updateData.status = status;
            if (status === 'paid' && !paid_at) {
                updateData.paid_at = new Date().toISOString();
            }
        }
        if (paid_at) updateData.paid_at = paid_at;
        if (notes !== undefined) updateData.notes = notes;

        const { data, error } = await supabase
            .from('invoices')
            .update(updateData)
            .eq('id', invoice_id)
            .select(`
                *,
                shops(id, name, email)
            `)
            .single();

        if (error) throw error;

        return NextResponse.json({ invoice: data });
    } catch (error) {
        return safeErrorResponse(error, 'Нэхэмжлэл шинэчлэх үед алдаа гарлаа');
    }
}
