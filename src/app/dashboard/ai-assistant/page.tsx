'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useAIConversations } from '@/hooks/useAIConversations';
import { ConversationSidebar } from '@/components/ai-assistant/ConversationSidebar';
import { AgentBadges, OrchestrationTrace, type AgentBadge } from '@/components/ai-assistant/OrchestrationTrace';
import { ActionConfirmCard, type PendingActionUI } from '@/components/ai-assistant/ActionConfirmCard';
import { ChatComposer, type ChatAttachment } from '@/components/ai-assistant/ChatComposer';
import { MessageAttachments } from '@/components/ai-assistant/MessageAttachments';
import type { AIConversationMessage } from '@/hooks/useAIConversations';
import {
    Bot, User, Sparkles, Loader2, MessageSquare, Network,
    BarChart3, Home, FileSignature, Megaphone,
} from 'lucide-react';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, LineChart, Line,
} from 'recharts';

interface SentAttachment { url: string; name: string; mimeType: string }

interface Message {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    chartConfig?: any;
    data?: any;
    agentsUsed?: AgentBadge[];
    trace?: any;
    pendingActions?: PendingActionUI[];
    attachments?: SentAttachment[];
}

const WELCOME_MSG = 'Сайн байна уу! 👋 Би Vertmon AI Orchestrator. Таны асуултыг шинжилж, тохирох мэргэжилтэн agent-д автоматаар замчилж хариулна. Файл/зураг хавсаргаж шинжлүүлэх, бичлэгт хавсаргах боломжтой.';

const SUGGESTIONS: { icon: React.ElementType; label: string; prompt: string; color: string }[] = [
    { icon: BarChart3, label: 'Энэ сарын дүр зураг', prompt: 'Энэ сарын борлуулалт ба шинэ лийдийн дүр зураг', color: 'text-status-success' },
    { icon: Home, label: 'Боломжтой байрууд', prompt: 'Боломжтой байруудыг жагсааж харуул', color: 'text-sky-600' },
    { icon: FileSignature, label: 'Хугацаа хэтэрсэн гэрээ', prompt: 'Хугацаа хэтэрсэн гэрээнүүдийг харуул', color: 'text-amber-600' },
    { icon: Megaphone, label: 'Маркетинг төлөвлөгөө', prompt: 'Энэ улирлын маркетинг төлөвлөгөө гаргаж өгөөч', color: 'text-rose-600' },
];

const AGENT_LEGEND = [
    { emoji: '📊', name: 'Дата аналист' },
    { emoji: '🏠', name: 'Байр' },
    { emoji: '🤝', name: 'CRM' },
    { emoji: '💰', name: 'Санхүү' },
    { emoji: '🧭', name: 'Зөвлөх' },
];

export default function AIAssistantPage() {
    const { shop } = useAuth();
    const {
        conversations, activeConversationId, setActiveConversationId,
        loading: convLoading, messagesLoading,
        loadConversations, loadMessages, renameConversation, deleteConversation,
        touchConversation, addConversation,
    } = useAIConversations({ shopId: shop?.id });

    const [messages, setMessages] = useState<Message[]>([{ id: 'init', role: 'assistant', content: WELCOME_MSG }]);
    const [isLoading, setIsLoading] = useState(false);
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
    const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const isEmpty = messages.length <= 1 && messages[0]?.id === 'init';

    useEffect(() => { if (shop?.id) loadConversations(); }, [shop?.id, loadConversations]);
    useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, isLoading]);

    const handleNewChat = useCallback(() => {
        setCurrentConversationId(null);
        setActiveConversationId(null);
        setMessages([{ id: 'init', role: 'assistant', content: WELCOME_MSG }]);
    }, [setActiveConversationId]);

    const handleSelectConversation = useCallback(async (id: string) => {
        setActiveConversationId(id);
        setCurrentConversationId(id);
        const { messages: loaded } = await loadMessages(id);
        setMessages(loaded.map((m: AIConversationMessage) => ({
            id: m.id, role: m.role, content: m.content,
            chartConfig: m.chart_config, data: m.data,
            agentsUsed: m.agents_used || undefined, trace: m.trace || undefined,
        })));
    }, [loadMessages, setActiveConversationId]);

    const sendMessage = async (text: string, attachments: ChatAttachment[]) => {
        const userMessage = text.trim();
        const ready: SentAttachment[] = attachments.filter(a => a.url).map(a => ({ url: a.url!, name: a.name, mimeType: a.mimeType }));
        if (!userMessage && ready.length === 0) return;

        const newMessage: Message = {
            id: Date.now().toString(), role: 'user',
            content: userMessage || '(файл хавсаргав)', attachments: ready,
        };
        setMessages(prev => [...prev, newMessage]);
        setIsLoading(true);

        try {
            const response = await fetch('/api/ai-assistant', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: userMessage || 'Хавсаргасан файлыг шинжилж туслаач.',
                    shopId: shop?.id,
                    conversationId: currentConversationId,
                    attachments: ready,
                    history: messages.filter(m => m.id !== 'init').map(m => ({ role: m.role, content: m.content })),
                }),
            });
            if (!response.ok) throw new Error('Failed to fetch');
            const data = await response.json();

            setMessages(prev => [...prev, {
                id: (Date.now() + 1).toString(), role: 'assistant',
                content: data.response, chartConfig: data.chartConfig, data: data.data,
                agentsUsed: data.agentsUsed, trace: data.trace,
                pendingActions: (data.pendingActions || []).map((a: any) => ({ ...a, status: 'pending' as const })),
            }]);

            if (data.conversationId) {
                if (!currentConversationId) {
                    setCurrentConversationId(data.conversationId);
                    setActiveConversationId(data.conversationId);
                    const autoTitle = userMessage.length > 40 ? userMessage.substring(0, 40) + '...' : (userMessage || 'Файл хавсралт');
                    addConversation({ id: data.conversationId, title: autoTitle, mode: 'orchestrator', created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
                } else {
                    touchConversation(data.conversationId);
                }
            }
        } catch {
            setMessages(prev => [...prev, { id: (Date.now() + 1).toString(), role: 'assistant', content: 'Уучлаарай, алдаа гарлаа. Дахин оролдоно уу.' }]);
        } finally {
            setIsLoading(false);
        }
    };

    const updatePendingAction = (actionId: string, patch: Partial<PendingActionUI>) => {
        setMessages(prev => prev.map(m => m.pendingActions ? { ...m, pendingActions: m.pendingActions.map(a => a.id === actionId ? { ...a, ...patch } : a) } : m));
    };

    const handleApproveAction = async (action: PendingActionUI) => {
        updatePendingAction(action.id, { status: 'running' });
        try {
            const res = await fetch('/api/ai-assistant/action', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ shopId: shop?.id, tool: action.tool, args: action.args, conversationId: currentConversationId }),
            });
            const data = await res.json();
            if (res.ok && data.success) {
                updatePendingAction(action.id, { status: 'done', resultMessage: data.message });
                if (currentConversationId) touchConversation(currentConversationId);
            } else {
                updatePendingAction(action.id, { status: 'error', resultMessage: data.message || data.error || 'Алдаа гарлаа' });
            }
        } catch {
            updatePendingAction(action.id, { status: 'error', resultMessage: 'Сүлжээний алдаа гарлаа' });
        }
    };

    const handleCancelAction = (action: PendingActionUI) => updatePendingAction(action.id, { status: 'cancelled' });

    const renderChart = (chartConfig: any) => {
        if (!chartConfig || !chartConfig.data || chartConfig.data.length === 0) return null;
        return (
            <div className="h-64 w-full mt-4 bg-surface p-4 rounded-2xl border border-border/60 shadow-sm">
                <ResponsiveContainer width="100%" height="100%">
                    {chartConfig.type === 'line' ? (
                        <LineChart data={chartConfig.data}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                            <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#6B7280', fontSize: 12 }} />
                            <YAxis axisLine={false} tickLine={false} tick={{ fill: '#6B7280', fontSize: 12 }} />
                            <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px -1px rgb(0 0 0 / 0.12)' }} />
                            <Line type="monotone" dataKey="value" stroke="#7C3AED" strokeWidth={3} dot={{ r: 4, strokeWidth: 2 }} activeDot={{ r: 6 }} />
                        </LineChart>
                    ) : (
                        <BarChart data={chartConfig.data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                            <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#6B7280', fontSize: 12 }} />
                            <YAxis axisLine={false} tickLine={false} tick={{ fill: '#6B7280', fontSize: 12 }} />
                            <Tooltip cursor={{ fill: '#F3F4F6' }} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px -1px rgb(0 0 0 / 0.12)' }} />
                            <Bar dataKey="value" fill="#7C3AED" radius={[6, 6, 0, 0]} maxBarSize={48} />
                        </BarChart>
                    )}
                </ResponsiveContainer>
            </div>
        );
    };

    return (
        <div className="flex h-full bg-gradient-to-b from-surface-2/30 to-surface">
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

            <div className="flex-1 flex flex-col min-w-0">
                {/* Header */}
                <div className="relative px-4 md:px-6 py-3 bg-gradient-to-r from-brand-soft/50 via-surface to-surface border-b border-border/60">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <button onClick={() => setSidebarCollapsed(!sidebarCollapsed)} className="md:hidden p-2 rounded-lg hover:bg-surface-2 text-muted-foreground">
                                <MessageSquare className="w-5 h-5" />
                            </button>
                            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand to-brand-strong flex items-center justify-center shadow-sm">
                                <Sparkles className="w-5 h-5 text-white" />
                            </div>
                            <div>
                                <h1 className="text-base md:text-lg font-bold text-foreground leading-tight">AI Orchestrator</h1>
                                <p className="text-muted-foreground text-xs hidden sm:block">Олон мэргэжилтэн agent-ыг автоматаар замчилна</p>
                            </div>
                        </div>
                        <div className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface border border-border/60 text-xs font-medium text-brand-strong shadow-sm">
                            <Network className="w-3.5 h-3.5" /> Авто-замчлал
                        </div>
                    </div>
                </div>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto px-4 md:px-6 py-6">
                    {messagesLoading ? (
                        <div className="flex items-center justify-center h-full text-muted-foreground/70">
                            <Loader2 className="w-5 h-5 animate-spin mr-2" /> <span className="text-sm">Мессежүүд уншиж байна...</span>
                        </div>
                    ) : isEmpty ? (
                        <div className="max-w-2xl mx-auto h-full flex flex-col items-center justify-center text-center gap-6 animate-in fade-in duration-500">
                            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-brand to-brand-strong flex items-center justify-center shadow-lg">
                                <Sparkles className="w-8 h-8 text-white" />
                            </div>
                            <div>
                                <h2 className="text-xl font-bold text-foreground mb-2">Юугаар туслах вэ?</h2>
                                <p className="text-sm text-muted-foreground max-w-md mx-auto">{WELCOME_MSG}</p>
                            </div>
                            <div className="flex flex-wrap items-center justify-center gap-2">
                                {AGENT_LEGEND.map(a => (
                                    <span key={a.name} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-surface border border-border/60 text-xs text-muted-foreground">
                                        <span>{a.emoji}</span>{a.name}
                                    </span>
                                ))}
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full mt-2">
                                {SUGGESTIONS.map(s => (
                                    <button key={s.label} onClick={() => sendMessage(s.prompt, [])}
                                        className="group flex items-center gap-3 p-4 rounded-2xl bg-surface border border-border/60 hover:border-brand/40 hover:shadow-md transition-all text-left">
                                        <div className="w-9 h-9 rounded-xl bg-surface-2 flex items-center justify-center group-hover:scale-105 transition-transform">
                                            <s.icon className={`w-5 h-5 ${s.color}`} />
                                        </div>
                                        <span className="text-sm font-medium text-foreground">{s.label}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            {messages.map((message) => (
                                <div key={message.id} className={`flex gap-3 md:gap-4 max-w-3xl mx-auto animate-in fade-in slide-in-from-bottom-2 duration-300 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                    {message.role === 'assistant' && (
                                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brand to-brand-strong flex items-center justify-center flex-shrink-0 mt-1 shadow-sm">
                                            <Bot className="w-5 h-5 text-white" />
                                        </div>
                                    )}
                                    <div className={`max-w-[82%] ${message.role === 'user' ? 'order-1' : 'order-2'}`}>
                                        {message.role === 'assistant' && message.agentsUsed && message.agentsUsed.length > 0 && (
                                            <AgentBadges agents={message.agentsUsed} />
                                        )}
                                        {message.attachments && message.attachments.length > 0 && (
                                            <div className={message.role === 'user' ? 'flex justify-end mb-1.5' : 'mb-1.5'}>
                                                <MessageAttachments attachments={message.attachments} />
                                            </div>
                                        )}
                                        {message.content && (
                                            <div className={`px-4 py-3 rounded-2xl ${message.role === 'user'
                                                ? 'bg-gradient-to-br from-brand to-brand-strong text-white rounded-tr-sm shadow-sm'
                                                : 'bg-surface border border-border/60 shadow-sm rounded-tl-sm text-foreground'}`}>
                                                <p className="whitespace-pre-wrap leading-relaxed text-[15px]">{message.content}</p>
                                            </div>
                                        )}
                                        {message.chartConfig && renderChart(message.chartConfig)}
                                        {message.role === 'assistant' && message.pendingActions?.map((a) => (
                                            <ActionConfirmCard key={a.id} action={a} onApprove={handleApproveAction} onCancel={handleCancelAction} />
                                        ))}
                                        {message.role === 'assistant' && message.trace && <OrchestrationTrace trace={message.trace} />}
                                    </div>
                                    {message.role === 'user' && (
                                        <div className="w-8 h-8 rounded-full bg-surface-2 flex items-center justify-center flex-shrink-0 mt-1 order-2">
                                            <User className="w-5 h-5 text-muted-foreground" />
                                        </div>
                                    )}
                                </div>
                            ))}
                            {isLoading && (
                                <div className="flex gap-4 justify-start max-w-3xl mx-auto animate-in fade-in duration-200">
                                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brand to-brand-strong flex items-center justify-center flex-shrink-0 mt-1 shadow-sm">
                                        <Bot className="w-5 h-5 text-white" />
                                    </div>
                                    <div className="bg-surface border border-border/60 shadow-sm rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-2">
                                        <span className="flex gap-1">
                                            <span className="w-2 h-2 rounded-full bg-brand/60 animate-bounce" style={{ animationDelay: '0ms' }} />
                                            <span className="w-2 h-2 rounded-full bg-brand/60 animate-bounce" style={{ animationDelay: '150ms' }} />
                                            <span className="w-2 h-2 rounded-full bg-brand/60 animate-bounce" style={{ animationDelay: '300ms' }} />
                                        </span>
                                        <span className="text-sm text-muted-foreground">Замчилж, мэргэжилтнүүдээр боловсруулж байна...</span>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                    <div ref={messagesEndRef} />
                </div>

                {/* Composer */}
                <ChatComposer
                    disabled={isLoading || messagesLoading}
                    shopId={shop?.id}
                    onSend={sendMessage}
                    showSuggestions={!isEmpty}
                    suggestions={SUGGESTIONS.map(s => ({ label: s.label, prompt: s.prompt }))}
                />
            </div>
        </div>
    );
}
