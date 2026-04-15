import { NextResponse, NextRequest } from 'next/server';
import { getClerkUserShop } from '@/lib/auth/supabase-auth';
import { supabaseAdmin } from '@/lib/supabase';
import { logger } from '@/lib/utils/logger';

// ============================================
// GET /api/dashboard/service-logs
// Үйлчилгээний бүртгэл жагсаалт
// ============================================
export async function GET(request: NextRequest) {
    try {
        const authShop = await getClerkUserShop();
        if (!authShop) {
            return NextResponse.json({ logs: [], stats: emptyStats() });
        }

        const supabase = supabaseAdmin();
        const sp = request.nextUrl.searchParams;

        const status = sp.get('status');
        const type = sp.get('type');
        const priority = sp.get('priority');
        const assignedTo = sp.get('assigned_to');
        const search = sp.get('search')?.trim() || '';

        let query = supabase
            .from('service_logs')
            .select('*')
            .eq('shop_id', authShop.id);

        if (status) query = query.eq('status', status);
        if (type) query = query.eq('type', type);
        if (priority) query = query.eq('priority', priority);
        if (assignedTo) query = query.eq('assigned_to', assignedTo);

        if (search) {
            query = query.or(
                `subject.ilike.%${search}%,` +
                `customer_name.ilike.%${search}%,` +
                `customer_phone.ilike.%${search}%,` +
                `description.ilike.%${search}%`
            );
        }

        query = query.order('created_at', { ascending: false });

        const { data: logs, error } = await query;
        if (error) throw error;

        const stats = computeStats(logs || []);

        return NextResponse.json({ logs: logs || [], stats });
    } catch (error) {
        logger.error('[ServiceLogs API] GET error:', { error });
        return NextResponse.json(
            { error: 'Үйлчилгээний бүртгэл татахад алдаа гарлаа', logs: [], stats: emptyStats() },
            { status: 500 }
        );
    }
}

// ============================================
// POST /api/dashboard/service-logs
// Шинэ хүсэлт/гомдол нээх
// ============================================
export async function POST(request: NextRequest) {
    try {
        const authShop = await getClerkUserShop();
        if (!authShop) {
            return NextResponse.json({ error: 'Нэвтрэх шаардлагатай' }, { status: 401 });
        }

        const body = await request.json();
        const supabase = supabaseAdmin();

        if (!body.subject) {
            return NextResponse.json({ error: 'Гарчиг (subject) шаардлагатай' }, { status: 400 });
        }

        const { data, error } = await supabase
            .from('service_logs')
            .insert({
                shop_id: authShop.id,
                contract_id: body.contract_id || null,
                customer_name: body.customer_name || null,
                customer_phone: body.customer_phone || null,
                type: body.type || 'inquiry',
                priority: body.priority || 'medium',
                subject: body.subject,
                description: body.description || null,
                status: 'open',
                assigned_to: body.assigned_to || null,
            })
            .select()
            .single();

        if (error) throw error;

        return NextResponse.json(
            { log: data, message: 'Хүсэлт амжилттай бүртгэлээ' },
            { status: 201 }
        );
    } catch (error) {
        logger.error('[ServiceLogs API] POST error:', { error });
        return NextResponse.json(
            { error: 'Хүсэлт бүртгэхэд алдаа гарлаа' },
            { status: 500 }
        );
    }
}

// ============================================
// HELPERS
// ============================================

interface ServiceStats {
    total: number;
    open: number;
    in_progress: number;
    resolved: number;
    closed: number;
    avg_rating: number | null;
    by_type: Record<string, number>;
    by_priority: Record<string, number>;
}

function emptyStats(): ServiceStats {
    return {
        total: 0, open: 0, in_progress: 0, resolved: 0, closed: 0,
        avg_rating: null, by_type: {}, by_priority: {},
    };
}

function computeStats(logs: Array<Record<string, unknown>>): ServiceStats {
    const stats = emptyStats();
    let ratingSum = 0;
    let ratingCount = 0;

    for (const log of logs) {
        stats.total += 1;

        const status = String(log.status || '');
        if (status === 'open') stats.open += 1;
        else if (status === 'in_progress') stats.in_progress += 1;
        else if (status === 'resolved') stats.resolved += 1;
        else if (status === 'closed') stats.closed += 1;

        const type = String(log.type || 'other');
        stats.by_type[type] = (stats.by_type[type] || 0) + 1;

        const priority = String(log.priority || 'medium');
        stats.by_priority[priority] = (stats.by_priority[priority] || 0) + 1;

        if (typeof log.satisfaction_rating === 'number') {
            ratingSum += log.satisfaction_rating;
            ratingCount += 1;
        }
    }

    stats.avg_rating = ratingCount > 0 ? Math.round((ratingSum / ratingCount) * 10) / 10 : null;
    return stats;
}
