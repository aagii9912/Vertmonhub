import React, { useState } from 'react';
import { Send, Mic, Image as ImageIcon } from 'lucide-react';

interface ChatInputProps {
    onSend: (message: string) => void;
    disabled?: boolean;
    placeholder?: string;
}

export function ChatInput({ onSend, disabled, placeholder = 'Мессеж бичих...' }: ChatInputProps) {
    const [message, setMessage] = useState('');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (message.trim() && !disabled) {
            onSend(message.trim());
            setMessage('');
        }
    };

    return (
        <form onSubmit={handleSubmit} className="p-3 bg-surface border-t border-border sticky bottom-0">
            <div className="flex items-center gap-2 bg-surface-2 rounded-xl px-3 py-1.5 border border-border">
                <button
                    type="button"
                    className="p-1.5 text-muted-foreground hover:text-brand transition-colors"
                >
                    <ImageIcon className="w-5 h-5" />
                </button>

                <input
                    type="text"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder={placeholder}
                    disabled={disabled}
                    className="flex-1 bg-transparent border-none outline-none text-sm text-foreground placeholder:text-muted-foreground/70 py-2"
                />

                {message.trim() ? (
                    <button
                        type="submit"
                        disabled={disabled}
                        className="p-2 bg-brand text-brand-fg rounded-md hover:bg-brand-strong disabled:opacity-50 transition-colors"
                    >
                        <Send className="w-4 h-4" />
                    </button>
                ) : (
                    <button
                        type="button"
                        className="p-2 text-muted-foreground hover:text-brand transition-colors"
                    >
                        <Mic className="w-5 h-5" />
                    </button>
                )}
            </div>
        </form>
    );
}
