import React from 'react';
import { Bot } from 'lucide-react';

export function TypingIndicator() {
    return (
        <div className="flex items-start">
            <div className="w-8 h-8 rounded-full bg-foreground text-background flex items-center justify-center mr-2 flex-shrink-0">
                <Bot className="w-4 h-4" />
            </div>

            <div className="bg-surface border border-border rounded-xl rounded-bl-md px-4 py-3 shadow-xs">
                <div className="flex gap-1">
                    <span className="w-1.5 h-1.5 bg-muted-foreground/60 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1.5 h-1.5 bg-muted-foreground/60 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1.5 h-1.5 bg-muted-foreground/60 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
            </div>
        </div>
    );
}
