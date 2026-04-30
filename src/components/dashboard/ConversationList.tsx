import React from 'react';
import { ConversationItem } from './ConversationItem';
import { Search } from 'lucide-react';

interface Conversation {
    id: string;
    customer_name: string;
    customer_avatar?: string;
    last_message: string;
    last_message_at: string;
    unread_count: number;
}

interface ConversationListProps {
    conversations: Conversation[];
    activeId?: string;
    onSelect: (id: string) => void;
}

export function ConversationList({ conversations, activeId, onSelect }: ConversationListProps) {
    return (
        <div className="h-full flex flex-col bg-surface">
            {/* Header */}
            <div className="p-4 border-b border-border bg-surface-2/40">
                <div className="flex items-center justify-between mb-3">
                    <h3 className="heading-section text-foreground">Харилцсан чатууд</h3>
                    <span className="px-2 py-0.5 bg-brand-soft text-brand-strong text-xs font-medium rounded-full tabular-nums">
                        {conversations.length}
                    </span>
                </div>

                {/* Search */}
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/70" />
                    <input
                        type="text"
                        placeholder="Хайх..."
                        className="w-full pl-9 pr-4 py-2 bg-background border border-border rounded-md text-sm text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:ring-2 focus:ring-ring/40 focus:border-border-strong"
                    />
                </div>
            </div>

            {/* Conversation List */}
            <div className="flex-1 overflow-y-auto no-scrollbar">
                {conversations.length > 0 ? (
                    conversations.map((convo) => (
                        <ConversationItem
                            key={convo.id}
                            conversation={convo}
                            isActive={activeId === convo.id}
                            onClick={() => onSelect(convo.id)}
                        />
                    ))
                ) : (
                    <div className="p-8 text-center text-muted-foreground/70">
                        <p className="text-sm">Одоогоор чат байхгүй байна.</p>
                    </div>
                )}
            </div>
        </div>
    );
}
