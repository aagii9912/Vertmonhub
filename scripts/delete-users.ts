/**
 * Delete all users except admin from Supabase
 * Admin email: aagii9912@gmail.com
 * 
 * Run: npx ts-node scripts/delete-users.ts
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
});

const ADMIN_EMAIL = 'aagii9912@gmail.com';

async function deleteNonAdminUsers() {
    console.log('🔍 Fetching all users...');

    // Get all users using admin API
    const { data: { users }, error: listError } = await supabase.auth.admin.listUsers();

    if (listError) {
        console.error('❌ Error listing users:', listError.message);
        return;
    }

    console.log(`📊 Total users found: ${users.length}`);

    // Filter out admin
    const usersToDelete = users.filter(user => user.email !== ADMIN_EMAIL);

    console.log(`🗑️  Users to delete: ${usersToDelete.length}`);
    console.log(`✅ Preserving admin: ${ADMIN_EMAIL}`);

    if (usersToDelete.length === 0) {
        console.log('✨ No users to delete!');
        return;
    }

    // Confirm before deletion
    console.log('\n📋 Users that will be deleted:');
    usersToDelete.forEach((user, i) => {
        console.log(`   ${i + 1}. ${user.email || user.id}`);
    });

    // Delete each user
    console.log('\n🚀 Starting deletion...\n');

    let deleted = 0;
    let failed = 0;

    for (const user of usersToDelete) {
        try {
            // First delete related data (shops, products, etc.)
            const { error: shopError } = await supabase
                .from('shops')
                .delete()
                .eq('user_id', user.id);

            if (shopError) {
                console.log(`   ⚠️ Shop data error for ${user.email}: ${shopError.message}`);
            }

            // Delete the user from auth
            const { error: deleteError } = await supabase.auth.admin.deleteUser(user.id);

            if (deleteError) {
                console.log(`   ❌ Failed to delete ${user.email}: ${deleteError.message}`);
                failed++;
            } else {
                console.log(`   ✅ Deleted: ${user.email || user.id}`);
                deleted++;
            }
        } catch (err: any) {
            console.log(`   ❌ Error with ${user.email}: ${err.message}`);
            failed++;
        }
    }

    console.log('\n' + '='.repeat(40));
    console.log(`✅ Successfully deleted: ${deleted} users`);
    console.log(`❌ Failed: ${failed} users`);
    console.log(`🛡️  Admin preserved: ${ADMIN_EMAIL}`);
    console.log('='.repeat(40));
}

deleteNonAdminUsers().catch(console.error);
