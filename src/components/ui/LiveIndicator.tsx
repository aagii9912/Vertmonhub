import React from 'react';

interface LiveIndicatorProps {
    label?: string;
}

export function LiveIndicator({ label = 'Live' }: LiveIndicatorProps) {
    return (
        <div className="flex items-center gap-2 bg-status-success-soft px-2.5 py-1 rounded-full border border-status-success/20">
            <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-status-success opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-status-success" />
            </span>
            <span className="text-[10px] font-medium text-status-success uppercase tracking-[0.16em]">{label}</span>
        </div>
    );
}
