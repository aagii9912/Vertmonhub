import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
    // 1) shops with user_id
    const { data: shops, error: shopErr } = await supabase
        .from('shops')
        .select('id, name, user_id, owner_name, created_at');
    if (shopErr) { console.error(shopErr); process.exit(1); }
    console.log('SHOPS:');
    for (const s of shops || []) {
        console.log(`  ${s.id}  user_id=${s.user_id || 'NULL'}  name=${s.name}  owner=${s.owner_name || '-'}`);
    }

}

main().catch((e) => { console.error(e); process.exit(1); });
