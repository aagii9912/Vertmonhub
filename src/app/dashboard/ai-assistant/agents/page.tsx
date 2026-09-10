'use client';

import React from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { BarChart3, Building2, Handshake, Wallet, Compass, ShieldCheck, Megaphone, Bot, ArrowLeft, Eye, PenLine, Trash2, KeyRound } from 'lucide-react';
import { cn } from '@/lib/utils';
import { usePageTitle } from '@/lib/navigation/pageTitle';
import { Panel, Pill, Skeleton } from '@/components/dashboard/v2/primitives';

interface AgentInfo {
    id: string; name: string; description: string; temperature: number;
    readTools: string[]; writeTools: string[]; deleteTools: string[]; adminTools: string[]; adminOnly: boolean;
}

const ICON: Record<string, React.ElementType> = {
    'data-analyst': BarChart3, 'property-expert': Building2, 'crm-specialist': Handshake, 'finance-analyst': Wallet,
    advisor: Compass, 'operations-admin': ShieldCheck, 'marketing-specialist': Megaphone,
};

/**
 * AI агентууд — orchestrator-ын мэргэжилтнүүд, тэдний эрх (tool) тодорхой харагдана.
 * Бичих/устгах tool бүр хэрэглэгчийн баталгаажуулалтаар л гүйцэтгэгдэнэ.
 */
export default function AgentsPage() {
    usePageTitle('AI агентууд');
    const { data, isLoading } = useQuery<{ agents: AgentInfo[]; model: string }>({
        queryKey: ['ai-agents'],
        queryFn: async () => { const r = await fetch('/api/ai-assistant/agents'); if (!r.ok) throw new Error('failed'); return r.json(); },
        staleTime: 5 * 60_000,
    });

    return (
        <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2">
                <Link href="/dashboard/ai-assistant" className="inline-flex h-[30px] items-center gap-1 rounded-md px-2 text-[12.5px] text-muted-foreground hover:bg-surface-2 hover:text-foreground"><ArrowLeft className="h-4 w-4" /> AI туслах</Link>
                <p className="text-[13px] text-muted-foreground">Асуулт бүрийг төлөвлөгч шинжилж 1–3 мэргэжилтэнд хуваарилна. Мэргэжилтэн бүр зөвхөн өөрийн tool-уудыг ашиглана.</p>
                {data?.model && <span className="mono-label ml-auto rounded-md border border-border bg-surface px-2 py-0.5 text-[11px] text-muted-foreground">модел · {data.model}</span>}
            </div>

            {isLoading ? (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-40" />)}</div>
            ) : (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {(data?.agents ?? []).map((a) => {
                        const Icon = ICON[a.id] ?? Bot;
                        return (
                            <Panel key={a.id} bodyClassName="flex flex-col gap-3 p-4">
                                <div className="flex items-start gap-3">
                                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-brand-soft text-brand"><Icon className="h-4 w-4" strokeWidth={1.75} /></span>
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2">
                                            <h3 className="truncate text-[13.5px] font-semibold text-foreground">{a.name}</h3>
                                            {a.adminOnly && <Pill tone="pending"><KeyRound className="h-3 w-3" /> super_admin</Pill>}
                                        </div>
                                        <p className="mt-0.5 text-[12.5px] leading-snug text-muted-foreground">{a.description}</p>
                                    </div>
                                </div>
                                <ToolRow icon={Eye} label="Унших" tools={a.readTools} />
                                <ToolRow icon={PenLine} label="Бичих (баталгаажуулалттай)" tools={a.writeTools} tone="brand" />
                                {a.deleteTools.length > 0 && <ToolRow icon={Trash2} label="Устгах (баталгаажуулалттай)" tools={a.deleteTools} tone="danger" />}
                                {a.adminTools.length > 0 && <ToolRow icon={KeyRound} label="Админ" tools={a.adminTools} tone="pending" />}
                            </Panel>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

function ToolRow({ icon: Icon, label, tools, tone }: { icon: React.ElementType; label: string; tools: string[]; tone?: 'brand' | 'danger' | 'pending' }) {
    if (!tools.length) return null;
    return (
        <div className="flex flex-col gap-1">
            <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.04em] text-muted-foreground"><Icon className="h-3 w-3" /> {label} <span className="mono-label normal-case tracking-normal">{tools.length}</span></div>
            <div className="flex flex-wrap gap-1">
                {tools.map((t) => (
                    <span key={t} className={cn('mono-label rounded border px-1.5 py-0.5 text-[10.5px]', tone === 'brand' ? 'border-brand/30 bg-brand-soft text-brand' : tone === 'danger' ? 'border-status-danger/30 bg-status-danger-soft text-status-danger' : tone === 'pending' ? 'border-status-pending/30 bg-status-pending-soft text-status-pending' : 'border-border bg-surface-2 text-fg-2')}>{t}</span>
                ))}
            </div>
        </div>
    );
}
