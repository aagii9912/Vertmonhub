import { NextResponse, NextRequest } from 'next/server';
import { getUserShop } from '@/lib/auth/supabase-auth';
import { requireModule } from '@/lib/auth/require-permission';
import { supabaseAdmin } from '@/lib/supabase';
import { logger } from '@/lib/utils/logger';

// ============================================
// GET /api/dashboard/units
//   (default)            → блокийн нэгтгэл (property_block_summary)
//   ?phase=&block=       → тухайн блокийн нэгжүүд + худалдан авагч
// ============================================
export async function GET(request: NextRequest) {
    try {
        const denied = await requireModule('properties');
        if (denied) return denied;

        const authShop = await getUserShop();
        if (!authShop) {
            return NextResponse.json({ mode: 'summary', phases: [], summary: [] });
        }

        const supabase = supabaseAdmin();
        const shopId = authShop.id;
        const sp = request.nextUrl.searchParams;
        const phase = sp.get('phase');
        const block = sp.get('block');
        const category = sp.get('category');

        // ----- Block mode: тухайн блокийн нэгжүүд -----
        if (phase && block) {
            let q = supabase
                .from('property_units_with_buyer')
                .select('*')
                .eq('shop_id', shopId)
                .eq('phase', phase)
                .eq('block', block);
            if (category) q = q.eq('category', category);

            const { data: units, error } = await q;
            if (error) throw error;

            // Давхар (string) → дугаараар, дараа нь кодоор эрэмбэлнэ
            const sorted = (units || []).sort((a, b) => {
                const fa = floorNum(a.floor), fb = floorNum(b.floor);
                if (fa !== fb) return fa - fb;
                return String(a.code).localeCompare(String(b.code), undefined, { numeric: true });
            });

            return NextResponse.json({ mode: 'block', phase, block, units: sorted });
        }

        // ----- Summary mode: блокийн нэгтгэл -----
        const { data: summary, error } = await supabase
            .from('property_block_summary')
            .select('*')
            .eq('shop_id', shopId);
        if (error) throw error;

        const phases = [...new Set((summary || []).map((r) => r.phase).filter(Boolean))].sort();

        // Ээлж тус бүрийн нийт тоо (toolbar-д)
        const phaseTotals: Record<string, { total: number; available: number; sold: number }> = {};
        for (const r of summary || []) {
            const p = r.phase || '—';
            phaseTotals[p] ||= { total: 0, available: 0, sold: 0 };
            phaseTotals[p].total += r.total_units || 0;
            phaseTotals[p].available += r.available_units || 0;
            phaseTotals[p].sold += r.sold_units || 0;
        }

        return NextResponse.json({ mode: 'summary', phases, summary: summary || [], phaseTotals });
    } catch (error) {
        logger.error('[Units API] GET error:', { error });
        return NextResponse.json(
            { error: 'Нэгжийн мэдээлэл татахад алдаа гарлаа', mode: 'summary', phases: [], summary: [] },
            { status: 500 }
        );
    }
}

// "01","02","B1","B2" → дугаар (B давхрууд сөрөг)
function floorNum(floor: string | null): number {
    if (!floor) return 999;
    const s = String(floor).trim().toUpperCase();
    const b = s.match(/^B(\d+)/);
    if (b) return -parseInt(b[1], 10);
    const m = s.match(/(\d+)/);
    return m ? parseInt(m[1], 10) : 998;
}
