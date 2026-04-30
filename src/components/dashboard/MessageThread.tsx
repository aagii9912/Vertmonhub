import React, { useState, useRef, useEffect } from 'react';
import { Send, Check, CheckCheck } from 'lucide-react';

function formatMessageTime(dateStr: string): string {
    const date = new Date(dateStr);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const msgDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());

    const time = date.toLocaleTimeString('mn-MN', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Asia/Ulaanbaatar',
    });

    if (msgDate.getTime() === today.getTime()) {
        return `Өнөөдөр ${time}`;
    } else if (msgDate.getTime() === yesterday.getTime()) {
        return `Өчигдөр ${time}`;
    } else {
        const dateFormatted = date.toLocaleDateString('mn-MN', {
            month: 'short',
            day: 'numeric',
            timeZone: 'Asia/Ulaanbaatar',
        });
        return `${dateFormatted} ${time}`;
    }
}

interface Message {
    id: string;
    role: 'user' | 'assistant' | 'human';
    content: string;
    created_at: string;
    status?: 'sent' | 'delivered' | 'read';
}

interface MessageThreadProps {
    messages: Message[];
    customerName: string;
    onReply: (text: string) => void;
    hideHeader?: boolean;
    isLoading?: boolean;
}

export function MessageThread({ messages, customerName, onReply, hideHeader = false, isLoading = false }: MessageThreadProps) {
    const [reply, setReply] = useState('');
    const messagesEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (reply.trim()) {
            onReply(reply.trim());
            setReply('');
        }
    };

    return (
        <div className="flex flex-col h-full bg-surface">
            {!hideHeader && (
                <div className="p-4 border-b border-border flex items-center justify-between">
                    <div>
                        <h3 className="heading-section text-foreground">{customerName}</h3>
                        <div className="flex items-center gap-1.5 mt-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-status-success" />
                            <span className="text-[10px] text-muted-foreground/80 uppercase tracking-[0.16em]">Online</span>
                        </div>
                    </div>
                </div>
            )}

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 no-scrollbar bg-surface-2/30">
                {messages.map((msg) => {
                    const isIncoming = msg.role === 'user';
                    return (
                        <div key={msg.id} className={`flex ${isIncoming ? 'justify-start' : 'justify-end'}`}>
                            <div className="max-w-[70%] group">
                                <div
                                    className={
                                        isIncoming
                                            ? 'px-4 py-2.5 rounded-xl rounded-bl-md text-sm bg-surface border border-border text-foreground shadow-xs'
                                            : 'px-4 py-2.5 rounded-xl rounded-br-md text-sm bg-brand text-brand-fg shadow-sm'
                                    }
                                >
                                    {msg.content}
                                </div>
                                <div className={`flex items-center gap-1 mt-1 px-1 ${isIncoming ? 'justify-start' : 'justify-end'}`}>
                                    <span className="text-[10px] text-muted-foreground/70">
                                        {formatMessageTime(msg.created_at)}
                                    </span>
                                    {!isIncoming &&
                                        (msg.status === 'read' ? (
                                            <CheckCheck className="w-3 h-3 text-brand" />
                                        ) : (
                                            <Check className="w-3 h-3 text-muted-foreground/60" />
                                        ))}
                                </div>
                            </div>
                        </div>
                    );
                })}
                <div ref={messagesEndRef} />
            </div>

            {/* Quick Replies */}
            <div className="px-4 py-2 flex gap-2 overflow-x-auto no-scrollbar border-t border-border">
                {['Баталгаажлаа', 'Бэлдэж байна', 'Хүргэлтэнд гарлаа'].map((temp) => (
                    <button
                        key={temp}
                        onClick={() => onReply(temp)}
                        disabled={isLoading}
                        className="px-3 py-1.5 bg-surface-2 hover:bg-brand-soft hover:text-brand-strong rounded-full text-[11px] font-medium text-muted-foreground transition-colors whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {temp}
                    </button>
                ))}
            </div>

            {/* Input */}
            <form onSubmit={handleSubmit} className="p-4 border-t border-border">
                <div className="flex items-center gap-2 bg-surface-2 rounded-md px-3 py-1.5 border border-border">
                    <input
                        type="text"
                        value={reply}
                        onChange={(e) => setReply(e.target.value)}
                        placeholder={isLoading ? 'Илгээж байна...' : 'Хариу бичих...'}
                        disabled={isLoading}
                        className="flex-1 bg-transparent border-none outline-none text-sm text-foreground py-2 placeholder:text-muted-foreground/70 disabled:cursor-not-allowed"
                    />
                    <button
                        type="submit"
                        disabled={!reply.trim() || isLoading}
                        className="p-2 bg-brand text-brand-fg rounded-md hover:bg-brand-strong disabled:opacity-40 transition-colors"
                    >
                        {isLoading ? (
                            <div className="w-4 h-4 border-2 border-brand-fg/30 border-t-brand-fg rounded-full animate-spin" />
                        ) : (
                            <Send className="w-4 h-4" />
                        )}
                    </button>
                </div>
            </form>
        </div>
    );
}
