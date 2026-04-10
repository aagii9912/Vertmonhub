/**
 * Admin Subscriptions API
 * Manage all subscriptions from admin panel
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAdminUser } from '@/lib/admin/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { logger } from '@/lib/utils/logger';

// GET - List all subscriptions
export async function GET(request: NextRequest) {
    try {
        const admin = await getAdminUser();
        if (!admin) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const supabase = supabaseAdmin();
        const { searchParams } = new URL(request.url);

        const status = searchParams.get('status');
        const plan_id = searchParams.get('plan_id');
        const page = parseInt(searchParams.get('page') || '1');
        const limit = parseInt(searchParams.get('limit') || '20');
        const offset = (page - 1) * limit;

        let query = supabase
            .from('subscriptions')
            .select(`
                *,
                shops(id, name, email),
                plans(id, name, price_monthly, price_yearly)
            `, { count: 'exact' })
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1);

        if (status) {
            query = query.eq('status', status);
        }
        if (plan_id) {
            query = query.eq('plan_id', plan_id);
        }

        const { data, count, error } = await query;

        if (error) throw error;

        return NextResponse.json({
            subscriptions: data,
            total: count,
            page,
            limit,
            totalPages: Math.ceil((count || 0) / limit)
        });
    } catch (error: unknown) {
        logger.error('Subscriptions fetch error:', { error: error });
        return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
    }
}

// PUT - Update subscription status
export async function PUT(request: NextRequest) {
    try {
        const admin = await getAdminUser();
        if (!admin) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { subscription_id, status, plan_id, notes } = body;

        if (!subscription_id) {
            return NextResponse.json({ error: 'subscription_id is required' }, { status: 400 });
        }

        const supabase = supabaseAdmin();

        const updateData: Record<string, unknown> = {};
        if (status) updateData.status = status;
        if (plan_id) updateData.plan_id = plan_id;
        if (notes !== undefined) updateData.notes = notes;
        updateData.updated_at = new Date().toISOString();

        const { data, error } = await supabase
            .from('subscriptions')
            .update(updateData)
            .eq('id', subscription_id)
            .select(`
                *,
                shops(id, name, email),
                plans(id, name)
            `)
            .single();

        if (error) throw error;

        return NextResponse.json({ subscription: data });
    } catch (error: unknown) {
        logger.error('Subscription update error:', { error: error });
        return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
    }
}
