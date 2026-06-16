'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useAIConversations } from '@/hooks/useAIConversations';
import { ConversationSidebar } from '@/components/ai-assistant/ConversationSidebar';
import { AgentBadges, OrchestrationTrace, type AgentBadge } from '@/components/ai-assistant/OrchestrationTrace';
import type { AIConversationMessage } from '@/hooks/useAIConversations';
import {
    Send, Bot, User, Sparkles, Loader2, MessageSquare, Network,
} from 'lucide-react';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, LineChart, Line,
} from 'recharts';

interface Message {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    chartConfig?: any;
    data?: any;
    agentsUsed?: AgentBadge[];
    trace?: any;
}

const WELCOME_MSG = 'Сайн байна уу! 👋 Би Vertmon AI Orchestrator. Таны асуултыг шинжилж, тохирох мэргэжилтэн agent (Дата аналист, Байрны мэргэжилтэн, CRM, Санхүү, Зөвлөх)-д автоматаар замчилж хариулна. Юу асуух вэ?';
const SUGGESTIONS = [
    'Энэ сарын борлуулалт ба шинэ лийдийн дүр зураг',
    'Боломжтой байрууд',
    'Хугацаа хэтэрсэн гэрээнүүд',
    'Маркетинг төлөвлөгөө гаргаж өгөөч',
    'Dashboard статистик',
];

export default function AIAssistantPage() {
    const { shop } = useAuth();
    const {
        conversations,
        activeConversationId,
        setActiveConversationId,
        loading: convLoading,
        messagesLoading,
        loadConversations,
        loadMessages,
        renameConversation,
        deleteConversation,
        touchConversation,
        addConversation,
    } = useAIConversations({ shopId: shop?.id });

    const [messages, setMessages] = useState<Message[]>([
        { id: 'init', role: 'assistant', content: WELCOME_MSG },
    ]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
    const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Load conversations on mount
    useEffect(() => {
        if (shop?.id) loadConversations();
    }, [shop?.id, loadConversations]);

    // Auto-scroll
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, isLoading]);

    const handleNewChat = useCallback(() => {
        setCurrentConversationId(null);
        setActiveConversationId(null);
        setMessages([{ id: 'init', role: 'assistant', content: WELCOME_MSG }]);
        setInput('');
    }, [setActiveConversationId]);

    const handleSelectConversation = useCallback(async (id: string) => {
        setActiveConversationId(id);
        setCurrentConversationId(id);
        const { messages: loaded } = await loadMessages(id);
        setMessages(
            loaded.map((m: AIConversationMessage) => ({
                id: m.id,
                role: m.role,
                content: m.content,
                chartConfig: m.chart_config,
                data: m.data,
                agentsUsed: m.agents_used || undefined,
                trace: m.trace || undefined,
            }))
        );
    }, [loadMessages, setActiveConversationId]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!input.trim() || isLoading) return;

        const userMessage = input.trim();
        setInput('');

        const newMessage: Message = {
            id: Date.now().toString(),
            role: 'user',
            content: userMessage,
        };

        setMessages(prev => [...prev, newMessage]);
        setIsLoading(true);

        try {
            const response = await fetch('/api/ai-assistant', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: userMessage,
                    shopId: shop?.id,
                    conversationId: currentConversationId,
                    history: messages
                        .filter(m => m.id !== 'init')
                        .map(m => ({ role: m.role, content: m.content })),
                }),
            });

            if (!response.ok) throw new Error('Failed to fetch');
            const data = await response.json();

            const assistantMsg: Message = {
                id: (Date.now() + 1).toString(),
                role: 'assistant',
                content: data.response,
                chartConfig: data.chartConfig,
                data: data.data,
                agentsUsed: data.agentsUsed,
                trace: data.trace,
            };

            setMessages(prev => [...prev, assistantMsg]);

            // Handle conversation tracking
            if (data.conversationId) {
                if (!currentConversationId) {
                    setCurrentConversationId(data.conversationId);
                    setActiveConversationId(data.conversationId);
                    const autoTitle = userMessage.length > 40 ? userMessage.substring(0, 40) + '...' : userMessage;
                    addConversation({
                        id: data.conversationId,
                        title: autoTitle,
                        mode: 'orchestrator',
                        created_at: new Date().toISOString(),
                        updated_at: new Date().toISOString(),
                    });
                } else {
                    touchConversation(data.conversationId);
                }
            }
        } catch {
            setMessages(prev => [
                ...prev,
                {
                    id: (Date.now() + 1).toString(),
                    role: 'assistant',
                    content: 'Уучлаарай, алдаа гарлаа. Дахин оролдоно уу.',
                },
            ]);
        } finally {
            setIsLoading(false);
        }
    };

    const renderChart = (chartConfig: any) => {
        if (!chartConfig || !chartConfig.data || chartConfig.data.length === 0) return null;
        return (
            <div className="h-64 w-full mt-4 bg-surface p-4 rounded-xl border border-border/60 shadow-sm">
                <ResponsiveContainer width="100%" height="100%">
                    {chartConfig.type === 'line' ? (
                        <LineChart data={chartConfig.data}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                            <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#6B7280', fontSize: 12 }} />
                            <YAxis axisLine={false} tickLine={false} tick={{ fill: '#6B7280', fontSize: 12 }} />
                            <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                            <Line type="monotone" dataKey="value" stroke="#7C3AED" strokeWidth={3} dot={{ r: 4, strokeWidth: 2 }} activeDot={{ r: 6 }} />
                        </LineChart>
                    ) : (
                        <BarChart data={chartConfig.data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                            <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#6B7280', fontSize: 12 }} />
                            <YAxis axisLine={false} tickLine={false} tick={{ fill: '#6B7280', fontSize: 12 }} />
                            <Tooltip cursor={{ fill: '#F3F4F6' }} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                            <Bar dataKey="value" fill="#7C3AED" radius={[4, 4, 0, 0]} maxBarSize={50} />
                        </BarChart>
                    )}
                </ResponsiveContainer>
            </div>
        );
    };

    return (
        <div className="flex h-full">
            {/* Conversation Sidebar */}
            <ConversationSidebar
                conversations={conversations}
                activeId={activeConversationId}
                loading={convLoading}
                collapsed={sidebarCollapsed}
                onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
                onSelect={handleSelectConversation}
                onNewChat={handleNewChat}
                onRename={renameConversation}
                onDelete={deleteConversation}
            />

            {/* Main Chat Area */}
            <div className="flex-1 flex flex-col min-w-0">
                {/* Header */}
                <div className="flex items-center justify-between px-4 md:px-6 py-3 bg-surface border-b border-border/60">
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                            className="md:hidden p-2 rounded-lg hover:bg-surface-2 text-muted-foreground"
                        >
                            <MessageSquare className="w-5 h-5" />
                        </button>
                        <div>
                            <h1 className="text-lg md:text-xl font-bold text-foreground flex items-center gap-2">
                                <Sparkles className="w-5 h-5 text-brand" />
                                AI Orchestrator
                            </h1>
                            <p className="text-muted-foreground text-xs hidden sm:block">
                                Олон мэргэжилтэн agent-ыг автоматаар замчилна
                            </p>
                        </div>
                    </div>
                    <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-brand-soft text-brand-strong text-xs font-medium">
                        <Network className="w-3.5 h-3.5" />
                        Авто-замчлал
                    </div>
                </div>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto px-4 md:px-6 py-6 space-y-6 bg-gradient-to-b from-gray-50/50 to-white">
                    {messagesLoading ? (
                        <div className="flex items-center justify-center h-full">
                            <div className="flex items-center gap-3 text-muted-foreground/70">
                                <Loader2 className="w-5 h-5 animate-spin" />
                                <span className="text-sm">Мессежүүд уншиж байна...</span>
                            </div>
                        </div>
                    ) : (
                        <>
                            {messages.map((message) => (
                                <div
                                    key={message.id}
                                    className={`flex gap-3 md:gap-4 max-w-4xl mx-auto ${
                                        message.role === 'user' ? 'justify-end' : 'justify-start'
                                    }`}
                                >
                                    {message.role === 'assistant' && (
                                        <div className="w-8 h-8 rounded-full bg-brand-soft flex items-center justify-center flex-shrink-0 mt-1">
                                            <Bot className="w-5 h-5 text-brand-strong" />
                                        </div>
                                    )}

                                    <div className={`max-w-[80%] ${message.role === 'user' ? 'order-1' : 'order-2'}`}>
                                        {message.role === 'assistant' && message.agentsUsed && message.agentsUsed.length > 0 && (
                                            <AgentBadges agents={message.agentsUsed} />
                                        )}
                                        <div
                                            className={`px-4 py-3 rounded-2xl ${
                                                message.role === 'user'
                                                    ? 'bg-brand text-white rounded-tr-sm'
                                                    : 'bg-surface border border-border/60 shadow-sm rounded-tl-sm text-foreground'
                                            }`}
                                        >
                                            <p className="whitespace-pre-wrap leading-relaxed text-[15px]">{message.content}</p>
                                        </div>
                                        {message.chartConfig && renderChart(message.chartConfig)}
                                        {message.role === 'assistant' && message.trace && (
                                            <OrchestrationTrace trace={message.trace} />
                                        )}
                                    </div>

                                    {message.role === 'user' && (
                                        <div className="w-8 h-8 rounded-full bg-surface-2 flex items-center justify-center flex-shrink-0 mt-1 order-2">
                                            <User className="w-5 h-5 text-muted-foreground" />
                                        </div>
                                    )}
                                </div>
                            ))}

                            {isLoading && (
                                <div className="flex gap-4 justify-start max-w-4xl mx-auto">
                                    <div className="w-8 h-8 rounded-full bg-brand-soft flex items-center justify-center flex-shrink-0 mt-1">
                                        <Bot className="w-5 h-5 text-brand-strong" />
                                    </div>
                                    <div className="bg-surface border border-border/60 shadow-sm rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-2">
                                        <Loader2 className="w-4 h-4 text-brand-strong animate-spin" />
                                        <span className="text-sm text-muted-foreground">Замчилж, мэргэжилтнүүдээр боловсруулж байна...</span>
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                    <div ref={messagesEndRef} />
                </div>

                {/* Input Area */}
                <div className="px-4 md:px-6 py-4 bg-surface border-t border-border/60">
                    <div className="max-w-4xl mx-auto">
                        <form onSubmit={handleSubmit} className="relative flex items-center">
                            <input
                                type="text"
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                placeholder="Асуултаа бичнэ үү — orchestrator зөв agent рүү замчилна..."
                                className="w-full pl-4 pr-12 py-3.5 bg-surface-2/40 border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand transition-all"
                                disabled={isLoading || messagesLoading}
                            />
                            <button
                                type="submit"
                                disabled={isLoading || !input.trim() || messagesLoading}
                                className="absolute right-1.5 h-10 w-10 p-0 rounded-lg bg-brand hover:bg-brand-strong text-white transition-colors disabled:opacity-50 flex items-center justify-center"
                            >
                                <Send className="w-4 h-4" />
                            </button>
                        </form>
                        <div className="mt-2 flex gap-2 overflow-x-auto pb-1 hide-scrollbar">
                            {SUGGESTIONS.map((suggestion) => (
                                <button
                                    key={suggestion}
                                    type="button"
                                    onClick={() => setInput(suggestion)}
                                    className="whitespace-nowrap px-3 py-1.5 text-xs rounded-full border bg-brand-soft hover:bg-brand-soft text-brand-strong border-brand/30 transition-colors"
                                >
                                    {suggestion}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
