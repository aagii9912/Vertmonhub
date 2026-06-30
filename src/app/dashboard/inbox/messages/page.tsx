'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { toast } from 'sonner';
import { confirmToast } from '@/components/ui/Toast';
import { Loader2, Send, MessageSquare, User, Bot, PauseCircle, Search, Inbox as InboxIcon, Timer, Power, Trash2 } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { formatTime as formatTimeShared, formatShortDate } from '@/lib/utils/date';

interface ChatMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    created_at: string;
}

interface Conversation {
    id: string;
    customer_name: string;
    customer_avatar: string | null;
    last_message: string;
    last_message_at: string;
    unread_count: number;
    messages: ChatMessage[];
}

export default function InboxMessagesPage() {
    const { t } = useLanguage();
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeId, setActiveId] = useState<string | null>(null);
    const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
    const [replyMessage, setReplyMessage] = useState('');
    const [isSending, setIsSending] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [aiPauseMode, setAiPauseMode] = useState<'pause' | 'off'>('pause');
    const chatEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const shopId = typeof window !== 'undefined' ? localStorage.getItem('vertmonhub_active_shop_id') || '' : '';

    // Fetch all conversations
    const fetchConversations = useCallback(async () => {
        try {
            setLoading(true);
            const res = await fetch('/api/dashboard/conversations', {
                headers: { 'x-shop-id': shopId },
            });
            if (res.ok) {
                const data = await res.json();
                setConversations(data.conversations || []);
            }
        } catch {
            toast.error(t.inbox.error);
        } finally {
            setLoading(false);
        }
    }, [shopId, t.inbox.error]);

    useEffect(() => {
        if (shopId) fetchConversations();
    }, [shopId, fetchConversations]);

    // Select conversation
    const selectConversation = (convo: Conversation) => {
        setActiveId(convo.id);
        const sorted = [...convo.messages].sort(
            (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        );
        setChatMessages(sorted);
        setReplyMessage('');
    };

    // Delete customer
    const handleDeleteCustomer = async (customerId: string, name: string) => {
        const ok = await confirmToast({
            title: `"${name || 'Зочин'}" хэрэглэгчийг устгах уу?`,
            description: 'Чат түүх бүгд устана. Энэ үйлдлийг буцаах боломжгүй.',
            confirmLabel: 'Устгах',
            destructive: true,
        });
        if (!ok) return;
        try {
            const res = await fetch(`/api/dashboard/customers?id=${customerId}`, {
                method: 'DELETE',
                headers: { 'x-shop-id': shopId },
            });
            if (!res.ok) throw new Error('Failed');
            setActiveId(null);
            setChatMessages([]);
            toast.success('Хэрэглэгч устгагдлаа');
            fetchConversations();
        } catch {
            toast.error('Устгахад алдаа гарлаа');
        }
    };

    // Auto-scroll
    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [chatMessages]);

    // Send reply
    const handleSendReply = async () => {
        if (!replyMessage.trim() || isSending || !activeId) return;

        const messageText = replyMessage.trim();
        setIsSending(true);
        setReplyMessage('');

        const optimisticMsg: ChatMessage = {
            id: `temp-${Date.now()}`,
            role: 'assistant',
            content: messageText,
            created_at: new Date().toISOString(),
        };
        setChatMessages(prev => [...prev, optimisticMsg]);

        try {
            const res = await fetch('/api/dashboard/conversations/reply', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-shop-id': shopId,
                },
                body: JSON.stringify({
                    customerId: activeId,
                    message: messageText,
                    aiPauseMode,
                }),
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || data.details || t.inbox.sendError);
            }

            toast.success(t.inbox.messageSent);
            if (aiPauseMode === 'off') {
                toast('AI agent унтраалттай', {
                    icon: <Power className="w-4 h-4 text-status-danger" />,
                    description: 'Та дахин асаах хүртэл энэ хэрэглэгчид AI идэвхгүй болсон.',
                });
            } else {
                toast(t.inbox.aiPaused, {
                    icon: <PauseCircle className="w-4 h-4 text-status-pending" />,
                    description: t.inbox.aiPausedDesc,
                });
            }
            inputRef.current?.focus();
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : t.inbox.sendError);
            setChatMessages(prev => prev.filter(m => m.id !== optimisticMsg.id));
            setReplyMessage(messageText);
        } finally {
            setIsSending(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSendReply();
        }
    };

    const formatTime = (dateStr: string) => {
        try {
            return formatTimeShared(dateStr);
        } catch {
            return '';
        }
    };

    const formatDate = (dateStr: string) => {
        try {
            const d = new Date(dateStr);
            const now = new Date();
            const diff = now.getTime() - d.getTime();
            if (diff < 86400000) return formatTime(dateStr);
            if (diff < 172800000) return 'Өчигдөр';
            return formatShortDate(dateStr);
        } catch {
            return '';
        }
    };

    const filtered = conversations.filter(c =>
        c.customer_name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const activeConvo = conversations.find(c => c.id === activeId);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-[calc(100vh-80px)]">
                <Loader2 className="w-6 h-6 animate-spin text-brand" />
            </div>
        );
    }

    return (
        <div className="flex h-[calc(100vh-80px)] bg-background rounded-xl overflow-hidden border border-border">
            {/* Left: Conversation list */}
            <div className="w-[340px] border-r border-border flex flex-col shrink-0">
                {/* Search */}
                <div className="p-3 border-b border-border">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/60" />
                        <input
                            type="text"
                            placeholder={t.common.search + '...'}
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            className="w-full pl-9 pr-3 py-2.5 bg-surface-2 rounded-lg text-sm text-foreground placeholder:text-muted-foreground/60 border border-border outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:border-border-strong"
                        />
                    </div>
                </div>

                {/* Conversations */}
                <div className="flex-1 overflow-y-auto">
                    {filtered.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-muted-foreground/60 gap-2">
                            <InboxIcon className="w-8 h-8" />
                            <p className="text-sm">{t.inbox.noConversations || 'Чат байхгүй'}</p>
                        </div>
                    ) : (
                        filtered.map(convo => (
                            <button
                                key={convo.id}
                                onClick={() => selectConversation(convo)}
                                className={`w-full flex items-start gap-3 px-4 py-3.5 text-left transition-all border-b border-border ${
                                    activeId === convo.id
                                        ? 'bg-brand-soft border-l-2 border-l-brand'
                                        : 'hover:bg-surface-2'
                                }`}
                            >
                                <div className="w-10 h-10 rounded-full bg-brand-soft flex items-center justify-center shrink-0 text-sm font-bold text-brand-strong">
                                    {convo.customer_name?.[0]?.toUpperCase() || '?'}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between">
                                        <span className="text-sm font-medium text-foreground truncate">
                                            {convo.customer_name || 'Зочин'}
                                        </span>
                                        <span className="text-[10px] text-muted-foreground/60 shrink-0 ml-2">
                                            {formatDate(convo.last_message_at)}
                                        </span>
                                    </div>
                                    <p className="text-xs text-muted-foreground/60 truncate mt-0.5">
                                        {convo.last_message || '...'}
                                    </p>
                                </div>
                            </button>
                        ))
                    )}
                </div>
            </div>

            {/* Right: Chat area */}
            <div className="flex-1 flex flex-col">
                {!activeConvo ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground/60 gap-3">
                        <MessageSquare className="w-12 h-12" />
                        <p className="text-sm">{t.inbox.selectCustomer}</p>
                    </div>
                ) : (
                    <>
                        {/* Chat header */}
                        <div className="px-5 py-3.5 border-b border-border flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full bg-brand-soft flex items-center justify-center text-sm font-bold text-brand-strong">
                                {activeConvo.customer_name?.[0]?.toUpperCase() || '?'}
                            </div>
                            <div>
                                <p className="text-sm font-semibold text-foreground">
                                    {activeConvo.customer_name || 'Зочин'}
                                </p>
                                <p className="text-[11px] text-muted-foreground/60">
                                    {chatMessages.length} {t.inbox.messages}
                                </p>
                            </div>
                            <div className="ml-auto">
                                <button
                                    onClick={() => handleDeleteCustomer(activeConvo.id, activeConvo.customer_name)}
                                    className="p-1.5 hover:bg-status-danger-soft rounded-md transition-colors group"
                                    title="Устгах"
                                >
                                    <Trash2 className="w-4 h-4 text-muted-foreground/60 group-hover:text-status-danger" strokeWidth={1.5} />
                                </button>
                            </div>
                        </div>

                        {/* Messages */}
                        <div className="flex-1 overflow-y-auto p-5 space-y-3">
                            {chatMessages.length === 0 ? (
                                <div className="flex items-center justify-center h-full text-muted-foreground/60 text-sm">
                                    {t.inbox.emptyChatHistory}
                                </div>
                            ) : (
                                chatMessages.map(msg => (
                                    <div
                                        key={msg.id}
                                        className={`flex gap-2.5 ${msg.role === 'assistant' ? 'justify-end' : 'justify-start'}`}
                                    >
                                        {msg.role === 'user' && (
                                            <div className="w-7 h-7 rounded-full bg-surface-3 flex items-center justify-center shrink-0 mt-0.5">
                                                <User className="w-3.5 h-3.5 text-muted-foreground" />
                                            </div>
                                        )}
                                        <div
                                            className={`max-w-[70%] px-3.5 py-2.5 rounded-2xl text-[13px] leading-relaxed ${
                                                msg.role === 'assistant'
                                                    ? 'bg-brand-soft text-brand-strong rounded-br-md'
                                                    : 'bg-surface-2 text-foreground rounded-bl-md'
                                            }`}
                                        >
                                            {msg.content}
                                            <div className={`text-[10px] mt-1 ${msg.role === 'assistant' ? 'text-brand-strong/50' : 'text-muted-foreground/60'}`}>
                                                {formatTime(msg.created_at)}
                                            </div>
                                        </div>
                                        {msg.role === 'assistant' && (
                                            <div className="w-7 h-7 rounded-full bg-brand-soft flex items-center justify-center shrink-0 mt-0.5">
                                                <Bot className="w-3.5 h-3.5 text-brand-strong" />
                                            </div>
                                        )}
                                    </div>
                                ))
                            )}
                            <div ref={chatEndRef} />
                        </div>

                        {/* Reply input */}
                        <div className="px-4 py-3 border-t border-border">
                            <div className="flex items-center gap-1.5 mb-2 px-1">
                                <span className="text-[10px] text-muted-foreground/60 mr-1">AI горим:</span>
                                <button
                                    onClick={() => setAiPauseMode('pause')}
                                    className={`flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium transition-all ${
                                        aiPauseMode === 'pause'
                                            ? 'bg-status-pending-soft text-status-pending border border-status-pending/30'
                                            : 'bg-surface-2 text-muted-foreground/60 border border-border hover:bg-surface-2'
                                    }`}
                                >
                                    <Timer className="w-3 h-3" />
                                    30 мин зогсоох
                                </button>
                                <button
                                    onClick={() => setAiPauseMode('off')}
                                    className={`flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium transition-all ${
                                        aiPauseMode === 'off'
                                            ? 'bg-status-danger-soft text-status-danger border border-status-danger/30'
                                            : 'bg-surface-2 text-muted-foreground/60 border border-border hover:bg-surface-2'
                                    }`}
                                >
                                    <Power className="w-3 h-3" />
                                    AI унтраах
                                </button>
                            </div>
                            <div className="flex items-center gap-2">
                                <input
                                    ref={inputRef}
                                    type="text"
                                    value={replyMessage}
                                    onChange={e => setReplyMessage(e.target.value)}
                                    onKeyDown={handleKeyDown}
                                    placeholder={t.inbox.messagePlaceholder}
                                    disabled={isSending}
                                    className="flex-1 px-4 py-2.5 bg-surface-2 rounded-xl text-sm text-foreground placeholder:text-muted-foreground/60 border border-border outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:border-border-strong disabled:opacity-50"
                                />
                                <button
                                    onClick={handleSendReply}
                                    disabled={!replyMessage.trim() || isSending}
                                    className="p-2.5 rounded-xl bg-brand hover:bg-brand-strong disabled:bg-surface-2 disabled:text-muted-foreground/60 text-brand-fg transition-all"
                                >
                                    {isSending ? (
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : (
                                        <Send className="w-4 h-4" />
                                    )}
                                </button>
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
