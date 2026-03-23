'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/contexts/AuthContext';
import { useAIConversations } from '@/hooks/useAIConversations';
import { ConversationSidebar } from '@/components/ai-assistant/ConversationSidebar';
import type { AIConversationMessage } from '@/hooks/useAIConversations';
import {
    Send, Bot, User, Sparkles, Loader2,
    Database, Globe, BarChart2, MessageSquare,
} from 'lucide-react';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, LineChart, Line,
} from 'recharts';

type Mode = 'data' | 'general';

interface Message {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    chartConfig?: any;
    data?: any;
}

const MODE_CONFIG = {
    data: {
        label: 'Дата',
        icon: Database,
        color: 'emerald',
        bgActive: 'bg-emerald-600',
        textActive: 'text-white',
        welcomeMsg: 'Сайн байна уу! 👋 Би AI Дата Туслах. Vertmon-ий бүх мэдээллээс асуулт асууж болно — байр, лийд, борлуулалт, статистик бүгдийг мэднэ!',
        placeholder: 'Боломжтой байрууд юу юу байна?...',
        suggestions: ['Боломжтой байрууд?', 'Шинэ лийдүүд', 'Борлуулалтын тайлан', 'VIP лийдүүд', 'Dashboard стат'],
        loadingText: 'Өгөгдөл боловсруулж байна...',
    },
    general: {
        label: 'Ерөнхий',
        icon: Globe,
        color: 'violet',
        bgActive: 'bg-violet-600',
        textActive: 'text-white',
        welcomeMsg: 'Сайн байна уу! 🚀 Би AI Туслах. Маркетинг төлөвлөгөө, бизнес стратеги, контент, ерөнхий асуулт — бүгдэд хариулна. DB мэдээлэл хэрэгтэй бол шууд татна!',
        placeholder: 'Маркетинг төлөвлөгөө бичиж өгөөч...',
        suggestions: ['Маркетинг төлөвлөгөө', 'Facebook сурталчилгаа', 'Борлуулалт нэмэгдүүлэх', 'Контент стратеги', 'ROI тооцоо'],
        loadingText: 'Бодож байна...',
    },
};

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

    const [mode, setMode] = useState<Mode>('data');
    const [messages, setMessages] = useState<Message[]>([
        { id: 'init', role: 'assistant', content: MODE_CONFIG.data.welcomeMsg },
    ]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
    const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const config = MODE_CONFIG[mode];

    // Load conversations on mount
    useEffect(() => {
        if (shop?.id) loadConversations();
    }, [shop?.id, loadConversations]);

    // Auto-scroll
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, isLoading]);

    const switchMode = (newMode: Mode) => {
        if (newMode === mode) return;
        setMode(newMode);
        // Only reset if no active conversation
        if (!currentConversationId) {
            setMessages([
                { id: 'init-' + newMode, role: 'assistant', content: MODE_CONFIG[newMode].welcomeMsg },
            ]);
        }
    };

    const handleNewChat = useCallback(() => {
        setCurrentConversationId(null);
        setActiveConversationId(null);
        setMessages([
            { id: 'init-' + mode, role: 'assistant', content: MODE_CONFIG[mode].welcomeMsg },
        ]);
        setInput('');
    }, [mode, setActiveConversationId]);

    const handleSelectConversation = useCallback(async (id: string) => {
        setActiveConversationId(id);
        setCurrentConversationId(id);
        const { messages: loaded, mode: convMode } = await loadMessages(id);
        if (convMode && (convMode === 'data' || convMode === 'general')) {
            setMode(convMode);
        }
        setMessages(
            loaded.map((m: AIConversationMessage) => ({
                id: m.id,
                role: m.role,
                content: m.content,
                chartConfig: m.chart_config,
                data: m.data,
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
                    mode,
                    conversationId: currentConversationId,
                    history: messages
                        .filter(m => m.id !== 'init' && !m.id.startsWith('init-'))
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
            };

            setMessages(prev => [...prev, assistantMsg]);

            // Handle conversation tracking
            if (data.conversationId) {
                if (!currentConversationId) {
                    // New conversation was auto-created
                    setCurrentConversationId(data.conversationId);
                    setActiveConversationId(data.conversationId);
                    // Add to sidebar list
                    const autoTitle = userMessage.length > 40 ? userMessage.substring(0, 40) + '...' : userMessage;
                    addConversation({
                        id: data.conversationId,
                        title: autoTitle,
                        mode,
                        created_at: new Date().toISOString(),
                        updated_at: new Date().toISOString(),
                    });
                } else {
                    // Existing conversation — update timestamp in sidebar
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
            <div className="h-64 w-full mt-4 bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
                <ResponsiveContainer width="100%" height="100%">
                    {chartConfig.type === 'line' ? (
                        <LineChart data={chartConfig.data}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                            <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#6B7280', fontSize: 12 }} />
                            <YAxis axisLine={false} tickLine={false} tick={{ fill: '#6B7280', fontSize: 12 }} />
                            <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                            <Line type="monotone" dataKey="value" stroke="#10B981" strokeWidth={3} dot={{ r: 4, strokeWidth: 2 }} activeDot={{ r: 6 }} />
                        </LineChart>
                    ) : (
                        <BarChart data={chartConfig.data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                            <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#6B7280', fontSize: 12 }} />
                            <YAxis axisLine={false} tickLine={false} tick={{ fill: '#6B7280', fontSize: 12 }} />
                            <Tooltip cursor={{ fill: '#F3F4F6' }} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                            <Bar dataKey="value" fill={mode === 'data' ? '#10B981' : '#7C3AED'} radius={[4, 4, 0, 0]} maxBarSize={50} />
                        </BarChart>
                    )}
                </ResponsiveContainer>
            </div>
        );
    };

    const bubbleColor = mode === 'data'
        ? { user: 'bg-emerald-600', bot: 'bg-emerald-100', botIcon: 'text-emerald-600' }
        : { user: 'bg-violet-600', bot: 'bg-violet-100', botIcon: 'text-violet-600' };

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
                {/* Header with Mode Toggle */}
                <div className="flex items-center justify-between px-4 md:px-6 py-3 bg-white border-b border-gray-100">
                    <div className="flex items-center gap-3">
                        {/* Mobile sidebar toggle */}
                        <button
                            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                            className="md:hidden p-2 rounded-lg hover:bg-gray-100 text-gray-500"
                        >
                            <MessageSquare className="w-5 h-5" />
                        </button>
                        <div>
                            <h1 className="text-lg md:text-xl font-bold text-gray-900 flex items-center gap-2">
                                <Sparkles className={`w-5 h-5 ${mode === 'data' ? 'text-emerald-500' : 'text-violet-500'}`} />
                                AI Туслах
                            </h1>
                            <p className="text-gray-500 text-xs hidden sm:block">
                                {mode === 'data' ? 'DB мэдээллээс асуулт асуух' : 'Ерөнхий AI — маркетинг, стратеги, бүх зүйл'}
                            </p>
                        </div>
                    </div>

                    {/* Mode Toggle */}
                    <div className="flex bg-gray-100 rounded-xl p-1">
                        {(['data', 'general'] as Mode[]).map(m => {
                            const cfg = MODE_CONFIG[m];
                            const isActive = mode === m;
                            const Icon = cfg.icon;
                            return (
                                <button
                                    key={m}
                                    onClick={() => switchMode(m)}
                                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                                        isActive
                                            ? `${cfg.bgActive} ${cfg.textActive} shadow-sm`
                                            : 'text-gray-500 hover:text-gray-700'
                                    }`}
                                >
                                    <Icon className="w-3.5 h-3.5" />
                                    {cfg.label}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto px-4 md:px-6 py-6 space-y-6 bg-gradient-to-b from-gray-50/50 to-white">
                    {messagesLoading ? (
                        <div className="flex items-center justify-center h-full">
                            <div className="flex items-center gap-3 text-gray-400">
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
                                        <div className={`w-8 h-8 rounded-full ${bubbleColor.bot} flex items-center justify-center flex-shrink-0 mt-1`}>
                                            <Bot className={`w-5 h-5 ${bubbleColor.botIcon}`} />
                                        </div>
                                    )}

                                    <div className={`max-w-[80%] ${message.role === 'user' ? 'order-1' : 'order-2'}`}>
                                        <div
                                            className={`px-4 py-3 rounded-2xl ${
                                                message.role === 'user'
                                                    ? `${bubbleColor.user} text-white rounded-tr-sm`
                                                    : 'bg-white border border-gray-100 shadow-sm rounded-tl-sm text-gray-800'
                                            }`}
                                        >
                                            <p className="whitespace-pre-wrap leading-relaxed text-[15px]">{message.content}</p>
                                        </div>
                                        {message.chartConfig && renderChart(message.chartConfig)}
                                    </div>

                                    {message.role === 'user' && (
                                        <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0 mt-1 order-2">
                                            <User className="w-5 h-5 text-gray-500" />
                                        </div>
                                    )}
                                </div>
                            ))}

                            {isLoading && (
                                <div className="flex gap-4 justify-start max-w-4xl mx-auto">
                                    <div className={`w-8 h-8 rounded-full ${bubbleColor.bot} flex items-center justify-center flex-shrink-0 mt-1`}>
                                        <Bot className={`w-5 h-5 ${bubbleColor.botIcon}`} />
                                    </div>
                                    <div className="bg-white border border-gray-100 shadow-sm rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-2">
                                        <Loader2 className={`w-4 h-4 ${bubbleColor.botIcon} animate-spin`} />
                                        <span className="text-sm text-gray-500">{config.loadingText}</span>
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                    <div ref={messagesEndRef} />
                </div>

                {/* Input Area */}
                <div className="px-4 md:px-6 py-4 bg-white border-t border-gray-100">
                    <div className="max-w-4xl mx-auto">
                        <form onSubmit={handleSubmit} className="relative flex items-center">
                            <input
                                type="text"
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                placeholder={config.placeholder}
                                className={`w-full pl-4 pr-12 py-3.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 ${
                                    mode === 'data' ? 'focus:ring-emerald-500/20 focus:border-emerald-500' : 'focus:ring-violet-500/20 focus:border-violet-500'
                                } transition-all`}
                                disabled={isLoading || messagesLoading}
                            />
                            <Button
                                type="submit"
                                disabled={isLoading || !input.trim() || messagesLoading}
                                className={`absolute right-1.5 h-10 w-10 p-0 rounded-lg ${
                                    mode === 'data' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-violet-600 hover:bg-violet-700'
                                } text-white transition-colors disabled:opacity-50`}
                            >
                                <Send className="w-4 h-4" />
                            </Button>
                        </form>
                        <div className="mt-2 flex gap-2 overflow-x-auto pb-1 hide-scrollbar">
                            {config.suggestions.map((suggestion) => (
                                <button
                                    key={suggestion}
                                    type="button"
                                    onClick={() => setInput(suggestion)}
                                    className={`whitespace-nowrap px-3 py-1.5 text-xs rounded-full border transition-colors ${
                                        mode === 'data'
                                            ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-200'
                                            : 'bg-violet-50 hover:bg-violet-100 text-violet-700 border-violet-200'
                                    }`}
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
