'use client';

import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
    Plus, Search, MessageSquare, MoreHorizontal,
    Pencil, Trash2, Database, Globe, X, Check,
    Sparkles, ChevronLeft,
} from 'lucide-react';
import type { AIConversation } from '@/hooks/useAIConversations';

interface ConversationSidebarProps {
    conversations: AIConversation[];
    activeId: string | null;
    loading: boolean;
    collapsed: boolean;
    onToggleCollapse: () => void;
    onSelect: (id: string) => void;
    onNewChat: () => void;
    onRename: (id: string, title: string) => void;
    onDelete: (id: string) => void;
}

/** relative time in Mongolian */
function relativeTime(dateStr: string): string {
    const now = Date.now();
    const dt = new Date(dateStr).getTime();
    const diff = now - dt;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Дөнгөж сая';
    if (mins < 60) return `${mins} мин`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs} цаг`;
    const days = Math.floor(hrs / 24);
    if (days === 1) return 'Өчигдөр';
    if (days < 7) return `${days} хоног`;
    return new Date(dateStr).toLocaleDateString('mn-MN', { month: 'short', day: 'numeric' });
}

/** Group conversations by date */
function groupByDate(conversations: AIConversation[]): { label: string; items: AIConversation[] }[] {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today.getTime() - 86400000);
    const weekAgo = new Date(today.getTime() - 7 * 86400000);

    const groups: Record<string, AIConversation[]> = {
        'Өнөөдөр': [],
        'Өчигдөр': [],
        'Энэ долоо хоногт': [],
        'Өмнөх': [],
    };

    for (const c of conversations) {
        const d = new Date(c.updated_at);
        if (d >= today) {
            groups['Өнөөдөр'].push(c);
        } else if (d >= yesterday) {
            groups['Өчигдөр'].push(c);
        } else if (d >= weekAgo) {
            groups['Энэ долоо хоногт'].push(c);
        } else {
            groups['Өмнөх'].push(c);
        }
    }

    return Object.entries(groups)
        .filter(([, items]) => items.length > 0)
        .map(([label, items]) => ({ label, items }));
}

export function ConversationSidebar({
    conversations,
    activeId,
    loading,
    collapsed,
    onToggleCollapse,
    onSelect,
    onNewChat,
    onRename,
    onDelete,
}: ConversationSidebarProps) {
    const [search, setSearch] = useState('');
    const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
    const [renamingId, setRenamingId] = useState<string | null>(null);
    const [renameValue, setRenameValue] = useState('');
    const renameInputRef = useRef<HTMLInputElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);

    // Close menu on click outside
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                setMenuOpenId(null);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    // Focus rename input
    useEffect(() => {
        if (renamingId) renameInputRef.current?.focus();
    }, [renamingId]);

    const filtered = useMemo(() => {
        if (!search.trim()) return conversations;
        const q = search.toLowerCase();
        return conversations.filter(c => c.title.toLowerCase().includes(q));
    }, [conversations, search]);

    const grouped = useMemo(() => groupByDate(filtered), [filtered]);

    const handleRenameSubmit = (id: string) => {
        if (renameValue.trim()) onRename(id, renameValue.trim());
        setRenamingId(null);
    };

    const startRename = (c: AIConversation) => {
        setRenamingId(c.id);
        setRenameValue(c.title);
        setMenuOpenId(null);
    };

    if (collapsed) {
        return (
            <div className="w-12 flex-shrink-0 bg-surface border-r border-border flex flex-col items-center py-4 gap-3">
                <button
                    onClick={onToggleCollapse}
                    className="w-9 h-9 rounded-xl bg-status-info-soft hover:bg-status-info-soft flex items-center justify-center text-status-info transition-colors"
                    title="Ярианы жагсаалт нээх"
                >
                    <MessageSquare className="w-4 h-4" />
                </button>
                <button
                    onClick={onNewChat}
                    className="w-9 h-9 rounded-xl bg-foreground hover:bg-fg-2 flex items-center justify-center text-white transition-colors shadow-lg shadow-indigo-500/20"
                    title="Шинэ чат"
                >
                    <Plus className="w-4 h-4" />
                </button>
            </div>
        );
    }

    return (
        <div className="w-72 flex-shrink-0 bg-surface border-r border-border flex flex-col h-full">
            {/* Header */}
            <div className="p-3 border-b border-border/60">
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-status-info" />
                        <span className="text-sm font-semibold text-foreground">Чат түүх</span>
                    </div>
                    <button
                        onClick={onToggleCollapse}
                        className="p-1.5 rounded-lg hover:bg-surface-2 text-muted-foreground/70 hover:text-muted-foreground transition-colors"
                    >
                        <ChevronLeft className="w-4 h-4" />
                    </button>
                </div>

                {/* New Chat Button */}
                <button
                    onClick={onNewChat}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2.5 bg-foreground hover:bg-fg-2 
                             text-white rounded-xl text-sm font-medium transition-all shadow-lg shadow-indigo-500/20
                             hover:shadow-indigo-500/30 active:scale-[0.98]"
                >
                    <Plus className="w-4 h-4" />
                    Шинэ чат
                </button>

                {/* Search */}
                <div className="relative mt-2.5">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/70" />
                    <input
                        type="text"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Хайх..."
                        className="w-full pl-8 pr-3 py-2 bg-surface-2/40 border border-border/60 rounded-lg text-xs 
                                 placeholder:text-muted-foreground/70 focus:outline-none focus:ring-1 focus:ring-indigo-500/30 
                                 focus:border-indigo-300 transition-all"
                    />
                </div>
            </div>

            {/* Conversation List */}
            <div className="flex-1 overflow-y-auto py-1.5 px-1.5 space-y-3 scrollbar-thin">
                {loading ? (
                    <div className="flex items-center justify-center py-12">
                        <div className="w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                    </div>
                ) : grouped.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                        <div className="w-12 h-12 rounded-full bg-surface-2 flex items-center justify-center mb-3">
                            <MessageSquare className="w-5 h-5 text-muted-foreground/70" />
                        </div>
                        <p className="text-xs text-muted-foreground">
                            {search ? 'Хайлтын үр дүн олдсонгүй' : 'Одоохондоо яриа байхгүй'}
                        </p>
                    </div>
                ) : (
                    grouped.map(group => (
                        <div key={group.label}>
                            <p className="text-[10px] font-bold text-muted-foreground/70 uppercase tracking-wider px-2 mb-1">
                                {group.label}
                            </p>
                            <div className="space-y-0.5">
                                {group.items.map(conv => {
                                    const isActive = activeId === conv.id;
                                    const isRenaming = renamingId === conv.id;
                                    const ModeIcon = conv.mode === 'data' ? Database : Globe;
                                    const modeColor = conv.mode === 'data' ? 'text-status-success' : 'text-brand';

                                    return (
                                        <div
                                            key={conv.id}
                                            className={`group relative flex items-center gap-2 px-2.5 py-2 rounded-lg cursor-pointer transition-all ${
                                                isActive
                                                    ? 'bg-status-info-soft ring-1 ring-indigo-200'
                                                    : 'hover:bg-surface-2/40'
                                            }`}
                                            onClick={() => !isRenaming && onSelect(conv.id)}
                                        >
                                            <ModeIcon className={`w-3.5 h-3.5 flex-shrink-0 ${modeColor}`} />

                                            <div className="flex-1 min-w-0">
                                                {isRenaming ? (
                                                    <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                                                        <input
                                                            ref={renameInputRef}
                                                            value={renameValue}
                                                            onChange={e => setRenameValue(e.target.value)}
                                                            onKeyDown={e => {
                                                                if (e.key === 'Enter') handleRenameSubmit(conv.id);
                                                                if (e.key === 'Escape') setRenamingId(null);
                                                            }}
                                                            className="w-full text-xs bg-surface border border-indigo-300 rounded px-1.5 py-0.5 
                                                                     focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                                        />
                                                        <button onClick={() => handleRenameSubmit(conv.id)} className="p-0.5 text-status-success hover:text-status-success">
                                                            <Check className="w-3 h-3" />
                                                        </button>
                                                        <button onClick={() => setRenamingId(null)} className="p-0.5 text-muted-foreground/70 hover:text-muted-foreground">
                                                            <X className="w-3 h-3" />
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <>
                                                        <p className={`text-xs font-medium truncate ${isActive ? 'text-status-info' : 'text-foreground'}`}>
                                                            {conv.title}
                                                        </p>
                                                        <p className="text-[10px] text-muted-foreground/70 mt-0.5">
                                                            {relativeTime(conv.updated_at)}
                                                        </p>
                                                    </>
                                                )}
                                            </div>

                                            {/* Three-dot menu */}
                                            {!isRenaming && (
                                                <button
                                                    onClick={e => { e.stopPropagation(); setMenuOpenId(menuOpenId === conv.id ? null : conv.id); }}
                                                    className={`p-1 rounded-md transition-all ${
                                                        menuOpenId === conv.id
                                                            ? 'bg-surface-3 text-muted-foreground'
                                                            : 'opacity-0 group-hover:opacity-100 hover:bg-surface-3 text-muted-foreground/70 hover:text-muted-foreground'
                                                    }`}
                                                >
                                                    <MoreHorizontal className="w-3.5 h-3.5" />
                                                </button>
                                            )}

                                            {/* Dropdown menu */}
                                            {menuOpenId === conv.id && (
                                                <div
                                                    ref={menuRef}
                                                    className="absolute right-0 top-full mt-1 z-50 bg-surface border border-border 
                                                             rounded-lg shadow-xl py-1 min-w-[140px] animate-in fade-in slide-in-from-top-1 duration-150"
                                                >
                                                    <button
                                                        onClick={e => { e.stopPropagation(); startRename(conv); }}
                                                        className="w-full flex items-center gap-2 px-3 py-2 text-xs text-foreground 
                                                                 hover:bg-surface-2/40 transition-colors"
                                                    >
                                                        <Pencil className="w-3 h-3" />
                                                        Нэр солих
                                                    </button>
                                                    <button
                                                        onClick={e => {
                                                            e.stopPropagation();
                                                            setMenuOpenId(null);
                                                            if (confirm('Энэ харилцан яриаг устгах уу?')) onDelete(conv.id);
                                                        }}
                                                        className="w-full flex items-center gap-2 px-3 py-2 text-xs text-status-danger 
                                                                 hover:bg-status-danger-soft transition-colors"
                                                    >
                                                        <Trash2 className="w-3 h-3" />
                                                        Устгах
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* Footer */}
            <div className="px-3 py-2 border-t border-border/60">
                <p className="text-[10px] text-muted-foreground/70 text-center">
                    {conversations.length} яриа
                </p>
            </div>
        </div>
    );
}
