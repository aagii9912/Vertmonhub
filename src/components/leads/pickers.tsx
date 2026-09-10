'use client';

import React, { useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/Popover';
import { Pill, Avatar } from '@/components/dashboard/v2/primitives';
import { LEAD_STATUSES, STATUS_META, statusLabel, statusTone } from '@/lib/leads/labels';
import type { ManagerOption } from '@/hooks/useLeads';

/**
 * Inline статус сонгогч — хүснэгтийн нүдэн дээр нь. «Алдсан» сонговол
 * шалтгааныг мөн энд асууна (тусдаа modal биш).
 */
export function StatusPicker({
    value,
    onChange,
    disabled,
    size = 'sm',
}: {
    value: string;
    onChange: (status: string, lostReason?: string) => void;
    disabled?: boolean;
    size?: 'sm' | 'md';
}) {
    const [open, setOpen] = useState(false);
    const [askLost, setAskLost] = useState(false);
    const [reason, setReason] = useState('');

    const pick = (s: string) => {
        if (s === 'closed_lost') {
            setAskLost(true);
            return;
        }
        onChange(s);
        setOpen(false);
    };

    return (
        <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setAskLost(false); }}>
            <PopoverTrigger asChild>
                <button
                    type="button"
                    disabled={disabled}
                    onClick={(e) => e.stopPropagation()}
                    className={cn(
                        'group/pill inline-flex items-center gap-1 rounded-full transition-shadow focus-ring',
                        open && 'ring-2 ring-brand/30',
                        disabled && 'cursor-default',
                    )}
                    aria-label="Статус солих"
                >
                    <Pill tone={statusTone(value)} className={cn(size === 'md' && 'h-6 px-2.5 text-[12px]')}>
                        {statusLabel(value)}
                        {!disabled && <ChevronDown className="h-3 w-3 opacity-60" />}
                    </Pill>
                </button>
            </PopoverTrigger>
            <PopoverContent align="start" sideOffset={4} className="w-[200px] p-1" onClick={(e) => e.stopPropagation()}>
                {!askLost ? (
                    <div className="flex flex-col gap-0.5">
                        {LEAD_STATUSES.map((s) => (
                            <button
                                key={s}
                                type="button"
                                onClick={() => pick(s)}
                                className="flex h-8 items-center gap-2 rounded-md px-1.5 text-left hover:bg-surface-2 focus-ring"
                            >
                                <Pill tone={STATUS_META[s].tone}>{STATUS_META[s].label}</Pill>
                                {s === value && <Check className="ml-auto h-3.5 w-3.5 text-brand" />}
                            </button>
                        ))}
                    </div>
                ) : (
                    <div className="flex flex-col gap-2 p-1.5">
                        <div className="text-[12px] font-medium text-foreground">Алдсан шалтгаан</div>
                        <input
                            autoFocus
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') { onChange('closed_lost', reason.trim() || undefined); setOpen(false); setAskLost(false); setReason(''); }
                            }}
                            placeholder="Үнэ өндөр, өөр төсөл сонгосон…"
                            className="h-[30px] w-full rounded-md border border-border-strong bg-surface px-2 text-[12.5px] outline-none placeholder:text-muted-foreground focus:border-brand"
                        />
                        <div className="flex justify-end gap-1">
                            <button type="button" onClick={() => setAskLost(false)} className="h-7 rounded-md px-2 text-[12px] text-muted-foreground hover:bg-surface-2">Буцах</button>
                            <button
                                type="button"
                                onClick={() => { onChange('closed_lost', reason.trim() || undefined); setOpen(false); setAskLost(false); setReason(''); }}
                                className="h-7 rounded-md bg-brand px-2.5 text-[12px] font-medium text-brand-fg hover:bg-brand-strong"
                            >
                                Алдсан гэж тэмдэглэх
                            </button>
                        </div>
                    </div>
                )}
            </PopoverContent>
        </Popover>
    );
}

/** Inline менежер сонгогч (roster хоосон бол зөвхөн харуулна). */
export function ManagerPicker({
    value,
    options,
    onChange,
    disabled,
}: {
    value: string | null;
    options: ManagerOption[];
    onChange: (name: string | null) => void;
    disabled?: boolean;
}) {
    const [open, setOpen] = useState(false);
    const [q, setQ] = useState('');
    const canPick = !disabled && options.length > 0;
    const list = options.filter((m) => !q || m.name.toLowerCase().includes(q.toLowerCase()));

    const label = (
        <span className="inline-flex min-w-0 items-center gap-2">
            {value ? <Avatar name={value} /> : <span className="inline-block h-5 w-5 rounded-full border border-dashed border-border-strong" />}
            <span className={cn('truncate text-[12.5px]', value ? 'text-foreground' : 'text-muted-foreground')}>{value || 'Хуваарилаагүй'}</span>
            {canPick && <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />}
        </span>
    );
    if (!canPick) return label;

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <button type="button" onClick={(e) => e.stopPropagation()} className={cn('rounded-md px-1 py-0.5 -mx-1 hover:bg-surface-2 focus-ring', open && 'bg-surface-2')} aria-label="Менежер солих">
                    {label}
                </button>
            </PopoverTrigger>
            <PopoverContent align="start" sideOffset={4} className="w-[220px] p-1" onClick={(e) => e.stopPropagation()}>
                <input
                    autoFocus
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Нэрээр хайх…"
                    className="mb-1 h-[30px] w-full rounded-md border border-border bg-surface px-2 text-[12.5px] outline-none placeholder:text-muted-foreground focus:border-brand"
                />
                <div className="flex max-h-56 flex-col gap-0.5 overflow-y-auto">
                    <button type="button" onClick={() => { onChange(null); setOpen(false); }} className="flex h-8 items-center gap-2 rounded-md px-1.5 text-left text-[12.5px] text-muted-foreground hover:bg-surface-2">
                        Хуваарилаагүй
                        {!value && <Check className="ml-auto h-3.5 w-3.5 text-brand" />}
                    </button>
                    {list.map((m) => (
                        <button key={m.name} type="button" onClick={() => { onChange(m.name); setOpen(false); }} className="flex h-8 items-center gap-2 rounded-md px-1.5 text-left text-[12.5px] hover:bg-surface-2">
                            <Avatar name={m.name} />
                            <span className="truncate text-foreground">{m.name}</span>
                            {m.name === value && <Check className="ml-auto h-3.5 w-3.5 text-brand" />}
                        </button>
                    ))}
                    {list.length === 0 && <div className="px-2 py-3 text-center text-[12px] text-muted-foreground">Олдсонгүй</div>}
                </div>
            </PopoverContent>
        </Popover>
    );
}
