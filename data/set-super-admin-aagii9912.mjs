import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

config({ path: '.env.local' });

const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const userId = '6620b7c6-3b96-4f82-a954-a627820d9b7c';
const email = 'aagii9912@gmail.com';

// 1. Upsert into admins table
const { data: adminData, error: adminErr } = await s
    .from('admins')
    .upsert({ user_id: userId, email, role: 'super_admin', is_active: true }, { onConflict: 'email' })
    .select();

console.log(adminErr ? '❌ admins error: ' + adminErr.message : '✅ admins table updated:', JSON.stringify(adminData));

// 2. Upsert into user_roles table
const { data: roleData, error: roleErr } = await s
    .from('user_roles')
    .upsert({ user_id: userId, role: 'super_admin' }, { onConflict: 'user_id' })
    .select();

console.log(roleErr ? '❌ user_roles error: ' + roleErr.message : '✅ user_roles table updated:', JSON.stringify(roleData));

console.log(`\n🎉 ${email} is now super_admin!`);
