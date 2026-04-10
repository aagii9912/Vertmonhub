import React from 'react';
import { ShoppingCart, CreditCard, Trash2, Eye } from 'lucide-react';
import type { ChatAction } from '@/types/ai';

interface CartActionsProps {
    action: ChatAction;
    onAction: (payload: string, context?: Record<string, unknown>) => void;
}

const iconMap: Record<string, React.ReactNode> = {
    cart: <ShoppingCart className="w-3.5 h-3.5" />,
    checkout: <CreditCard className="w-3.5 h-3.5" />,
    remove: <Trash2 className="w-3.5 h-3.5" />,
    view: <Eye className="w-3.5 h-3.5" />,
};

export function CartActions({ action, onAction }: CartActionsProps) {
    return (
        <div className="flex flex-wrap gap-2 mt-2 ml-10 animate-in fade-in slide-in-from-bottom-2 duration-300">
            {action.buttons.map((btn) => {
                const icon = btn.icon ? iconMap[btn.icon] : null;
                const isPrimary = btn.variant === 'primary';
                const isDanger = btn.variant === 'danger';
                const isGhost = btn.variant === 'ghost';

                return (
                    <button
                        key={btn.id}
                        onClick={() => onAction(btn.payload, action.context)}
                        disabled={btn.disabled}
                        className={`
                            flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium
                            transition-all duration-200 border active:scale-95
                            ${isPrimary
                                ? 'bg-violet-600 text-white border-violet-600 hover:bg-violet-700 shadow-sm hover:shadow-md hover:shadow-violet-500/15'
                                : isDanger
                                    ? 'bg-white text-red-500 border-red-200 hover:bg-red-50 hover:border-red-300'
                                    : isGhost
                                        ? 'bg-transparent text-gray-500 border-transparent hover:bg-gray-100 hover:text-gray-700'
                                        : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50 hover:border-violet-200 hover:text-violet-600 shadow-sm'
                            }
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
