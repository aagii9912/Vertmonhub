'use client';

import { useState, useCallback, useRef } from 'react';

export interface AIConversation {
    id: string;
    title: string;
    mode: 'data' | 'general';
    created_at: string;
    updated_at: string;
}

export interface AIConversationMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    chart_config?: any;
    data?: any;
    created_at: string;
}

interface UseAIConversationsOptions {
    shopId: string | undefined;
}

export function useAIConversations({ shopId }: UseAIConversationsOptions) {
    const [conversations, setConversations] = useState<AIConversation[]>([]);
    const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [messagesLoading, setMessagesLoading] = useState(false);
    const abortRef = useRef<AbortController | null>(null);

    /** Fetch all conversations for the current user + shop */
    const loadConversations = useCallback(async () => {
        if (!shopId) return;
        setLoading(true);
        try {
            const res = await fetch(`/api/ai-assistant/conversations?shopId=${shopId}`);
            if (!res.ok) throw new Error('Failed to load');
            const data = await res.json();
            setConversations(data.conversations || []);
        } catch (err) {
            console.error('LoadConversations error:', err);
        } finally {
            setLoading(false);
        }
    }, [shopId]);

    /** Create a new conversation */
    const createConversation = useCallback(async (mode: 'data' | 'general', title?: string): Promise<AIConversation | null> => {
        if (!shopId) return null;
        try {
            const res = await fetch('/api/ai-assistant/conversations', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ shopId, mode, title }),
            });
            if (!res.ok) throw new Error('Failed to create');
            const data = await res.json();
            const conv = data.conversation as AIConversation;
            setConversations(prev => [conv, ...prev]);
            setActiveConversationId(conv.id);
            return conv;
        } catch (err) {
            console.error('CreateConversation error:', err);
            return null;
        }
    }, [shopId]);

    /** Load messages for a conversation */
    const loadMessages = useCallback(async (conversationId: string): Promise<{ messages: AIConversationMessage[]; mode?: string }> => {
        if (abortRef.current) abortRef.current.abort();
        const controller = new AbortController();
        abortRef.current = controller;
        setMessagesLoading(true);
        try {
            const res = await fetch(`/api/ai-assistant/conversations/${conversationId}`, {
                signal: controller.signal,
            });
            if (!res.ok) throw new Error('Failed to load messages');
            const data = await res.json();
            return { messages: data.messages || [], mode: data.conversation?.mode };
        } catch (err: any) {
            if (err.name === 'AbortError') return { messages: [] };
            console.error('LoadMessages error:', err);
            return { messages: [] };
        } finally {
            setMessagesLoading(false);
        }
    }, []);

    /** Rename a conversation */
    const renameConversation = useCallback(async (id: string, title: string) => {
        try {
            const res = await fetch(`/api/ai-assistant/conversations/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title }),
            });
            if (!res.ok) throw new Error('Failed to rename');
            setConversations(prev => prev.map(c => c.id === id ? { ...c, title } : c));
        } catch (err) {
            console.error('RenameConversation error:', err);
        }
    }, []);

    /** Delete a conversation */
    const deleteConversation = useCallback(async (id: string) => {
        try {
            const res = await fetch(`/api/ai-assistant/conversations/${id}`, { method: 'DELETE' });
            if (!res.ok) throw new Error('Failed to delete');
            setConversations(prev => prev.filter(c => c.id !== id));
            if (activeConversationId === id) setActiveConversationId(null);
        } catch (err) {
            console.error('DeleteConversation error:', err);
        }
    }, [activeConversationId]);

    /** Move conversation to top after new message */
    const touchConversation = useCallback((id: string, newTitle?: string) => {
        setConversations(prev => {
            const idx = prev.findIndex(c => c.id === id);
            if (idx === -1) return prev;
            const updated = { ...prev[idx], updated_at: new Date().toISOString() };
            if (newTitle) updated.title = newTitle;
            return [updated, ...prev.filter(c => c.id !== id)];
        });
    }, []);

    /** Add new conversation to list (when auto-created by API) */
    const addConversation = useCallback((conv: AIConversation) => {
        setConversations(prev => {
            if (prev.some(c => c.id === conv.id)) return prev;
            return [conv, ...prev];
        });
        setActiveConversationId(conv.id);
    }, []);

    return {
        conversations,
        activeConversationId,
        setActiveConversationId,
        loading,
        messagesLoading,
        loadConversations,
        createConversation,
        loadMessages,
        renameConversation,
        deleteConversation,
        touchConversation,
        addConversation,
    };
}
