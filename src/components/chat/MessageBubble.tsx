import React from 'react';
import { Bot } from 'lucide-react';
import { ProductCardInChat } from './ProductCardInChat';
import { ToolProcessingIndicator } from './ToolProcessingIndicator';

interface Message {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    products?: any[];
    tool_calls?: { name: string; status: 'pending' | 'completed' }[];
}

interface MessageBubbleProps {
    message: Message;
    onAddToCart?: (productId: string) => void;
}

export function MessageBubble({ message, onAddToCart }: MessageBubbleProps) {
    const isUser = message.role === 'user';

    return (
        <div className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} mb-4`}>
            <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} w-full`}>
                {/* AI Avatar */}
                {!isUser && (
                    <div className="w-8 h-8 rounded-full bg-foreground text-background flex items-center justify-center mr-2 flex-shrink-0">
                        <Bot className="w-4 h-4" />
                    </div>
                )}

                <div className={`max-w-[85%] ${isUser ? 'order-first' : ''}`}>
                    {/* Message Content */}
                    <div
                        className={
                            isUser
                                ? 'px-4 py-2.5 rounded-xl bg-brand text-brand-fg rounded-br-md shadow-sm'
                                : 'px-4 py-2.5 rounded-xl bg-surface border border-border text-foreground rounded-bl-md shadow-xs'
                        }
                    >
                        <p className="text-sm leading-relaxed whitespace-pre-wrap">
                            {message.content}
                        </p>
                    </div>
                </div>
            </div>

            {/* Tool Processing - Independent of content bubble */}
            {message.tool_calls?.map((tool, i) => (
                <ToolProcessingIndicator
                    key={i}
                    toolName={tool.name}
                    status={tool.status}
                />
            ))}

            {/* Product Cards - scrollable horizontal if many, or vertical list */}
            {message.products && message.products.length > 0 && (
                <div className="w-full overflow-x-auto no-scrollbar py-1">
                    <div className="flex gap-2 min-w-max">
                        {message.products.map((product) => (
                            <ProductCardInChat
                                key={product.id}
                                product={product}
                                onAddToCart={onAddToCart}
                            />
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
