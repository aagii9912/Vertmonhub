import React, { useRef, useEffect } from 'react';
import { Bot } from 'lucide-react';
import { MessageBubble } from './MessageBubble';
import { ChatInput } from './ChatInput';
import { TypingIndicator } from './TypingIndicator';

interface Message {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    created_at?: string;
    products?: any[];
    tool_calls?: { name: string; status: 'pending' | 'completed' }[];
}

interface QuickReply {
    id: string;
    text: string;
    label: string;
    icon?: string;
}

interface ChatContainerProps {
    messages: Message[];
    isTyping: boolean;
    onSendMessage: (message: string) => void;
    quickReplies?: QuickReply[];
    onAddToCart?: (productId: string) => void;
}

export function ChatContainer({
    messages,
    isTyping,
    onSendMessage,
    quickReplies,
    onAddToCart,
}: ChatContainerProps) {
    const messagesEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, isTyping]);

    return (
        <div className="flex flex-col h-full bg-surface-2/40 rounded-2xl border border-border overflow-hidden">
            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2 no-scrollbar">
                {messages.length === 0 && (
                    <div className="h-full flex flex-col items-center justify-center text-muted-foreground/70 space-y-2">
                        <div className="w-16 h-16 rounded-full bg-surface-2 border border-border flex items-center justify-center">
                            <Bot className="w-8 h-8 text-muted-foreground/70" />
                        </div>
                        <p className="text-xs">Захиалгын туслахад тавтай морил!</p>
                    </div>
                )}

                {messages.map((msg) => (
                    <MessageBubble key={msg.id} message={msg} onAddToCart={onAddToCart} />
                ))}

                {isTyping && <TypingIndicator />}

                <div ref={messagesEndRef} />
            </div>

            {/* Quick Replies */}
            {quickReplies && quickReplies.length > 0 && (
                <div className="flex gap-2 px-4 pb-3 overflow-x-auto no-scrollbar">
                    {quickReplies.map((reply) => (
                        <button
                            key={reply.id}
                            onClick={() => onSendMessage(reply.text)}
                            className="flex-shrink-0 px-4 py-2 bg-surface border border-border rounded-md text-xs font-medium text-foreground hover:border-brand hover:text-brand transition-colors"
                        >
                            {reply.icon && <span className="mr-1.5">{reply.icon}</span>}
                            {reply.label}
                        </button>
                    ))}
                </div>
            )}

            {/* Input */}
            <ChatInput onSend={onSendMessage} disabled={isTyping} />
        </div>
    );
}
