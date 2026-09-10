'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useAIConversations, type AIConversationMessage } from '@/hooks/useAIConversations';
import { ConversationSidebar } from '@/components/ai-assistant/ConversationSidebar';
import { AiChat, type AiMessage } from '@/components/ai/AiChat';
import { usePageTitle } from '@/lib/navigation/pageTitle';

/**
 * /dashboard/ai-assistant — бүтэн хуудас: зүүн талд яриануудын түүх, баруун
 * талд AiChat (панелтай ижил). Панел өдөр тутмын хэрэглээ, энэ хуудас түүх/урт ажилд.
 */
export default function AIAssistantPage() {
    usePageTitle('AI туслах');
    const { shop } = useAuth();
    const {
        conversations, activeConversationId, setActiveConversationId, loading, messagesLoading,
        loadMessages, renameConversation, deleteConversation, loadConversations,
    } = useAIConversations({ shopId: shop?.id });
    const [collapsed, setCollapsed] = useState(false);
    const [initial, setInitial] = useState<AiMessage[] | undefined>(undefined);
    const [session, setSession] = useState(0);

    const openConversation = useCallback(async (id: string) => {
        setActiveConversationId(id);
        const { messages } = await loadMessages(id);
        setInitial((messages as AIConversationMessage[]).map((m) => ({
            id: m.id, role: m.role, content: m.content,
            chartConfig: m.chart_config ?? null, data: m.data, agentsUsed: m.agents_used || undefined, trace: m.trace || undefined,
        })));
        setSession((s) => s + 1);
    }, [setActiveConversationId, loadMessages]);

    const newChat = () => { setActiveConversationId(null); setInitial([]); setSession((s) => s + 1); };

    // Шинэ яриа серверт үүсэхэд жагсаалтыг шинэчилнэ
    useEffect(() => { if (activeConversationId) void loadConversations(); }, [activeConversationId, loadConversations]);

    return (
        <div className="flex h-full min-h-0">
            <ConversationSidebar
                conversations={conversations}
                activeId={activeConversationId}
                loading={loading}
                collapsed={collapsed}
                onToggleCollapse={() => setCollapsed((v) => !v)}
                onSelect={(id) => void openConversation(id)}
                onNewChat={newChat}
                onRename={renameConversation}
                onDelete={(id) => { void deleteConversation(id); if (id === activeConversationId) newChat(); }}
            />
            <div className="flex min-w-0 flex-1 flex-col bg-surface">
                <AiChat
                    key={session}
                    className="min-h-0 flex-1"
                    conversationId={activeConversationId}
                    onConversationId={(id) => { setActiveConversationId(id); }}
                    initialMessages={initial}
                    messagesLoading={messagesLoading}
                    active
                />
            </div>
        </div>
    );
}
