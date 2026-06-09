'use client';

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

interface DashboardData {
    stats: {
        totalProperties: number;
        totalLeads: number;
        monthlyViewings: number;
        pendingContracts: number;
    };
    recentLeads: any[];
    upcomingViewings: any[];
}

export function useDashboard(timeFilter: 'today' | 'week' | 'month' = 'today') {
    const { shop } = useAuth();
    const shopId = shop?.id;

    return useQuery<DashboardData>({
        queryKey: ['dashboard', shopId, timeFilter],
        queryFn: async () => {
            if (!shopId) {
                return {
                    stats: { totalProperties: 0, totalLeads: 0, monthlyViewings: 0, pendingContracts: 0 },
                    recentLeads: [],
                    upcomingViewings: [],
                };
            }

            // Get date range
            const now = new Date();
            let fromDate: Date;
            if (timeFilter === 'today') {
                fromDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            } else if (timeFilter === 'week') {
                fromDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            } else {
                fromDate = new Date(now.getFullYear(), now.getMonth(), 1);
            }

            const [propertiesRes, leadsRes, viewingsRes, contractsRes, recentLeadsRes, upcomingViewingsRes] = await Promise.all([
                // Total properties
                supabase.from('properties').select('id', { count: 'exact', head: true }).eq('shop_id', shopId),
                // Total leads
                supabase.from('leads').select('id', { count: 'exact', head: true }).eq('shop_id', shopId),
                // Monthly viewings
                supabase.from('property_viewings').select('id', { count: 'exact', head: true })
                    .eq('shop_id', shopId)
                    .gte('created_at', fromDate.toISOString()),
                // Pending (active) contracts
                supabase.from('property_contracts').select('id', { count: 'exact', head: true })
                    .eq('shop_id', shopId)
                    .eq('contract_status', 'active'),
                // Recent leads (latest 5)
                supabase.from('leads').select('*')
                    .eq('shop_id', shopId)
                    .order('created_at', { ascending: false })
                    .limit(5),
                // Upcoming viewings
                supabase.from('property_viewings').select('*, properties(name)')
                    .eq('shop_id', shopId)
                    .gte('scheduled_at', now.toISOString())
                    .order('scheduled_at', { ascending: true })
                    .limit(3),
            ]);

            // Алдааг чимээгүй залгилгүйгээр react-query-ийн error төлөвт буулгана
            const failed = [propertiesRes, leadsRes, viewingsRes, contractsRes, recentLeadsRes, upcomingViewingsRes]
                .find((r) => r.error);
            if (failed?.error) {
                throw new Error(failed.error.message);
            }

            return {
                stats: {
                    totalProperties: propertiesRes.count || 0,
                    totalLeads: leadsRes.count || 0,
                    monthlyViewings: viewingsRes.count || 0,
                    pendingContracts: contractsRes.count || 0,
                },
                recentLeads: recentLeadsRes.data || [],
                upcomingViewings: upcomingViewingsRes.data || [],
            };
        },
        enabled: !!shopId,
        staleTime: 30000,
    });
}
