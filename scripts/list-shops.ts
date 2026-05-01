import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
    const { data: shops, error } = await supabase
        .from('shops')
        .select('id, name, owner_name, facebook_page_name, created_at, is_active')
        .order('created_at', { ascending: true });

    if (error) {
        console.error('❌ shops уншихад алдаа:', error);
        process.exit(1);
    }

    console.log(`\n📊 Нийт ${shops?.length || 0} shop:\n`);

    for (const s of shops || []) {
        const { count: propCount } = await supabase
            .from('properties')
            .select('id', { count: 'exact', head: true })
            .eq('shop_id', s.id);

        const { count: elysiumCount } = await supabase
            .from('properties')
            .select('id', { count: 'exact', head: true })
            .eq('shop_id', s.id)
            .like('name', 'Elysium %');

        console.log(`  ${s.id}`);
        console.log(`    Нэр: ${s.name}`);
        console.log(`    Эзэн: ${s.owner_name || '-'}`);
        console.log(`    FB: ${s.facebook_page_name || '-'}`);
        console.log(`    Идэвхтэй: ${s.is_active}`);
        console.log(`    Properties: ${propCount} (Elysium: ${elysiumCount})`);
        console.log(`    Үүссэн: ${s.created_at}`);
        console.log('');
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
