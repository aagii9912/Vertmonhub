import React, { useState } from 'react';
import { Home, Store, Check } from 'lucide-react';
import type { ChatAction } from '@/types/ai';

interface DeliveryOptionsProps {
    action: ChatAction;
    onAction: (payload: string, context?: Record<string, unknown>) => void;
}

const deliveryIcons: Record<string, React.ReactNode> = {
    delivery: <Home className="w-4 h-4" />,
    pickup: <Store className="w-4 h-4" />,
};

export function DeliveryOptions({ action, onAction }: DeliveryOptionsProps) {
    const [selected, setSelected] = useState<string | null>(null);

    const handleClick = (payload: string) => {
        if (selected) return;
        setSelected(payload);
        onAction(payload, action.context);
    };

    return (
        <div className="mt-2 ml-10 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <p className="text-[10px] text-gray-400 mb-2 font-medium uppercase tracking-wider">
                Хүргэлтийн сонголт
            </p>
            <div className="flex gap-2">
                {action.buttons.map((btn) => {
                    const icon = deliveryIcons[btn.icon || ''] || deliveryIcons.delivery;
                    const isSelected = selected === btn.payload;
                    const isDisabled = selected !== null && !isSelected;

                    return (
                        <button
                            key={btn.id}
                            onClick={() => handleClick(btn.payload)}
                            disabled={isDisabled || btn.disabled}
                            className={`
                                flex items-center gap-2 px-4 py-3 rounded-xl text-xs font-medium
                                transition-all duration-200 border min-w-[130px]
                                ${isSelected
                                    ? 'bg-violet-600 text-white border-violet-600 shadow-lg shadow-violet-500/20 scale-[1.02]'
                                    : isDisabled
                                        ? 'bg-gray-50 text-gray-300 border-gray-100 cursor-not-allowed opacity-40 scale-95'
                                        : 'bg-white text-gray-700 border-gray-200 hover:bg-violet-50 hover:border-violet-300 hover:text-violet-600 active:scale-95'
                                }
                            `}
                        >
                            <div className={`
                                w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0
                                ${isSelected ? 'bg-white/20' : 'bg-gray-100'}
                            `}>
                                {isSelected ? <Check className="w-4 h-4" /> : icon}
                            </div>
                            <span>{btn.label}</span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
