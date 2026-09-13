'use client';

import { useQuery } from '@tanstack/react-query';
import { dashboardFetch } from '@/lib/api/dashboardFetch';
import { useAuth } from '@/contexts/AuthContext';

export interface Message {
    id: string;
    role: 'user' | 'assistant' | 'human';
    content: string;
    created_at: string;
}

export interface Conversation {
    id: string;
    customer_name: string;
    customer_avatar?: string;
    last_message: string;
    last_message_at: string;
    unread_count: number;
    messages: Message[];
}

async function fetchConversations(): Promise<Conversation[]> {
    const res = await dashboardFetch('/api/dashboard/conversations');
    if (!res.ok) {
        throw new Error('Failed to fetch conversations');
    }
    const data = await res.json();
    return data.conversations || [];
}

export function useConversations() {
    const { shop } = useAuth();
    return useQuery({
        queryKey: ['conversations', shop?.id],
        queryFn: fetchConversations,
        enabled: !!shop?.id,
        staleTime: 1000 * 30, // 30 seconds
        refetchInterval: 1000 * 60, // Refetch every minute
    });
}
