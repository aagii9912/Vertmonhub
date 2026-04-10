import React, { useState } from 'react';
import { Check, X } from 'lucide-react';
import type { ChatAction } from '@/types/ai';

interface ConfirmationButtonsProps {
    action: ChatAction;
    onAction: (payload: string, context?: Record<string, unknown>) => void;
}

export function ConfirmationButtons({ action, onAction }: ConfirmationButtonsProps) {
    const [selected, setSelected] = useState<string | null>(null);

    const handleClick = (payload: string) => {
        if (selected) return; // Already selected
        setSelected(payload);
        onAction(payload, action.context);
    };

    return (
        <div className="flex gap-2 mt-2 ml-10 animate-in fade-in slide-in-from-bottom-2 duration-300">
            {action.buttons.map((btn) => {
                const isSelected = selected === btn.payload;
                const isDisabled = selected !== null && !isSelected;
                const isPrimary = btn.variant === 'primary';
                const isDanger = btn.variant === 'danger';

                return (
                    <button
                        key={btn.id}
                        onClick={() => handleClick(btn.payload)}
                        disabled={isDisabled || btn.disabled}
                        className={`
                            flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-medium
                            transition-all duration-200 border
                            ${isSelected
                                ? isPrimary
                                    ? 'bg-emerald-500 text-white border-emerald-500 shadow-lg shadow-emerald-500/20 scale-105'
                                    : isDanger
                                        ? 'bg-red-500 text-white border-red-500 shadow-lg shadow-red-500/20 scale-105'
                                        : 'bg-gray-500 text-white border-gray-500 scale-105'
                                : isDisabled
                                    ? 'bg-gray-100 text-gray-300 border-gray-100 cursor-not-allowed opacity-50 scale-95'
                                    : isPrimary
                                        ? 'bg-violet-600 text-white border-violet-600 hover:bg-violet-700 hover:shadow-lg hover:shadow-violet-500/20 active:scale-95'
                                        : isDanger
                                            ? 'bg-white text-red-500 border-red-200 hover:bg-red-50 hover:border-red-300 active:scale-95'
                                            : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50 hover:border-gray-300 active:scale-95'
                            }
                        `}
                    >
                        {isSelected ? (
                            isPrimary ? <Check className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />
                        ) : (
                            btn.icon && <span>{btn.icon}</span>
                        )}
                        {btn.label}
                    </button>
                );
            })}
        </div>
    );
}
