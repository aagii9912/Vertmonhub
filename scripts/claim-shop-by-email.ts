/**
 * Claim a shop for an existing auth user by email.
 *
 * Usage: npx tsx scripts/claim-shop-by-email.ts <email> <shop_id>
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
    const [email, shopId] = process.argv.slice(2);
    if (!email || !shopId) {
        console.error('Usage: npx tsx scripts/claim-shop-by-email.ts <email> <shop_id>');
        process.exit(1);
    }

    // Targeted lookup of single user by email
    const { data: lookup, error: lookupErr } = await supabase.auth.admin.listUsers({
        page: 1,
        perPage: 1,
    });
    if (lookupErr) { console.error(lookupErr); process.exit(1); }

    // listUsers returns paginated; filter by email
    const { data: page2, error: page2Err } = await supabase.auth.admin.listUsers({
        page: 1,
        perPage: 1000,
    });
    if (page2Err) { console.error(page2Err); process.exit(1); }
    const user = page2.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());

    if (!user) {
        console.error(`❌ ${email} имэйлтэй user олдсонгүй`);
        process.exit(1);
    }
    console.log(`✅ User олдов: ${user.id}`);

    // Read current shop state
    const { data: shopBefore, error: readErr } = await supabase
        .from('shops')
        .select('id, name, user_id')
        .eq('id', shopId)
        .single();
    if (readErr || !shopBefore) {
        console.error(`❌ Shop олдсонгүй: ${shopId}`, readErr);
        process.exit(1);
    }
    console.log(`📦 Shop: ${shopBefore.name} (одоогийн user_id=${shopBefore.user_id || 'NULL'})`);

    if (shopBefore.user_id === user.id) {
        console.log('ℹ️  Аль хэдийн зөв user-д хамаарагдсан байна. Юу ч өөрчлөөгүй.');
        return;
    }

    if (shopBefore.user_id && shopBefore.user_id !== user.id) {
        console.error(`⚠️  Shop өөр user-д хамаарагдсан байна (${shopBefore.user_id}). Хүчээр сольж болохгүй. Гарч байна.`);
        process.exit(1);
    }

    // Update
    const { error: updErr } = await supabase
        .from('shops')
        .update({ user_id: user.id })
        .eq('id', shopId);
    if (updErr) { console.error('❌ Update алдаа:', updErr); process.exit(1); }

    console.log(`✅ Shop "${shopBefore.name}" одоо ${email}-д хамаарагдсан`);
}

main().catch((e) => { console.error(e); process.exit(1); });
