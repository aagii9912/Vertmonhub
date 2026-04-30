import React from 'react';
import { Loader2, CheckCircle, ShoppingCart, User, CreditCard } from 'lucide-react';

interface ToolProcessingIndicatorProps {
    toolName: string;
    status: 'pending' | 'completed';
}

const toolConfig: Record<string, { icon: React.ReactNode; label: string }> = {
    add_to_cart: { icon: <ShoppingCart className="w-3.5 h-3.5" />, label: 'Сагсанд нэмж байна...' },
    checkout: { icon: <CreditCard className="w-3.5 h-3.5" />, label: 'Захиалга үүсгэж байна...' },
    collect_contact_info: { icon: <User className="w-3.5 h-3.5" />, label: 'Мэдээлэл хадгалж байна...' },
};

export function ToolProcessingIndicator({ toolName, status }: ToolProcessingIndicatorProps) {
    const config = toolConfig[toolName] || { icon: null, label: toolName };

    return (
        <div className="flex items-center gap-2 mt-2 ml-10 text-[11px] text-muted-foreground bg-surface-2/60 py-1 px-2 rounded-md border border-border w-fit">
            {status === 'pending' ? (
                <Loader2 className="w-3 h-3 animate-spin text-brand" />
            ) : (
                <CheckCircle className="w-3 h-3 text-status-success" />
            )}
            <span className="flex items-center gap-1">
                {config.icon}
                {status === 'completed' ? config.label.replace('байна...', 'сан!') : config.label}
            </span>
        </div>
    );
}
