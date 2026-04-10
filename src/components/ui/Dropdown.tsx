'use client';

import { useState, useRef, useEffect, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/* ─── Dropdown ─── */
interface DropdownProps {
    trigger: ReactNode;
    children: ReactNode;
    align?: 'left' | 'right';
    className?: string;
}

function Dropdown({ trigger, children, align = 'left', className }: DropdownProps) {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        function handleClickOutside(e: MouseEvent) {
            if (ref.current && !ref.current.contains(e.target as Node)) {
                setOpen(false);
            }
        }
        if (open) {
            document.addEventListener('mousedown', handleClickOutside);
            return () => document.removeEventListener('mousedown', handleClickOutside);
        }
    }, [open]);

    return (
        <div ref={ref} className={cn('relative', className)}>
            <div onClick={() => setOpen(!open)} className="cursor-pointer">
                {trigger}
            </div>
            {open && (
                <div
                    className={cn(
                        'absolute z-50 mt-1 min-w-[180px] rounded-xl bg-card border border-border shadow-lg overflow-hidden',
                        'animate-fade-in-down',
                        align === 'right' ? 'right-0' : 'left-0'
                    )}
                >
                    <div className="py-1" onClick={() => setOpen(false)}>
                        {children}
                    </div>
                </div>
            )}
        </div>
    );
}

/* ─── DropdownItem ─── */
interface DropdownItemProps {
    children: ReactNode;
    onClick?: () => void;
    icon?: ReactNode;
    danger?: boolean;
    disabled?: boolean;
    className?: string;
}

function DropdownItem({ children, onClick, icon, danger, disabled, className }: DropdownItemProps) {
    return (
        <button
            onClick={onClick}
            disabled={disabled}
            className={cn(
                'flex w-full items-center gap-2 px-3 py-2 text-sm transition-colors',
                'disabled:opacity-50 disabled:pointer-events-none',
                danger
                    ? 'text-destructive hover:bg-destructive/10'
                    : 'text-foreground hover:bg-secondary',
                className
            )}
        >
            {icon && <span className="shrink-0 text-muted-foreground">{icon}</span>}
            {children}
        </button>
    );
}

/* ─── DropdownDivider ─── */
function DropdownDivider() {
    return <div className="my-1 border-t border-border" />;
}

/* ─── DropdownLabel ─── */
function DropdownLabel({ children }: { children: ReactNode }) {
    return (
        <div className="px-3 py-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">
            {children}
        </div>
    );
}

export { Dropdown, DropdownItem, DropdownDivider, DropdownLabel };
