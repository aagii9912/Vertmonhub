/**
 * Admin Plans API
 * CRUD operations for subscription plans
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAdminUser } from '@/lib/admin/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { logger } from '@/lib/utils/logger';

// GET - List all plans
export async function GET() {
    try {
        const admin = await getAdminUser();

        if (!admin) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const supabase = supabaseAdmin();

        const { data: plans, error } = await supabase
            .from('plans')
            .select('id, name, slug, description, price_monthly, price_yearly, features, limits, is_active, is_featured, sort_order, created_at')
            .order('sort_order', { ascending: true });

        if (error) throw error;

        return NextResponse.json({ plans: plans || [] });
    } catch (error: unknown) {
        logger.error('Get plans error:', { error: error });
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to fetch plans' },
            { status: 500 }
        );
    }
}

// POST - Create new plan
export async function POST(request: NextRequest) {
    try {
        const admin = await getAdminUser();

        if (!admin) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { name, slug, description, price_monthly, price_yearly, features, limits, is_active, is_featured, sort_order } = body;

        if (!name || !slug) {
            return NextResponse.json(
                { error: 'Name and slug are required' },
                { status: 400 }
            );
        }

        const supabase = supabaseAdmin();

        const { data: plan, error } = await supabase
            .from('plans')
            .insert({
                name,
                slug,
                description,
                price_monthly: price_monthly || 0,
                price_yearly,
                features: features || {},
                limits: limits || {},
                is_active: is_active !== false,
                is_featured: is_featured || false,
                sort_order: sort_order || 0
            })
            .select()
            .single();

        if (error) throw error;

        return NextResponse.json({ plan, message: 'Plan created successfully' });
    } catch (error: unknown) {
        logger.error('Create plan error:', { error: error });
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to create plan' },
            { status: 500 }
        );
    }
}

// PATCH - Update plan
export async function PATCH(request: NextRequest) {
    try {
        const admin = await getAdminUser();

        if (!admin) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { id, ...updateData } = body;

        if (!id) {
            return NextResponse.json(
                { error: 'Plan ID is required' },
                { status: 400 }
            );
        }

        const supabase = supabaseAdmin();

        // Add updated_at
        updateData.updated_at = new Date().toISOString();

        const { data: plan, error } = await supabase
            .from('plans')
            .update(updateData)
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;

        return NextResponse.json({ plan, message: 'Plan updated successfully' });
    } catch (error: unknown) {
        logger.error('Update plan error:', { error: error });
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to update plan' },
            { status: 500 }
        );
    }
}

// DELETE - Delete plan
export async function DELETE(request: NextRequest) {
    try {
        const admin = await getAdminUser();

        if (!admin || (admin.role !== 'super_admin' && admin.role !== 'admin')) {
            return NextResponse.json({ error: 'Unauthorized: Admin access required' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');

        if (!id) {
            return NextResponse.json(
                { error: 'Plan ID is required' },
                { status: 400 }
            );
        }

        const supabase = supabaseAdmin();

        // Check if plan has active subscriptions
        const { data: subscriptions } = await supabase
            .from('subscriptions')
            .select('id')
            .eq('plan_id', id)
            .eq('status', 'active')
            .limit(1);

        if (subscriptions && subscriptions.length > 0) {
            return NextResponse.json(
                { error: 'Cannot delete plan with active subscriptions' },
                { status: 400 }
            );
        }

        const { error } = await supabase
            .from('plans')
            .delete()
            .eq('id', id);

        if (error) throw error;

        return NextResponse.json({ message: 'Plan deleted successfully' });
    } catch (error: unknown) {
        logger.error('Delete plan error:', { error: error });
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to delete plan' },
            { status: 500 }
        );
    }
}
