'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Хувийн ажлын жагсаалт (/api/dashboard/tasks) — унших + нэмэх/засах/устгах.
 * Өөрчлөлт бүр my-tasks болон my-stats («Хийх ажлууд» виджет) query-г шинэчилнэ.
 */

export interface UserTask {
    id: string;
    title: string;
    note: string | null;
    due_at: string | null;
    remind_at: string | null;
    status: 'pending' | 'done';
    completed_at: string | null;
    created_at: string;
}

export interface MyTasksData {
    tasks: UserTask[];
    /** false = user_tasks миграци ороогүй орчин (UI мэдэгдэл харуулна). */
    available: boolean;
}

export interface CreateTaskInput {
    title: string;
    note?: string | null;
    dueAt?: string | null;
    remindAt?: string | null;
}

export interface UpdateTaskInput extends Partial<CreateTaskInput> {
    id: string;
    status?: 'pending' | 'done';
}

async function parseError(res: Response): Promise<string> {
    try {
        const body = await res.json();
        return body?.error || `Алдаа (${res.status})`;
    } catch {
        return `Алдаа (${res.status})`;
    }
}

export function useMyTasks() {
    const { shop } = useAuth();
    const shopId = shop?.id;
    const queryClient = useQueryClient();

    const headers = { 'Content-Type': 'application/json', 'x-shop-id': shopId || '' };

    const query = useQuery<MyTasksData>({
        queryKey: ['my-tasks', shopId],
        queryFn: async () => {
            const res = await fetch('/api/dashboard/tasks', { headers: { 'x-shop-id': shopId! } });
            if (!res.ok) throw new Error(await parseError(res));
            return res.json();
        },
        enabled: !!shopId,
        staleTime: 15000,
    });

    const invalidate = () => {
        queryClient.invalidateQueries({ queryKey: ['my-tasks'] });
        queryClient.invalidateQueries({ queryKey: ['my-stats'] });
    };

    const createTask = useMutation({
        mutationFn: async (input: CreateTaskInput) => {
            const res = await fetch('/api/dashboard/tasks', {
                method: 'POST',
                headers,
                body: JSON.stringify(input),
            });
            if (!res.ok) throw new Error(await parseError(res));
            return res.json() as Promise<{ task: UserTask }>;
        },
        onSuccess: invalidate,
    });

    const updateTask = useMutation({
        mutationFn: async ({ id, ...input }: UpdateTaskInput) => {
            const res = await fetch(`/api/dashboard/tasks/${id}`, {
                method: 'PATCH',
                headers,
                body: JSON.stringify(input),
            });
            if (!res.ok) throw new Error(await parseError(res));
            return res.json() as Promise<{ task: UserTask }>;
        },
        onSuccess: invalidate,
    });

    const deleteTask = useMutation({
        mutationFn: async (id: string) => {
            const res = await fetch(`/api/dashboard/tasks/${id}`, {
                method: 'DELETE',
                headers,
            });
            if (!res.ok) throw new Error(await parseError(res));
            return res.json();
        },
        onSuccess: invalidate,
    });

    return { ...query, createTask, updateTask, deleteTask };
}
