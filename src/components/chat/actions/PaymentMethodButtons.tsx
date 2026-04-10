import React, { useState } from 'react';
import { Smartphone, CreditCard, Building2, QrCode } from 'lucide-react';
import type { ChatAction } from '@/types/ai';

interface PaymentMethodButtonsProps {
    action: ChatAction;
    onAction: (payload: string, context?: Record<string, unknown>) => void;
}

const paymentIcons: Record<string, React.ReactNode> = {
    qpay: <QrCode className="w-4 h-4" />,
    socialpay: <Smartphone className="w-4 h-4" />,
    card: <CreditCard className="w-4 h-4" />,
    bank: <Building2 className="w-4 h-4" />,
};

const paymentColors: Record<string, { bg: string; border: string; text: string; selected: string }> = {
    qpay: {
        bg: 'hover:bg-blue-50',
        border: 'border-blue-100 hover:border-blue-300',
        text: 'text-blue-700',
        selected: 'bg-blue-500 border-blue-500 text-white shadow-lg shadow-blue-500/20',
    },
    socialpay: {
        bg: 'hover:bg-emerald-50',
        border: 'border-emerald-100 hover:border-emerald-300',
        text: 'text-emerald-700',
        selected: 'bg-emerald-500 border-emerald-500 text-white shadow-lg shadow-emerald-500/20',
    },
    card: {
        bg: 'hover:bg-violet-50',
        border: 'border-violet-100 hover:border-violet-300',
        text: 'text-violet-700',
        selected: 'bg-violet-500 border-violet-500 text-white shadow-lg shadow-violet-500/20',
    },
    bank: {
        bg: 'hover:bg-amber-50',
        border: 'border-amber-100 hover:border-amber-300',
        text: 'text-amber-700',
        selected: 'bg-amber-500 border-amber-500 text-white shadow-lg shadow-amber-500/20',
    },
};

export function PaymentMethodButtons({ action, onAction }: PaymentMethodButtonsProps) {
    const [selected, setSelected] = useState<string | null>(null);

    const handleClick = (payload: string) => {
        if (selected) return;
        setSelected(payload);
        onAction(payload, action.context);
    };

    return (
        <div className="mt-2 ml-10 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <p className="text-[10px] text-gray-400 mb-2 font-medium uppercase tracking-wider">
                Төлбөрийн хэрэгсэл сонгоно уу
            </p>
            <div className="grid grid-cols-2 gap-2 max-w-[280px]">
                {action.buttons.map((btn) => {
                    const key = btn.icon || btn.id;
                    const icon = paymentIcons[key] || <CreditCard className="w-4 h-4" />;
                    const colors = paymentColors[key] || paymentColors.card;
                    const isSelected = selected === btn.payload;
                    const isDisabled = selected !== null && !isSelected;

                    return (
                        <button
                            key={btn.id}
                            onClick={() => handleClick(btn.payload)}
                            disabled={isDisabled || btn.disabled}
                            className={`
                                flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-medium
                                transition-all duration-200 border
                                ${isSelected
                                    ? colors.selected + ' scale-[1.02]'
                                    : isDisabled
                                        ? 'bg-gray-50 text-gray-300 border-gray-100 cursor-not-allowed opacity-40 scale-95'
                                        : `bg-white ${colors.text} ${colors.border} ${colors.bg} active:scale-95`
                                }
                            `}
                        >
                            {icon}
                            <span>{btn.label}</span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
