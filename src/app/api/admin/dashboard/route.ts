/**
 * Admin Dashboard API
 * Returns overall statistics for admin dashboard
 */

import { NextResponse } from 'next/server';
import { getAdminUser } from '@/lib/admin/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { safeErrorResponse } from '@/lib/utils/safe-error';

export async function GET() {
    try {
        const admin = await getAdminUser();

        if (!admin) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const supabase = supabaseAdmin();

        // Get all stats in parallel
        const [
            shopsResult,
            subscriptionsResult,
            plansResult,
            invoicesResult,
            recentShopsResult,
            recentInvoicesResult
        ] = await Promise.all([
            // Total shops
            supabase.from('shops').select('id', { count: 'exact', head: true }),

            // Active subscriptions by status
            supabase.from('subscriptions').select('status'),

            // Plans count
            supabase.from('plans').select('id, name, price_monthly').eq('is_active', true),

            // Invoice stats
            supabase.from('invoices').select('status, amount'),

            // Recent shops (last 7 days)
            supabase.from('shops')
                .select('id, name, created_at')
                .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
                .order('created_at', { ascending: false })
                .limit(5),

            // Recent invoices
            supabase.from('invoices')
                .select('id, amount, status, created_at, shops(name)')
                .order('created_at', { ascending: false })
                .limit(5)
        ]);

        // Calculate MRR (Monthly Recurring Revenue)
        const activeSubscriptions = subscriptionsResult.data?.filter(s => s.status === 'active') || [];

        // Calculate subscription stats
        const subscriptionStats = {
            active: activeSubscriptions.length,
            canceled: subscriptionsResult.data?.filter(s => s.status === 'canceled').length || 0,
            past_due: subscriptionsResult.data?.filter(s => s.status === 'past_due').length || 0,
            total: subscriptionsResult.data?.length || 0
        };

        // Calculate revenue stats
        const paidInvoices = invoicesResult.data?.filter(i => i.status === 'paid') || [];
        const pendingInvoices = invoicesResult.data?.filter(i => i.status === 'pending') || [];

        const revenueStats = {
            total_revenue: paidInvoices.reduce((sum, i) => sum + i.amount, 0),
            pending_revenue: pendingInvoices.reduce((sum, i) => sum + i.amount, 0),
            paid_count: paidInvoices.length,
            pending_count: pendingInvoices.length
        };

        return NextResponse.json({
            stats: {
                total_shops: shopsResult.count || 0,
                subscriptions: subscriptionStats,
                revenue: revenueStats,
                plans_count: plansResult.data?.length || 0
            },
            plans: plansResult.data || [],
            recent_shops: recentShopsResult.data || [],
            recent_invoices: recentInvoicesResult.data || [],
            admin: {
                email: admin.email,
                role: admin.role
            }
        });
    } catch (error) {
        return safeErrorResponse(error, 'Dashboard мэдээлэл унших үед алдаа гарлаа');
    }
}
