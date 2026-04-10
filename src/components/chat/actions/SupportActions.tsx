import React from 'react';
import { UserCircle, Phone, MapPin, MessageCircle } from 'lucide-react';
import type { ChatAction } from '@/types/ai';

interface SupportActionsProps {
    action: ChatAction;
    onAction: (payload: string, context?: Record<string, unknown>) => void;
}

const supportIcons: Record<string, React.ReactNode> = {
    human: <UserCircle className="w-3.5 h-3.5" />,
    phone: <Phone className="w-3.5 h-3.5" />,
    address: <MapPin className="w-3.5 h-3.5" />,
    chat: <MessageCircle className="w-3.5 h-3.5" />,
};

export function SupportActions({ action, onAction }: SupportActionsProps) {
    return (
        <div className="flex flex-wrap gap-2 mt-2 ml-10 animate-in fade-in slide-in-from-bottom-2 duration-300">
            {action.buttons.map((btn) => {
                const icon = btn.icon ? supportIcons[btn.icon] : null;

                return (
                    <button
                        key={btn.id}
                        onClick={() => onAction(btn.payload, action.context)}
                        disabled={btn.disabled}
                        className={`
                            flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium
                            transition-all duration-200 border active:scale-95
                            bg-white text-gray-700 border-gray-200 
                            hover:bg-indigo-50 hover:border-indigo-200 hover:text-indigo-600 
                            shadow-sm hover:shadow-md
                            ${btn.disabled ? 'opacity-50 cursor-not-allowed' : ''}
                        `}
                    >
                        {icon}
                        {btn.label}
                    </button>
                );
            })}
        </div>
    );
}
