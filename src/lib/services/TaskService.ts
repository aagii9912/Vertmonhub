/**
 * Хувийн ажлууд (user_tasks) — ХАТУУ ХУВИЙН: бүх query user_id + shop_id.
 * API route ба AI tool хоёулаа энд дамжина.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

const COLS = 'id, title, note, due_at, remind_at, status, completed_at, created_at';

export function isMissingTaskTable(error: { code?: string; message?: string } | null): boolean {
    if (!error) return false;
    return error.code === '42P01' || /user_tasks/i.test(error.message || '');
}

export const TASK_MIGRATION_HINT =
    'Ажлын жагсаалтын хүснэгт (user_tasks) үүсээгүй байна — 20260721120000_user_tasks.sql миграцийг ажиллуулна уу';

export async function listTasks(db: SupabaseClient, shopId: string, userId: string, status?: string | null) {
    let q = db.from('user_tasks').select(COLS).eq('user_id', userId).eq('shop_id', shopId).is('deleted_at', null)
        .order('created_at', { ascending: false }).limit(300);
    if (status === 'pending' || status === 'done') q = q.eq('status', status);
    return q;
}

export async function createTask(db: SupabaseClient, shopId: string, userId: string, input: { title: string; note?: string | null; dueAt?: string | null; remindAt?: string | null }) {
    return db.from('user_tasks').insert({
        user_id: userId, shop_id: shopId, title: input.title, note: input.note?.trim() || null,
        due_at: input.dueAt || null, remind_at: input.remindAt || null,
    }).select(COLS).single();
}

export async function updateTask(db: SupabaseClient, shopId: string, userId: string, id: string, p: { title?: string; note?: string | null; dueAt?: string | null; remindAt?: string | null; status?: 'pending' | 'done' }) {
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (p.title !== undefined) updates.title = p.title;
    if (p.note !== undefined) updates.note = p.note?.trim() || null;
    if (p.dueAt !== undefined) updates.due_at = p.dueAt;
    if (p.remindAt !== undefined) { updates.remind_at = p.remindAt; updates.reminder_sent_at = null; }
    if (p.status !== undefined) { updates.status = p.status; updates.completed_at = p.status === 'done' ? new Date().toISOString() : null; }
    return db.from('user_tasks').update(updates).eq('id', id).eq('user_id', userId).eq('shop_id', shopId).is('deleted_at', null).select(COLS).maybeSingle();
}
