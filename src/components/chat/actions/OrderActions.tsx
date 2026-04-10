import React from 'react';
import { Package, XCircle, RefreshCw } from 'lucide-react';
import type { ChatAction } from '@/types/ai';

interface OrderActionsProps {
    action: ChatAction;
    onAction: (payload: string, context?: Record<string, unknown>) => void;
}

const orderIcons: Record<string, React.ReactNode> = {
    status: <Package className="w-3.5 h-3.5" />,
    cancel: <XCircle className="w-3.5 h-3.5" />,
    reorder: <RefreshCw className="w-3.5 h-3.5" />,
};

export function OrderActions({ action, onAction }: OrderActionsProps) {
    return (
        <div className="flex flex-wrap gap-2 mt-2 ml-10 animate-in fade-in slide-in-from-bottom-2 duration-300">
            {action.buttons.map((btn) => {
                const icon = btn.icon ? orderIcons[btn.icon] : null;
                const isDanger = btn.variant === 'danger';

                return (
                    <button
                        key={btn.id}
                        onClick={() => onAction(btn.payload, action.context)}
                        disabled={btn.disabled}
                        className={`
                            flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium
                            transition-all duration-200 border active:scale-95
                            ${isDanger
                                ? 'bg-white text-red-500 border-red-200 hover:bg-red-50 hover:border-red-300'
                                : 'bg-white text-gray-700 border-gray-200 hover:bg-violet-50 hover:border-violet-200 hover:text-violet-600 shadow-sm'
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
