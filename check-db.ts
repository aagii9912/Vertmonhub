import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function check() {
    // Get all shops
    const { data: shops, error: shopError } = await supabase
        .from('shops')
        .select('id, name, user_id, facebook_page_id');

    console.log('=== ALL SHOPS ===');
    if (shopError) console.error('Shop Error:', shopError);
    console.log(JSON.stringify(shops, null, 2));

    // Get all customers
    const { data: customers, error: custError } = await supabase
        .from('customers')
        .select('id, name, shop_id, facebook_id')
        .limit(10);

    console.log('\n=== CUSTOMERS (first 10) ===');
    if (custError) console.error('Customer Error:', custError);
    console.log(JSON.stringify(customers, null, 2));

    // Count customers per shop
    for (const shop of shops || []) {
        const { count } = await supabase
            .from('customers')
            .select('*', { count: 'exact', head: true })
            .eq('shop_id', shop.id);
        console.log(`Shop "${shop.name}" (${shop.id}): ${count} customers`);
    }
}

check();
