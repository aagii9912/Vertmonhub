import { NextResponse } from 'next/server';
import { auditFor } from '@/lib/api/context';
import { getUserShop } from '@/lib/auth/supabase-auth';
import { requireModuleWrite } from '@/lib/auth/require-permission';
import { supabaseAdmin } from '@/lib/supabase';
import { logger } from '@/lib/utils/logger';

/**
 * POST /api/dashboard/finance/projects/automap
 * Холбоогүй гэрээнүүдийг block_name → төслийн нэрээр автоматаар төсөлд холбоно.
 * Зөвхөн project_id хоосон гэрээнд л үйлчилнэ (гар холболтыг дарж бичихгүй).
 */
export async function POST() {
    try {
        const denied = await requireModuleWrite('finance');
        if (denied) return denied;
        const authShop = await getUserShop();
        if (!authShop) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const supabase = supabaseAdmin();
        const shopId = authShop.id;

        const [{ data: projects }, { data: contracts }] = await Promise.all([
            supabase.from('projects').select('id, name').eq('shop_id', shopId),
            supabase.from('property_contracts').select('id, block_name').eq('shop_id', shopId).is('deleted_at', null).is('project_id', null),
        ]);

        const norm = (s: string) => s.trim().toLowerCase();
        const projList = (projects || []).map(p => ({ id: p.id, name: norm(p.name || '') }));

        let mapped = 0;
        for (const c of contracts || []) {
            if (!c.block_name) continue;
            const block = norm(c.block_name);
            const match = projList.find(p => p.name && (p.name === block || p.name.includes(block) || block.includes(p.name)));
            if (match) {
                const { error } = await supabase
                    .from('property_contracts')
                    .update({ project_id: match.id })
                    .eq('id', c.id);
                if (!error) mapped++;
            }
        }

        await auditFor(null, authShop.id, {
            entity: 'project_mapping', action: 'update',
            summary: `${mapped} гэрээг төсөлд автоматаар холбов`,
            after: { mapped },
        });

        return NextResponse.json({ success: true, mapped, message: `${mapped} гэрээг төсөлд холболоо` });
    } catch (error) {
        logger.error('[Project Automap] error', { error });
        return NextResponse.json({ error: 'Автомат холбоход алдаа гарлаа' }, { status: 500 });
    }
}
